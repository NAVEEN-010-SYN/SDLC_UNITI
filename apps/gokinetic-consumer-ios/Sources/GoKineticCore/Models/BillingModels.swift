import Foundation

public struct LineItem: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let description: String
    public let amount: Money
    public let category: Category

    public enum Category: String, Codable, Sendable {
        case recurring = "RECURRING"
        case oneTime = "ONE_TIME"
        case usage = "USAGE"
        case discount = "DISCOUNT"
        case tax = "TAX"
        case adjustment = "ADJUSTMENT"
    }

    public init(id: String, description: String, amount: Money, category: Category) {
        self.id = id
        self.description = description
        self.amount = amount
        self.category = category
    }
}

public enum InvoiceStatus: String, Codable, Sendable {
    case open = "OPEN"
    case paid = "PAID"
    case partiallyPaid = "PARTIALLY_PAID"
    case overdue = "OVERDUE"
    case void = "VOID"
}

public struct Invoice: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let number: String
    public let issuedAt: Date
    public let dueAt: Date
    public let periodStart: Date
    public let periodEnd: Date
    public let total: Money
    public let amountPaid: Money
    public let status: InvoiceStatus
    public let lineItems: [LineItem]

    public init(id: String, number: String, issuedAt: Date, dueAt: Date, periodStart: Date, periodEnd: Date, total: Money, amountPaid: Money, status: InvoiceStatus, lineItems: [LineItem]) {
        self.id = id
        self.number = number
        self.issuedAt = issuedAt
        self.dueAt = dueAt
        self.periodStart = periodStart
        self.periodEnd = periodEnd
        self.total = total
        self.amountPaid = amountPaid
        self.status = status
        self.lineItems = lineItems
    }

    public var amountDue: Money {
        (try? total.subtracting(amountPaid)) ?? total
    }

    public var isSettled: Bool {
        status == .paid || status == .void || !amountDue.isPositive
    }

    /// Whether the invoice is past due at `date`, independent of the server
    /// flag so the UI is correct even with a stale cached copy.
    public func isOverdue(at date: Date) -> Bool {
        !isSettled && date > dueAt
    }

    public func daysUntilDue(from date: Date, calendar: Calendar = .gregorianUTC) -> Int {
        let start = calendar.startOfDay(for: date)
        let end = calendar.startOfDay(for: dueAt)
        return calendar.dateComponents([.day], from: start, to: end).day ?? 0
    }

    /// Totals grouped by line-item category, for the bill breakdown view.
    public func subtotals() -> [(category: LineItem.Category, amount: Money)] {
        var buckets: [LineItem.Category: Int64] = [:]
        var order: [LineItem.Category] = []
        for item in lineItems where item.amount.currency == total.currency {
            if buckets[item.category] == nil { order.append(item.category) }
            buckets[item.category, default: 0] += item.amount.minorUnits
        }
        return order.map { ($0, Money(minorUnits: buckets[$0] ?? 0, currency: total.currency)) }
    }

    /// Detects line items that do not add up to the invoice total.
    public var lineItemsReconcile: Bool {
        guard !lineItems.isEmpty else { return true }
        let sum = lineItems
            .filter { $0.amount.currency == total.currency }
            .reduce(Int64(0)) { $0 + $1.amount.minorUnits }
        return sum == total.minorUnits
    }
}

public enum PaymentMethodKind: String, Codable, Sendable {
    case card = "CARD"
    case bankAccount = "BANK_ACCOUNT"
    case applePay = "APPLE_PAY"
}

/// A stored, tokenised payment method. The app never handles raw PANs.
public struct PaymentMethod: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let kind: PaymentMethodKind
    public let brand: String?
    public let last4: String
    public let expiryMonth: Int?
    public let expiryYear: Int?
    public let isDefault: Bool

    public init(id: String, kind: PaymentMethodKind, brand: String?, last4: String, expiryMonth: Int?, expiryYear: Int?, isDefault: Bool) {
        self.id = id
        self.kind = kind
        self.brand = brand
        self.last4 = last4
        self.expiryMonth = expiryMonth
        self.expiryYear = expiryYear
        self.isDefault = isDefault
    }

    public func isExpired(at date: Date, calendar: Calendar = .gregorianUTC) -> Bool {
        guard let month = expiryMonth, let year = expiryYear else { return false }
        let now = calendar.dateComponents([.year, .month], from: date)
        guard let currentYear = now.year, let currentMonth = now.month else { return false }
        return year < currentYear || (year == currentYear && month < currentMonth)
    }

    public var displayName: String {
        switch kind {
        case .card: return "\(brand ?? "Card") •••• \(last4)"
        case .bankAccount: return "Bank account •••• \(last4)"
        case .applePay: return "Apple Pay"
        }
    }
}

public enum PaymentStatus: String, Codable, Sendable {
    case pending = "PENDING"
    case succeeded = "SUCCEEDED"
    case failed = "FAILED"
    case refunded = "REFUNDED"
}

public struct Payment: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let amount: Money
    public let createdAt: Date
    public let status: PaymentStatus
    public let methodDisplay: String
    public let invoiceId: String?
    public let failureReason: String?

    public init(id: String, amount: Money, createdAt: Date, status: PaymentStatus, methodDisplay: String, invoiceId: String?, failureReason: String? = nil) {
        self.id = id
        self.amount = amount
        self.createdAt = createdAt
        self.status = status
        self.methodDisplay = methodDisplay
        self.invoiceId = invoiceId
        self.failureReason = failureReason
    }
}

public struct PaymentRequest: Codable, Sendable, Equatable {
    public let invoiceId: String?
    public let paymentMethodId: String
    public let amount: Money
    /// Client-generated key so a retried request never double-charges.
    public let idempotencyKey: String

    public init(invoiceId: String?, paymentMethodId: String, amount: Money, idempotencyKey: String = UUID().uuidString) {
        self.invoiceId = invoiceId
        self.paymentMethodId = paymentMethodId
        self.amount = amount
        self.idempotencyKey = idempotencyKey
    }
}

public struct AutopaySettings: Codable, Hashable, Sendable {
    public let enabled: Bool
    public let paymentMethodId: String?

    public init(enabled: Bool, paymentMethodId: String?) {
        self.enabled = enabled
        self.paymentMethodId = paymentMethodId
    }
}
