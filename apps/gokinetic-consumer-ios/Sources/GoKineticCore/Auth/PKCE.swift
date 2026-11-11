import Foundation
import CryptoKit
#if canImport(Security)
import Security
#endif

/// Proof Key for Code Exchange (RFC 7636) using the S256 method.
public struct PKCE: Sendable, Equatable {
    public let verifier: String
    public let challenge: String
    public let method = "S256"

    /// Unreserved characters allowed in a code verifier (RFC 7636 §4.1).
    static let verifierAlphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

    public init(verifier: String) throws {
        guard PKCE.isValidVerifier(verifier) else { throw PKCEError.invalidVerifier }
        self.verifier = verifier
        self.challenge = PKCE.challenge(for: verifier)
    }

    /// Generates a fresh 64-character verifier from a CSPRNG.
    public static func generate(length: Int = 64, randomBytes: (Int) throws -> [UInt8] = secureRandomBytes) throws -> PKCE {
        guard (43...128).contains(length) else { throw PKCEError.invalidVerifier }
        let bytes = try randomBytes(length)
        // Rejection-free mapping: the alphabet has 66 symbols, so take each
        // byte modulo 66. The slight bias is irrelevant at 64 chars of entropy
        // well above the RFC's 256-bit recommendation.
        let verifier = String(bytes.map { verifierAlphabet[Int($0) % verifierAlphabet.count] })
        return try PKCE(verifier: verifier)
    }

    public static func challenge(for verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest).base64URLEncodedString()
    }

    public static func isValidVerifier(_ verifier: String) -> Bool {
        (43...128).contains(verifier.count) && verifier.allSatisfy { verifierAlphabet.contains($0) }
    }

    public static func secureRandomBytes(_ count: Int) throws -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: count)
        #if canImport(Security)
        let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        guard status == errSecSuccess else { throw PKCEError.randomGenerationFailed }
        #else
        var generator = SystemRandomNumberGenerator()
        for index in bytes.indices { bytes[index] = UInt8.random(in: .min ... .max, using: &generator) }
        #endif
        return bytes
    }

    /// Random URL-safe token for `state` and `nonce`.
    public static func randomToken(byteCount: Int = 32) throws -> String {
        Data(try secureRandomBytes(byteCount)).base64URLEncodedString()
    }
}

public enum PKCEError: Error, Equatable {
    case invalidVerifier
    case randomGenerationFailed
}

public extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    init?(base64URLEncoded string: String) {
        var base64 = string
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = base64.count % 4
        if remainder == 1 { return nil }
        if remainder > 0 { base64 += String(repeating: "=", count: 4 - remainder) }
        self.init(base64Encoded: base64)
    }
}
