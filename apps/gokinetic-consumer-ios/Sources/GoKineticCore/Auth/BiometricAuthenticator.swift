import Foundation
#if canImport(LocalAuthentication)
import LocalAuthentication
#endif

public enum BiometryKind: String, Sendable {
    case none
    case touchID
    case faceID
    case opticID
}

/// Biometric unlock abstraction so view models never touch
/// `LocalAuthentication` directly and tests can script outcomes.
public protocol BiometricAuthenticating: Sendable {
    func availableBiometry() -> BiometryKind
    /// Returns true on success, false if the user cancelled or fell back.
    func authenticate(reason: String) async throws -> Bool
}

#if canImport(LocalAuthentication)
public struct LocalBiometricAuthenticator: BiometricAuthenticating {
    public init() {}

    public func availableBiometry() -> BiometryKind {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else { return .none }
        switch context.biometryType {
        case .faceID: return .faceID
        case .touchID: return .touchID
        default:
            if #available(iOS 17.0, macOS 14.0, *), context.biometryType == .opticID { return .opticID }
            return .none
        }
    }

    public func authenticate(reason: String) async throws -> Bool {
        let context = LAContext()
        context.localizedFallbackTitle = ""
        var policyError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &policyError) else {
            throw AuthError.biometricUnavailable
        }
        do {
            return try await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason)
        } catch let error as LAError {
            switch error.code {
            case .userCancel, .appCancel, .systemCancel, .userFallback:
                return false
            case .biometryNotAvailable, .biometryNotEnrolled, .biometryLockout:
                throw AuthError.biometricUnavailable
            default:
                throw AuthError.biometricFailed
            }
        }
    }
}
#endif
