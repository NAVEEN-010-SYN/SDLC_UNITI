import Foundation
import GoKineticCore
import GoKineticUI

/// One-off payment: pick an amount (balance, an invoice, or custom), pick
/// a stored method, confirm. Never double-charges: the draft's idempotency
/// key survives retries of an uncertain attempt.
@MainActor
public final class PayBillViewModel: ObservableObject {
    public struct Setup: Equatable {
        public let balance: Money
        public let options: [PaymentAmountOption]
        public let methods: [PaymentMethod]
        public let hasExpiredMethods: Bool
        public let overpaymentAllowance: Money
    }

    public enum AmountChoice: Hashable {
        case option(String)
        case custom
    }

    public enum Phase: Equatable {
        case editing
        case submitting
        case succeeded(Payment)
        case failed(PaymentFailure)
    }

    @Published public private(set) var setup: ViewState<Setup> = .idle
    @Published public private(set) var phase: Phase = .editing
    @Published public var amountChoice: AmountChoice? { didSet { syncDraft() } }
    @Published public var customAmountText = "" { didSet { syncDraft() } }
    @Published public var selectedMethodId: String? { didSet { syncDraft() } }
    /// Validation is only surfaced once the customer has tried to pay or
    /// typed a custom amount, so the form doesn't open in an error state.
    @Published public private(set) var showsValidation = false

    private(set) var draft = PaymentDraft()
    private let preselectedInvoiceId: String?
    private let accounts: AccountRepository
    private let billing: BillingRepository
    private let analytics: AnalyticsTracking
    private let clock: Clock
    private let moneyFormatter: MoneyFormatter
    private let locale: Locale

    public init(invoiceId: String?, accounts: AccountRepository, billing: BillingRepository, analytics: AnalyticsTracking,
                clock: Clock, moneyFormatter: MoneyFormatter = MoneyFormatter(), locale: Locale = .current) {
        self.preselectedInvoiceId = invoiceId
        self.accounts = accounts
        self.billing = billing
        self.analytics = analytics
        self.clock = clock
        self.moneyFormatter = moneyFormatter
        self.locale = locale
    }

    public func load() async {
        setup = setup.reloading()
        do {
            async let summaryTask = accounts.summary(forceRefresh: true)
            async let invoicesTask = billing.invoices(page: 1, pageSize: 24)
            async let methodsTask = billing.paymentMethods()
            let (summary, invoices, methods) = try await (summaryTask, invoicesTask, methodsTask)
            let now = clock.now()
            let usable = PaymentPlanner.usableMethods(methods, at: now)
            let loaded = Setup(
                balance: summary.balance,
                options: PaymentPlanner.amountOptions(balance: summary.balance, invoices: invoices.items, at: now),
                methods: usable,
                hasExpiredMethods: usable.count < methods.count,
                overpaymentAllowance: PaymentPlanner.overpaymentAllowance(invoices: invoices.items, currency: summary.balance.currency)
            )
            setup = .loaded(loaded)
            applyDefaults(loaded)
        } catch {
            setup = setup.failing(error)
        }
    }

    private func applyDefaults(_ setup: Setup) {
        if amountChoice == nil {
            let preselected = setup.options.first { $0.target.invoiceId == preselectedInvoiceId && preselectedInvoiceId != nil }
            amountChoice = (preselected ?? setup.options.first).map { .option($0.id) } ?? .custom
        }
        if selectedMethodId == nil || !setup.methods.contains(where: { $0.id == selectedMethodId }) {
            selectedMethodId = PaymentPlanner.preferredMethod(setup.methods, at: clock.now())?.id
        }
    }

    // MARK: Derived state

    public var selectedOption: PaymentAmountOption? {
        guard case .option(let id) = amountChoice else { return nil }
        return setup.value?.options.first { $0.id == id }
    }

    public var resolvedAmount: Money? {
        guard let setup = setup.value else { return nil }
        switch amountChoice {
        case .option?: return selectedOption?.amount
        case .custom?: return Money.parse(customAmountText, currency: setup.balance.currency, locale: locale)
        case nil: return nil
        }
    }

    public var validation: ValidationResult {
        guard let setup = setup.value else { return .valid }
        var issues = PaymentAmountValidator.validate(amount: resolvedAmount, balance: setup.balance,
                                                     maxOverpayment: setup.overpaymentAllowance).issues
        if selectedMethodId == nil {
            issues.append(ValidationIssue(field: "method", messageKey: "payment.validation.methodRequired"))
        }
        return ValidationResult(issues)
    }

    public var amountMessage: String? {
        guard showsValidation, let key = validation.message(for: "amount") else { return nil }
        return L10n.string(key)
    }

    public var canSubmit: Bool {
        phase != .submitting && setup.value != nil && validation.isValid
    }

    public var confirmTitle: String {
        guard let amount = resolvedAmount else { return L10n.Billing.payNow }
        return L10n.string("payment.payAmount", moneyFormatter.string(from: amount))
    }

    public func label(for option: PaymentAmountOption) -> String {
        switch option.kind {
        case .balance: return L10n.string("payment.option.balance")
        case .invoice: return L10n.string("payment.option.invoice", option.invoiceNumber ?? "")
        case .overdueInvoice: return L10n.string("payment.option.overdue", option.invoiceNumber ?? "")
        }
    }

    public func amountText(_ money: Money) -> String {
        moneyFormatter.string(from: money)
    }

    public func customAmountEdited() {
        showsValidation = !customAmountText.isEmpty
    }

    // MARK: Actions

    private func syncDraft() {
        let target = selectedOption?.target ?? .accountBalance
        draft.update(target: target, amount: .some(resolvedAmount), paymentMethodId: .some(selectedMethodId))
        if case .failed = phase { phase = .editing }
    }

    public func submit() async {
        showsValidation = true
        guard canSubmit else { return }
        syncDraft()
        guard let request = draft.request else { return }

        phase = .submitting
        analytics.track(.paymentSubmitted(amountMinor: request.amount.minorUnits, currency: request.amount.currency))
        do {
            let payment = try await billing.pay(request)
            if let failure = PaymentFailure(payment: payment) {
                fail(with: failure)
            } else {
                draft.rotateKey()
                phase = .succeeded(payment)
            }
        } catch {
            fail(with: PaymentFailure(error))
        }
    }

    private func fail(with failure: PaymentFailure) {
        if failure.isFinal { draft.rotateKey() }
        phase = .failed(failure)
        analytics.track(.paymentFailed(code: failure.analyticsCode))
    }

    /// Retrying an uncertain attempt re-sends the identical request.
    public func retry() async {
        guard case .failed(let failure) = phase else { return }
        if failure == .outcomeUnknown {
            phase = .editing
            await submit()
        } else {
            phase = .editing
        }
    }
}
