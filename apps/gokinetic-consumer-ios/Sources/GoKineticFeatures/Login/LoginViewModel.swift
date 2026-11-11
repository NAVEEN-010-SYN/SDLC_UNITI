import Foundation
import GoKineticCore

@MainActor
public final class LoginViewModel: ObservableObject {
    @Published public private(set) var isSigningIn = false
    @Published public private(set) var errorMessageKey: String?
    @Published public var loginHint = ""

    private let session: AuthSession
    private let analytics: AnalyticsTracking

    public init(session: AuthSession, analytics: AnalyticsTracking) {
        self.session = session
        self.analytics = analytics
    }

    public func signIn() async {
        guard !isSigningIn else { return }
        isSigningIn = true
        errorMessageKey = nil
        analytics.track(.loginStarted)
        defer { isSigningIn = false }

        let hint = loginHint.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await session.signIn(loginHint: hint.isEmpty ? nil : hint)
            analytics.track(.loginSucceeded(method: "oidc"))
        } catch {
            let (key, reason) = Self.describe(error)
            errorMessageKey = key
            if let reason { analytics.track(.loginFailed(reason: reason)) }
        }
    }

    /// Maps sign-in failures to copy. Cancellation is silent: the user
    /// closed the browser sheet on purpose.
    static func describe(_ error: Error) -> (key: String?, reason: String?) {
        switch error {
        case AuthError.userCancelled:
            return (nil, nil)
        case AuthError.roleNotPermitted:
            return ("login.notConsumer", "role")
        case AuthError.stateMismatch, AuthError.nonceMismatch, AuthError.invalidCallback:
            return ("login.error.security", "callback")
        case AuthError.provider(let code, _):
            return ("login.error.provider", code)
        case AuthError.tokenExchangeFailed, AuthError.invalidTokenResponse:
            return ("login.error.generic", "token")
        case APIError.offline, APIError.timedOut:
            return ("error.offline", "offline")
        default:
            return ("login.error.generic", "unknown")
        }
    }
}

@MainActor
public final class BiometricLockViewModel: ObservableObject {
    @Published public private(set) var isAuthenticating = false
    @Published public private(set) var failed = false
    public let biometry: BiometryKind

    private let session: AuthSession
    private let analytics: AnalyticsTracking
    private let reason: String
    private var hasAutoPrompted = false

    public init(session: AuthSession, biometrics: BiometricAuthenticating, analytics: AnalyticsTracking, reason: String) {
        self.session = session
        self.analytics = analytics
        self.reason = reason
        self.biometry = biometrics.availableBiometry()
    }

    public var symbolName: String {
        switch biometry {
        case .faceID: return "faceid"
        case .touchID: return "touchid"
        case .opticID: return "opticid"
        case .none: return "lock.fill"
        }
    }

    /// Prompts automatically once when the lock screen first appears.
    public func onAppear() async {
        guard !hasAutoPrompted else { return }
        hasAutoPrompted = true
        await unlock()
    }

    public func unlock() async {
        guard !isAuthenticating else { return }
        isAuthenticating = true
        failed = false
        defer { isAuthenticating = false }
        do {
            let success = try await session.unlockWithBiometrics(reason: reason)
            failed = !success
            analytics.track(.biometricUnlock(success: success))
        } catch {
            failed = true
            analytics.track(.biometricUnlock(success: false))
        }
    }

    /// Falls back to a full OIDC login, discarding the stored session.
    public func usePasswordInstead() async {
        await session.signOut()
    }
}
