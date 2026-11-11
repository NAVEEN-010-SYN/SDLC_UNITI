import Foundation
import GoKineticCore
import GoKineticUI

/// Edit a Wi-Fi network's name, security mode and (optionally) passphrase.
@MainActor
public final class WiFiSettingsViewModel: ObservableObject {
    @Published public var ssid: String
    @Published public var security: WiFiSecurity
    @Published public var changePassphrase = false
    @Published public var passphrase = ""
    @Published public var confirmation = ""
    @Published public private(set) var isSaving = false
    @Published public private(set) var saved: WiFiNetwork?
    @Published public private(set) var saveError: UserFacingError?
    @Published private var attemptedSave = false

    public let network: WiFiNetwork
    private let routerId: String
    private let router: RouterRepository
    private let analytics: AnalyticsTracking

    public init(routerId: String, network: WiFiNetwork, router: RouterRepository, analytics: AnalyticsTracking) {
        self.routerId = routerId
        self.network = network
        self.router = router
        self.analytics = analytics
        self.ssid = network.ssid
        self.security = network.security
    }

    public var validation: ValidationResult {
        WiFiCredentialsValidator.validate(ssid: ssid, passphrase: changePassphrase ? passphrase : nil,
                                          confirmation: changePassphrase ? confirmation : nil)
    }

    public func message(for field: String) -> String? {
        guard attemptedSave || field == "passphrase" && !passphrase.isEmpty,
              let key = validation.message(for: field) else { return nil }
        return L10n.string(key)
    }

    public var strength: WiFiCredentialsValidator.Strength? {
        guard changePassphrase, !passphrase.isEmpty else { return nil }
        return WiFiCredentialsValidator.passphraseStrength(passphrase)
    }

    public var hasChanges: Bool {
        ssid != network.ssid || security != network.security || changePassphrase
    }

    /// Changing the name or passphrase disconnects every device, including
    /// possibly this phone; the view warns before saving.
    public var disconnectsDevices: Bool {
        ssid != network.ssid || changePassphrase
    }

    public func save() async {
        attemptedSave = true
        guard hasChanges, validation.isValid, !isSaving else { return }
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        let request = WiFiUpdateRequest(networkId: network.id, ssid: ssid,
                                        passphrase: changePassphrase ? passphrase : nil, security: security)
        do {
            saved = try await router.updateWiFi(routerId: routerId, request)
            analytics.track(.wifiUpdated(changedPassphrase: changePassphrase))
            passphrase = ""
            confirmation = ""
        } catch {
            saveError = UserFacingError(error)
        }
    }
}
