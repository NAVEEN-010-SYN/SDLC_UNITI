import Foundation

public protocol AccountRepository: Sendable {
    func profile(forceRefresh: Bool) async throws -> UserProfile
    func summary(forceRefresh: Bool) async throws -> AccountSummary
    func updateContact(email: String?, phone: String?) async throws -> UserProfile
    func clearCache() async
}

enum AccountEndpoints {
    static func profile() -> Endpoint<UserProfile> {
        Endpoint(path: "/me")
    }

    static func summary() -> Endpoint<AccountSummary> {
        Endpoint(path: "/me/account")
    }

    struct ContactUpdate: Encodable {
        let email: String?
        let phone: String?
    }

    static func updateContact(_ body: ContactUpdate) throws -> Endpoint<UserProfile> {
        try Endpoint(path: "/me", method: .patch, jsonBody: body)
    }
}

public final class LiveAccountRepository: AccountRepository {
    private let client: APIClientProtocol
    private let profileCache: TTLCache<String, UserProfile>
    private let summaryCache: TTLCache<String, AccountSummary>

    public init(client: APIClientProtocol, clock: Clock = SystemClock()) {
        self.client = client
        self.profileCache = TTLCache(ttl: 15 * 60, clock: clock)
        self.summaryCache = TTLCache(ttl: 60, clock: clock)
    }

    public func profile(forceRefresh: Bool) async throws -> UserProfile {
        let client = self.client
        return try await profileCache.value(for: "me", forceRefresh: forceRefresh) {
            try await client.send(AccountEndpoints.profile())
        }
    }

    public func summary(forceRefresh: Bool) async throws -> AccountSummary {
        let client = self.client
        do {
            return try await summaryCache.value(for: "account", forceRefresh: forceRefresh) {
                try await client.send(AccountEndpoints.summary())
            }
        } catch APIError.offline {
            // Prefer a stale dashboard over an error screen when offline.
            if let stale = await summaryCache.staleValue(for: "account") { return stale }
            throw APIError.offline
        }
    }

    public func updateContact(email: String?, phone: String?) async throws -> UserProfile {
        let normalizedEmail = email?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let normalizedEmail, !ContactValidator.isValidEmail(normalizedEmail) {
            throw APIError.validation(ProblemDetails(title: "Invalid email", errors: ["email": ["Enter a valid email address."]]))
        }
        let normalizedPhone = phone.map(ContactValidator.normalizePhone)
        if let normalizedPhone, normalizedPhone == nil {
            throw APIError.validation(ProblemDetails(title: "Invalid phone", errors: ["phone": ["Enter a valid phone number."]]))
        }
        let updated = try await client.send(AccountEndpoints.updateContact(.init(email: normalizedEmail, phone: normalizedPhone ?? nil)))
        await profileCache.store(updated, for: "me")
        return updated
    }

    public func clearCache() async {
        await profileCache.invalidateAll()
        await summaryCache.invalidateAll()
    }
}

public enum ContactValidator {
    public static func isValidEmail(_ email: String) -> Bool {
        let parts = email.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty, parts[0].count <= 64 else { return false }
        let domain = parts[1]
        let labels = domain.split(separator: ".", omittingEmptySubsequences: false)
        guard labels.count >= 2, labels.allSatisfy({ !$0.isEmpty && !$0.hasPrefix("-") && !$0.hasSuffix("-") }) else { return false }
        guard let tld = labels.last, tld.count >= 2, tld.allSatisfy(\.isLetter) else { return false }
        return !email.contains(where: \.isWhitespace)
    }

    /// Normalizes to E.164 (`+15551234567`). US/CA 10-digit numbers get +1.
    /// Returns nil for anything that can't be a valid phone number.
    public static func normalizePhone(_ raw: String) -> String? {
        let hasPlus = raw.trimmingCharacters(in: .whitespaces).hasPrefix("+")
        let digits = raw.filter(\.isNumber)
        let count = digits.count
        if hasPlus {
            return (8...15).contains(count) ? "+" + digits : nil
        }
        if count == 10 {
            return "+1" + digits
        }
        if count == 11 && digits.hasPrefix("1") {
            return "+" + digits
        }
        return nil
    }
}
