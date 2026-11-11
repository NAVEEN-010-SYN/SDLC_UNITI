import Foundation
import GoKineticCore
import GoKineticUI

/// Billing tab: balance and due date, autopay, and the invoice history.
@MainActor
public final class BillingViewModel: ObservableObject {
    public struct Overview: Equatable {
        public let balance: Money
        public let balanceText: String
        public let nextBillDate: Date?
        public let autopay: AutopaySettings
        public let autopayMethod: PaymentMethod?
        public let usableMethods: [PaymentMethod]
    }

    public struct InvoiceRow: Equatable, Identifiable {
        public let invoice: Invoice
        public let amountText: String
        public let periodText: String
        public let statusKey: String
        public let tone: Tone
        public var id: String { invoice.id }
    }

    @Published public private(set) var overview: ViewState<Overview> = .idle
    @Published public private(set) var invoices: ViewState<[Invoice]> = .idle
    @Published public private(set) var isLoadingMore = false
    @Published public private(set) var isUpdatingAutopay = false
    @Published public var inlineError: UserFacingError?

    private let accounts: AccountRepository
    private let billing: BillingRepository
    private let analytics: AnalyticsTracking
    private let clock: Clock
    private let moneyFormatter: MoneyFormatter
    private let dateFormatter: DisplayDateFormatter
    private let loader: PagedLoader<Invoice>

    public init(accounts: AccountRepository, billing: BillingRepository, analytics: AnalyticsTracking, clock: Clock,
                moneyFormatter: MoneyFormatter = MoneyFormatter(), dateFormatter: DisplayDateFormatter = DisplayDateFormatter(),
                pageSize: Int = 12) {
        self.accounts = accounts
        self.billing = billing
        self.analytics = analytics
        self.clock = clock
        self.moneyFormatter = moneyFormatter
        self.dateFormatter = dateFormatter
        self.loader = PagedLoader(pageSize: pageSize) { page, size in
            try await billing.invoices(page: page, pageSize: size)
        }
    }

    public var hasMoreInvoices: Bool { loader.collection.hasMore }

    public func load(forceRefresh: Bool = false) async {
        if forceRefresh { await billing.invalidate() }
        async let overviewLoad: Void = loadOverview(forceRefresh: forceRefresh)
        invoices = invoices.reloading()
        invoices = await loader.refresh(current: invoices)
        await overviewLoad
    }

    private func loadOverview(forceRefresh: Bool) async {
        overview = overview.reloading()
        do {
            async let summaryTask = accounts.summary(forceRefresh: forceRefresh)
            async let autopayTask = billing.autopay()
            async let methodsTask = billing.paymentMethods()
            let (summary, autopay, methods) = try await (summaryTask, autopayTask, methodsTask)
            overview = .loaded(makeOverview(balance: summary.balance, nextBillDate: summary.nextBillDate,
                                            autopay: autopay, methods: methods))
        } catch {
            overview = overview.failing(error)
        }
    }

    func makeOverview(balance: Money, nextBillDate: Date?, autopay: AutopaySettings, methods: [PaymentMethod]) -> Overview {
        let usable = PaymentPlanner.usableMethods(methods, at: clock.now())
        return Overview(
            balance: balance,
            balanceText: moneyFormatter.balanceString(from: balance, creditSuffix: L10n.Common.credit),
            nextBillDate: nextBillDate,
            autopay: autopay,
            autopayMethod: methods.first { $0.id == autopay.paymentMethodId },
            usableMethods: usable
        )
    }

    public func loadMoreIfNeeded(current invoice: Invoice) async {
        guard invoice.id == loader.collection.items.last?.id, loader.collection.hasMore else { return }
        isLoadingMore = true
        inlineError = await loader.loadMore()
        isLoadingMore = false
        invoices = loader.state
    }

    /// Optimistically flips autopay and rolls back if the server refuses.
    /// Enabling picks the preferred valid method when none is configured.
    public func setAutopay(enabled: Bool) async {
        guard case .loaded(let current) = overview, current.autopay.enabled != enabled, !isUpdatingAutopay else { return }
        let methodId = enabled
            ? (current.usableMethods.first { $0.id == current.autopay.paymentMethodId }
               ?? PaymentPlanner.preferredMethod(current.usableMethods, at: clock.now()))?.id
            : current.autopay.paymentMethodId
        guard !enabled || methodId != nil else {
            inlineError = UserFacingError(kind: .validation, titleKey: "billing.autopay.noMethod", isRetryable: false)
            return
        }

        let requested = AutopaySettings(enabled: enabled, paymentMethodId: methodId)
        isUpdatingAutopay = true
        overview = .loaded(with(current, autopay: requested))
        defer { isUpdatingAutopay = false }
        do {
            let saved = try await billing.setAutopay(requested)
            overview = .loaded(with(current, autopay: saved))
            analytics.track(.autopayToggled(enabled: saved.enabled))
        } catch {
            overview = .loaded(current)
            inlineError = UserFacingError(error)
        }
    }

    private func with(_ overview: Overview, autopay: AutopaySettings) -> Overview {
        let known = overview.usableMethods + [overview.autopayMethod].compactMap { $0 }
        return Overview(balance: overview.balance, balanceText: overview.balanceText, nextBillDate: overview.nextBillDate,
                        autopay: autopay, autopayMethod: known.first { $0.id == autopay.paymentMethodId },
                        usableMethods: overview.usableMethods)
    }

    public func row(for invoice: Invoice) -> InvoiceRow {
        let now = clock.now()
        let status: InvoiceStatus = invoice.isOverdue(at: now) ? .overdue : invoice.status
        return InvoiceRow(
            invoice: invoice,
            amountText: moneyFormatter.string(from: invoice.isSettled ? invoice.total : invoice.amountDue),
            periodText: dateFormatter.period(from: invoice.periodStart, to: invoice.periodEnd),
            statusKey: "invoice.status.\(status.rawValue.lowercased())",
            tone: status.tone
        )
    }

    /// Whether the outstanding balance warrants a pay button.
    public var canPay: Bool {
        overview.value?.balance.isPositive ?? false
    }
}
