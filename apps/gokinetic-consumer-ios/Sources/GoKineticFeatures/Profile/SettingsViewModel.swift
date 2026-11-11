import Foundation
import GoKineticCore
import GoKineticUI

/// Seam over the session's biometric-unlock flag so settings can be tested
/// without a Keychain-backed `AuthSession`.
public protocol BiometricUnlockControlling: Sendable {
    func isBiometricUnlockEnabled() async -> Bool
    func setBiometricUnlock(enabled: Bool) async throws
}

extension AuthSession: BiometricUnlockControlling {
    public func isBiometricUnlockEnabled() async -> Bool { biometricUnlockEnabled }
}

/// Notification preferences, biometric unlock, analytics consent and
/// sign-out.
@MainActor
public final class SettingsViewModel: ObservableObject {
    @Published public private(set) var notifications: ViewState<NotificationPreferences> = .idle
    @Published public private(set) var isSavingNotifications = false
    @Published public private(set) var biometricUnlockEnabled = false
    @Published public private(set) var analyticsEnabled: Bool
    @Published public private(set) var isSigningOut = false
    @Published public var error: UserFacingError?

    public let biometry: BiometryKind
    public let appVersion: String
    private let notificationRepository: NotificationRepository
    private let biometricUnlock: BiometricUnlockControlling
    private let biometrics: BiometricAuthenticating
    private let analytics: AnalyticsService
    private let preferences: PreferencesStore
    private let signOutAction: () async -> Void
    /// Last preferences the server confirmed; the rollback target.
    private var confirmed: NotificationPreferences?

    public init(notifications: NotificationRepository, biometricUnlock: BiometricUnlockControlling,
                biometrics: BiometricAuthenticating, analytics: AnalyticsService, preferences: PreferencesStore,
                appVersion: String, signOut: @escaping () async -> Void) {
        self.notificationRepository = notifications
        self.biometricUnlock = biometricUnlock
        self.biometrics = biometrics
        self.analytics = analytics
        self.preferences = preferences
        self.appVersion = appVersion
        self.signOutAction = signOut
        self.biometry = biometrics.availableBiometry()
        self.analyticsEnabled = analytics.enabled
    }

    public func load() async {
        biometricUnlockEnabled = await biometricUnlock.isBiometricUnlockEnabled()
        notifications = notifications.reloading()
        do {
            let prefs = try await notificationRepository.preferences()
            confirmed = prefs
            notifications = .loaded(prefs)
        } catch {
            notifications = notifications.failing(error)
        }
    }

    // MARK: Notifications

    /// Applies the toggle immediately, then saves. Toggles flipped while a
    /// save is in flight are coalesced into one follow-up save of the latest
    /// state; on failure the screen returns to what the server last confirmed.
    public func setNotification(_ keyPath: WritableKeyPath<NotificationPreferences, Bool>, to value: Bool) async {
        guard var desired = notifications.value, desired[keyPath: keyPath] != value else { return }
        desired[keyPath: keyPath] = value
        notifications = .loaded(desired)
        guard !isSavingNotifications else { return }

        isSavingNotifications = true
        defer { isSavingNotifications = false }
        var lastSent: NotificationPreferences?
        while let target = notifications.value, target != lastSent {
            lastSent = target
            do {
                confirmed = try await notificationRepository.updatePreferences(target)
            } catch {
                if let confirmed { notifications = .loaded(confirmed) }
                self.error = UserFacingError(error)
                return
            }
        }
        if let confirmed { notifications = .loaded(confirmed) }
    }

    // MARK: Security

    public var biometricsAvailable: Bool { biometry != .none }

    /// Enabling requires a successful biometric check first so a device
    /// whose biometrics belong to someone else can't silently opt in.
    public func setBiometricUnlock(_ enabled: Bool) async {
        guard enabled != biometricUnlockEnabled, biometricsAvailable || !enabled else { return }
        do {
            if enabled {
                let confirmedByUser = try await biometrics.authenticate(reason: L10n.string("settings.biometricReason"))
                guard confirmedByUser else { return }
            }
            try await biometricUnlock.setBiometricUnlock(enabled: enabled)
            biometricUnlockEnabled = enabled
        } catch {
            self.error = UserFacingError(kind: .unknown, titleKey: "settings.biometricFailed", isRetryable: true)
        }
    }

    // MARK: Privacy

    public func setAnalyticsEnabled(_ enabled: Bool) {
        preferences.analyticsOptIn = enabled
        analytics.setEnabled(enabled)
        analyticsEnabled = enabled
    }

    // MARK: Session

    public func signOut() async {
        guard !isSigningOut else { return }
        isSigningOut = true
        defer { isSigningOut = false }
        await signOutAction()
    }
}
