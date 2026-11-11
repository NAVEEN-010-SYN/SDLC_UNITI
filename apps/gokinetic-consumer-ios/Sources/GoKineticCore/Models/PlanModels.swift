import Foundation

/// A fibre broadband tier. Speeds are in Mbps (symmetric fibre unless noted).
public struct Plan: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let downloadMbps: Int
    public let uploadMbps: Int
    public let monthlyPrice: Money
    public let contractMonths: Int
    public let features: [String]
    public let dataCapGB: Int?

    public init(id: String, name: String, downloadMbps: Int, uploadMbps: Int, monthlyPrice: Money, contractMonths: Int, features: [String], dataCapGB: Int? = nil) {
        self.id = id
        self.name = name
        self.downloadMbps = downloadMbps
        self.uploadMbps = uploadMbps
        self.monthlyPrice = monthlyPrice
        self.contractMonths = contractMonths
        self.features = features
        self.dataCapGB = dataCapGB
    }

    public var isUnlimited: Bool { dataCapGB == nil }

    /// "1 Gbps" for 1000, "500 Mbps" for 500, "2.5 Gbps" for 2500.
    public var speedLabel: String {
        Plan.speedLabel(mbps: downloadMbps)
    }

    public static func speedLabel(mbps: Int) -> String {
        guard mbps >= 1000 else { return "\(mbps) Mbps" }
        if mbps % 1000 == 0 { return "\(mbps / 1000) Gbps" }
        let tenths = (mbps + 50) / 100
        return "\(tenths / 10).\(tenths % 10) Gbps"
    }

    public func isUpgrade(from other: Plan) -> Bool {
        downloadMbps > other.downloadMbps
            || (downloadMbps == other.downloadMbps && uploadMbps > other.uploadMbps)
    }
}

public struct CurrentPlan: Codable, Hashable, Sendable {
    public let serviceId: String
    public let plan: Plan
    public let contractEndDate: Date?
    public let pendingChange: PendingPlanChange?

    public init(serviceId: String, plan: Plan, contractEndDate: Date?, pendingChange: PendingPlanChange?) {
        self.serviceId = serviceId
        self.plan = plan
        self.contractEndDate = contractEndDate
        self.pendingChange = pendingChange
    }

    public func monthsRemaining(asOf date: Date, calendar: Calendar = .gregorianUTC) -> Int {
        guard let end = contractEndDate, end > date else { return 0 }
        let components = calendar.dateComponents([.month, .day], from: date, to: end)
        let months = components.month ?? 0
        return (components.day ?? 0) > 0 ? months + 1 : months
    }
}

public struct PendingPlanChange: Codable, Hashable, Sendable {
    public let orderId: String
    public let targetPlanName: String
    public let status: OrderStatus
    public let effectiveDate: Date?

    public init(orderId: String, targetPlanName: String, status: OrderStatus, effectiveDate: Date?) {
        self.orderId = orderId
        self.targetPlanName = targetPlanName
        self.status = status
        self.effectiveDate = effectiveDate
    }
}

/// Order lifecycle: DRAFT -> SUBMITTED -> VALIDATED -> PROVISIONING -> ACTIVE
/// (or CANCELLED / FAILED).
public enum OrderStatus: String, Codable, Sendable, CaseIterable {
    case draft = "DRAFT"
    case submitted = "SUBMITTED"
    case validated = "VALIDATED"
    case provisioning = "PROVISIONING"
    case active = "ACTIVE"
    case cancelled = "CANCELLED"
    case failed = "FAILED"

    public var isTerminal: Bool {
        switch self {
        case .active, .cancelled, .failed: return true
        default: return false
        }
    }

    /// Ordinal along the happy path, used to draw progress trackers.
    public var progressIndex: Int? {
        switch self {
        case .draft: return 0
        case .submitted: return 1
        case .validated: return 2
        case .provisioning: return 3
        case .active: return 4
        case .cancelled, .failed: return nil
        }
    }

    public static let happyPath: [OrderStatus] = [.draft, .submitted, .validated, .provisioning, .active]

    public func canTransition(to next: OrderStatus) -> Bool {
        if isTerminal { return false }
        if next == .cancelled || next == .failed { return true }
        guard let from = progressIndex, let to = next.progressIndex else { return false }
        return to == from + 1
    }
}

public enum UpgradeTiming: String, Codable, Sendable, CaseIterable {
    case immediate = "IMMEDIATE"
    case nextBillingCycle = "NEXT_BILLING_CYCLE"
}

public struct UpgradeQuoteRequest: Codable, Sendable, Equatable {
    public let serviceId: String
    public let targetPlanId: String
    public let timing: UpgradeTiming

    public init(serviceId: String, targetPlanId: String, timing: UpgradeTiming) {
        self.serviceId = serviceId
        self.targetPlanId = targetPlanId
        self.timing = timing
    }
}

public struct UpgradeQuote: Codable, Hashable, Sendable {
    public let quoteId: String
    public let targetPlan: Plan
    public let proratedCharge: Money
    public let newMonthlyPrice: Money
    public let oneTimeFees: [LineItem]
    public let effectiveDate: Date
    public let expiresAt: Date

    public init(quoteId: String, targetPlan: Plan, proratedCharge: Money, newMonthlyPrice: Money, oneTimeFees: [LineItem], effectiveDate: Date, expiresAt: Date) {
        self.quoteId = quoteId
        self.targetPlan = targetPlan
        self.proratedCharge = proratedCharge
        self.newMonthlyPrice = newMonthlyPrice
        self.oneTimeFees = oneTimeFees
        self.effectiveDate = effectiveDate
        self.expiresAt = expiresAt
    }

    public func isExpired(at date: Date) -> Bool { date >= expiresAt }

    /// Amount due on the next bill as a result of this change.
    public func dueToday() throws -> Money {
        try Money.sum([proratedCharge] + oneTimeFees.map(\.amount), currency: proratedCharge.currency)
    }
}

public struct Order: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let status: OrderStatus
    public let createdAt: Date
    public let summary: String

    public init(id: String, status: OrderStatus, createdAt: Date, summary: String) {
        self.id = id
        self.status = status
        self.createdAt = createdAt
        self.summary = summary
    }
}

public extension Calendar {
    static let gregorianUTC: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()
}
