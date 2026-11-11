import Foundation
#if canImport(Security)
import Security
#endif

/// Minimal secure key/value storage. Production uses the Keychain.
public protocol SecureStore: Sendable {
    func data(for key: String) throws -> Data?
    func set(_ data: Data, for key: String) throws
    func remove(_ key: String) throws
}

#if canImport(Security)
/// Keychain-backed store. Items are `WhenUnlockedThisDeviceOnly` so tokens
/// never migrate to backups or another device.
public struct KeychainSecureStore: SecureStore {
    private let service: String
    private let accessGroup: String?

    public init(service: String = "com.gokinetic.consumer.auth", accessGroup: String? = nil) {
        self.service = service
        self.accessGroup = accessGroup
    }

    private func baseQuery(for key: String) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }
        return query
    }

    public func data(for key: String) throws -> Data? {
        var query = baseQuery(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess: return result as? Data
        case errSecItemNotFound: return nil
        default: throw AuthError.keychain(status: status)
        }
    }

    public func set(_ data: Data, for key: String) throws {
        let query = baseQuery(for: key)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else { throw AuthError.keychain(status: updateStatus) }

        var insert = query
        attributes.forEach { insert[$0.key] = $0.value }
        let addStatus = SecItemAdd(insert as CFDictionary, nil)
        guard addStatus == errSecSuccess else { throw AuthError.keychain(status: addStatus) }
    }

    public func remove(_ key: String) throws {
        let status = SecItemDelete(baseQuery(for: key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw AuthError.keychain(status: status)
        }
    }
}
#endif

/// Typed persistence of the token set and the biometric preference on top
/// of a `SecureStore`.
public struct TokenStore: Sendable {
    static let tokensKey = "oidc.tokens"
    static let biometricKey = "auth.biometricEnabled"

    private let store: SecureStore

    public init(store: SecureStore) {
        self.store = store
    }

    public func load() throws -> TokenSet? {
        guard let data = try store.data(for: Self.tokensKey) else { return nil }
        do {
            return try JSONCoding.decoder.decode(TokenSet.self, from: data)
        } catch {
            // A corrupt entry is unrecoverable; clear it so the user can sign in.
            try? store.remove(Self.tokensKey)
            return nil
        }
    }

    public func save(_ tokens: TokenSet) throws {
        try store.set(try JSONCoding.encoder.encode(tokens), for: Self.tokensKey)
    }

    public func clear() throws {
        try store.remove(Self.tokensKey)
    }

    public var isBiometricUnlockEnabled: Bool {
        (try? store.data(for: Self.biometricKey)).flatMap { $0 }.map { $0 == Data([1]) } ?? false
    }

    public func setBiometricUnlockEnabled(_ enabled: Bool) throws {
        if enabled {
            try store.set(Data([1]), for: Self.biometricKey)
        } else {
            try store.remove(Self.biometricKey)
        }
    }
}
