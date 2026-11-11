import Foundation

/// Roles defined by the platform conventions. The consumer app only admits
/// `CONSUMER`, but decoding keeps unknown roles rather than failing.
public enum UserRole: String, Codable, Sendable, CaseIterable {
    case consumer = "CONSUMER"
    case businessAdmin = "BUSINESS_ADMIN"
    case businessUser = "BUSINESS_USER"
    case partnerAdmin = "PARTNER_ADMIN"
    case partnerAgent = "PARTNER_AGENT"
    case wholesaleBuyer = "WHOLESALE_BUYER"
    case supportAgent = "SUPPORT_AGENT"
}

/// Account identifier in the `ACC-########` format.
public struct AccountID: RawRepresentable, Codable, Hashable, Sendable, CustomStringConvertible {
    public let rawValue: String

    public init?(rawValue: String) {
        guard AccountID.isValid(rawValue) else { return nil }
        self.rawValue = rawValue
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        guard let value = AccountID(rawValue: raw) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid account id \(raw)")
        }
        self = value
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    public static func isValid(_ raw: String) -> Bool {
        guard raw.count == 12, raw.hasPrefix("ACC-") else { return false }
        return raw.dropFirst(4).allSatisfy { ("0"..."9").contains($0) }
    }

    /// Masked form for display in shared spaces, e.g. `ACC-••••5678`.
    public var masked: String {
        "ACC-••••" + rawValue.suffix(4)
    }

    public var description: String { rawValue }
}

public struct PostalAddress: Codable, Hashable, Sendable {
    public let line1: String
    public let line2: String?
    public let city: String
    public let region: String
    public let postalCode: String
    public let country: String

    public init(line1: String, line2: String? = nil, city: String, region: String, postalCode: String, country: String) {
        self.line1 = line1
        self.line2 = line2
        self.city = city
        self.region = region
        self.postalCode = postalCode
        self.country = country
    }

    public var singleLine: String {
        [line1, line2, city, "\(region) \(postalCode)"]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }
}

public struct UserProfile: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let firstName: String
    public let lastName: String
    public let email: String
    public let phone: String?
    public let roles: [String]
    public let accountId: AccountID

    public init(id: String, firstName: String, lastName: String, email: String, phone: String?, roles: [String], accountId: AccountID) {
        self.id = id
        self.firstName = firstName
        self.lastName = lastName
        self.email = email
        self.phone = phone
        self.roles = roles
        self.accountId = accountId
    }

    public var displayName: String {
        let full = "\(firstName) \(lastName)".trimmingCharacters(in: .whitespaces)
        return full.isEmpty ? email : full
    }

    public var initials: String {
        let letters = [firstName.first, lastName.first].compactMap { $0 }
        return letters.isEmpty ? String(email.prefix(1)).uppercased() : String(letters).uppercased()
    }

    public var isConsumer: Bool { roles.contains(UserRole.consumer.rawValue) }
}

public enum ServiceStatus: String, Codable, Sendable {
    case active = "ACTIVE"
    case provisioning = "PROVISIONING"
    case suspended = "SUSPENDED"
    case cancelled = "CANCELLED"
}

/// An active product instance on the account tied to a service address.
public struct Service: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let productName: String
    public let planId: String
    public let status: ServiceStatus
    public let address: PostalAddress
    public let activatedAt: Date?

    public init(id: String, productName: String, planId: String, status: ServiceStatus, address: PostalAddress, activatedAt: Date?) {
        self.id = id
        self.productName = productName
        self.planId = planId
        self.status = status
        self.address = address
        self.activatedAt = activatedAt
    }
}

public struct AccountSummary: Codable, Hashable, Sendable {
    public let accountId: AccountID
    public let holderName: String
    public let balance: Money
    public let nextBillDate: Date?
    public let autopayEnabled: Bool
    public let services: [Service]

    public init(accountId: AccountID, holderName: String, balance: Money, nextBillDate: Date?, autopayEnabled: Bool, services: [Service]) {
        self.accountId = accountId
        self.holderName = holderName
        self.balance = balance
        self.nextBillDate = nextBillDate
        self.autopayEnabled = autopayEnabled
        self.services = services
    }

    /// The broadband service the consumer app focuses on.
    public var primaryService: Service? {
        services.first { $0.status == .active } ?? services.first
    }
}

/// Standard paginated response shape: `{ items, page, pageSize, total }`.
public struct Page<Item: Codable & Sendable>: Codable, Sendable {
    public let items: [Item]
    public let page: Int
    public let pageSize: Int
    public let total: Int

    public init(items: [Item], page: Int, pageSize: Int, total: Int) {
        self.items = items
        self.page = page
        self.pageSize = pageSize
        self.total = total
    }

    public var hasMore: Bool { page * pageSize < total }
    public var nextPage: Int? { hasMore ? page + 1 : nil }
}

extension Page: Equatable where Item: Equatable {}
