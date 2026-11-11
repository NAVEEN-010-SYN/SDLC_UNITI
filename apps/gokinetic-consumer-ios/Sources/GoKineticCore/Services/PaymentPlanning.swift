import Foundation

/// What a one-off payment is applied to.
public enum PaymentTarget: Equatable, Hashable, Sendable {
    case accountBalance
    case invoice(id: String)

    public var invoiceId: String? {
        if case .invoice(let id) = self { return id }
        return nil
    }
}

/// A preset amount offered on the pay-bill screen.
public struct PaymentAmountOption: Equatable, Identifiable, Sendable {
    public enum Kind: String, Sendable {
        case balance, invoice, overdueInvoice
    }

    public let kind: Kind
    public let target: PaymentTarget
    public let amount: Money
    public let invoiceNumber: String?

    public init(kind: Kind, target: PaymentTarget, amount: Money, invoiceNumber: String? = nil) {
        self.kind = kind
        self.target = target
        self.amount = amount
        self.invoiceNumber = invoiceNumber
    }

    public var id: String { "\(kind.rawValue)-\(target.invoiceId ?? "balance")" }
}

/// Pure rules behind the pay-bill screen: which amounts to offer, which
/// stored methods may be charged, and how much overpayment is tolerated.
public enum PaymentPlanner {
    /// The full balance first, then each unsettled invoice (overdue first,
    /// then by due date) whose amount differs from the balance.
    public static func amountOptions(balance: Money, invoices: [Invoice], at date: Date) -> [PaymentAmountOption] {
        var options: [PaymentAmountOption] = []
        if balance.isPositive {
            options.append(PaymentAmountOption(kind: .balance, target: .accountBalance, amount: balance))
        }
        let unsettled = invoices
            .filter { !$0.isSettled && $0.amountDue.currency == balance.currency && $0.amountDue.isPositive }
            .sorted { lhs, rhs in
                let lhsOverdue = lhs.isOverdue(at: date), rhsOverdue = rhs.isOverdue(at: date)
                if lhsOverdue != rhsOverdue { return lhsOverdue }
                return lhs.dueAt < rhs.dueAt
            }
        for invoice in unsettled where invoice.amountDue != balance || !balance.isPositive {
            options.append(PaymentAmountOption(
                kind: invoice.isOverdue(at: date) ? .overdueInvoice : .invoice,
                target: .invoice(id: invoice.id),
                amount: invoice.amountDue,
                invoiceNumber: invoice.number
            ))
        }
        return options
    }

    public static func usableMethods(_ methods: [PaymentMethod], at date: Date) -> [PaymentMethod] {
        methods.filter { !$0.isExpired(at: date) }
    }

    /// The default method when it is still valid, otherwise the first valid one.
    public static func preferredMethod(_ methods: [PaymentMethod], at date: Date) -> PaymentMethod? {
        let usable = usableMethods(methods, at: date)
        return usable.first(where: \.isDefault) ?? usable.first
    }

    /// Customers may overpay by up to one typical monthly bill (the largest
    /// recent invoice total) so the excess sits on the account as credit.
    public static func overpaymentAllowance(invoices: [Invoice], currency: String) -> Money {
        let largest = invoices
            .filter { $0.total.currency == currency && $0.status != .void }
            .map(\.total.minorUnits)
            .max() ?? 0
        return Money(minorUnits: largest, currency: currency)
    }
}

/// The in-progress payment the customer is composing. Owns the
/// idempotency key: the key is kept across retries of the *same* payment
/// (so a timeout followed by a retry can never double-charge) and rotated
/// whenever the terms change or the previous attempt reached a final
/// outcome on the server.
public struct PaymentDraft: Equatable, Sendable {
    public private(set) var target: PaymentTarget
    public private(set) var amount: Money?
    public private(set) var paymentMethodId: String?
    public private(set) var idempotencyKey: String

    public init(target: PaymentTarget = .accountBalance, amount: Money? = nil, paymentMethodId: String? = nil, idempotencyKey: String = UUID().uuidString) {
        self.target = target
        self.amount = amount
        self.paymentMethodId = paymentMethodId
        self.idempotencyKey = idempotencyKey
    }

    /// Applies new terms; returns true when anything actually changed.
    @discardableResult
    public mutating func update(target: PaymentTarget? = nil, amount: Money?? = nil, paymentMethodId: String?? = nil,
                                makeKey: () -> String = { UUID().uuidString }) -> Bool {
        let newTarget = target ?? self.target
        let newAmount = amount ?? self.amount
        let newMethod = paymentMethodId ?? self.paymentMethodId
        guard newTarget != self.target || newAmount != self.amount || newMethod != self.paymentMethodId else { return false }
        self.target = newTarget
        self.amount = newAmount
        self.paymentMethodId = newMethod
        self.idempotencyKey = makeKey()
        return true
    }

    public mutating func rotateKey(makeKey: () -> String = { UUID().uuidString }) {
        idempotencyKey = makeKey()
    }

    public var request: PaymentRequest? {
        guard let amount, let paymentMethodId else { return nil }
        return PaymentRequest(invoiceId: target.invoiceId, paymentMethodId: paymentMethodId,
                              amount: amount, idempotencyKey: idempotencyKey)
    }
}

/// Classified payment failure, from either a thrown API error or a
/// payment the server accepted but marked `FAILED`.
public enum PaymentFailure: Equatable, Sendable {
    case declined
    case insufficientFunds
    case methodExpired
    case amountRejected(detail: String?)
    case duplicate
    /// The request may or may not have reached the processor. Retrying with
    /// the same idempotency key is safe and resolves the uncertainty.
    case outcomeUnknown
    case other(UserFacingError)

    public init(_ error: Error) {
        switch error {
        case APIError.validation(let problem):
            self = PaymentFailure(code: problem.code) ?? .amountRejected(detail: problem.firstError(for: "amount") ?? problem.detail)
        case APIError.conflict(let problem):
            self = PaymentFailure(code: problem?.code) ?? .duplicate
        case APIError.offline, APIError.timedOut, APIError.transport:
            self = .outcomeUnknown
        case APIError.server(let status, _) where status == 502 || status == 504:
            self = .outcomeUnknown
        default:
            self = .other(UserFacingError(error))
        }
    }

    /// Maps a payment returned with status `FAILED`; nil for any other status.
    public init?(payment: Payment) {
        guard payment.status == .failed else { return nil }
        let normalized = payment.failureReason?.lowercased().replacingOccurrences(of: "_", with: "-")
        self = PaymentFailure(code: normalized) ?? .declined
    }

    private init?(code: String?) {
        switch code {
        case "card-declined", "declined", "do-not-honor": self = .declined
        case "insufficient-funds": self = .insufficientFunds
        case "payment-method-expired", "expired-card", "expired-method": self = .methodExpired
        case "duplicate-payment": self = .duplicate
        default: return nil
        }
    }

    /// Whether the server reached a final answer for this idempotency key.
    /// Only unknown outcomes keep the key so the retry is deduplicated.
    public var isFinal: Bool {
        self != .outcomeUnknown
    }

    public var messageKey: String {
        switch self {
        case .declined: return "payment.error.declined"
        case .insufficientFunds: return "payment.error.insufficientFunds"
        case .methodExpired: return "payment.error.methodExpired"
        case .amountRejected: return "payment.error.amountRejected"
        case .duplicate: return "payment.error.duplicate"
        case .outcomeUnknown: return "payment.error.outcomeUnknown"
        case .other(let error): return error.titleKey
        }
    }

    public var analyticsCode: String {
        switch self {
        case .declined: return "declined"
        case .insufficientFunds: return "insufficient_funds"
        case .methodExpired: return "method_expired"
        case .amountRejected: return "amount_rejected"
        case .duplicate: return "duplicate"
        case .outcomeUnknown: return "outcome_unknown"
        case .other(let error): return "other_\(error.kind)"
        }
    }
}
