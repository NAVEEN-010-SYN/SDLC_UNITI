import Foundation
import GoKineticCore
import GoKineticUI

@MainActor
public final class InvoiceDetailViewModel: ObservableObject {
    public struct Line: Equatable, Identifiable {
        public let id: String
        public let label: String
        public let amountText: String
        public let isCredit: Bool
    }

    public struct Content: Equatable {
        public let invoice: Invoice
        public let effectiveStatus: InvoiceStatus
        public let totalText: String
        public let amountDueText: String
        public let dueText: String
        public let lines: [Line]
        public let subtotals: [Line]
        /// Line items don't add up to the total; the UI shows a caveat
        /// instead of a breakdown the customer might rely on.
        public let breakdownIncomplete: Bool
    }

    @Published public private(set) var state: ViewState<Content> = .idle
    @Published public private(set) var isFetchingDocument = false
    @Published public var documentURL: URL?
    @Published public var documentError: UserFacingError?

    public let invoiceId: String
    private let billing: BillingRepository
    private let clock: Clock
    private let moneyFormatter: MoneyFormatter
    private let dateFormatter: DisplayDateFormatter

    public init(invoiceId: String, billing: BillingRepository, clock: Clock,
                moneyFormatter: MoneyFormatter = MoneyFormatter(), dateFormatter: DisplayDateFormatter = DisplayDateFormatter()) {
        self.invoiceId = invoiceId
        self.billing = billing
        self.clock = clock
        self.moneyFormatter = moneyFormatter
        self.dateFormatter = dateFormatter
    }

    public func load() async {
        state = state.reloading()
        do {
            state = .loaded(makeContent(try await billing.invoice(id: invoiceId)))
        } catch {
            state = state.failing(error)
        }
    }

    func makeContent(_ invoice: Invoice) -> Content {
        let now = clock.now()
        let status: InvoiceStatus = invoice.isOverdue(at: now) ? .overdue : invoice.status
        let dueText: String
        if invoice.isSettled {
            dueText = L10n.string("invoice.settled")
        } else {
            let days = invoice.daysUntilDue(from: now)
            switch days {
            case ..<0: dueText = L10n.Billing.overdueBy(days: -days)
            case 0: dueText = L10n.string("billing.dueToday")
            default: dueText = L10n.string("billing.dueOnDate", dateFormatter.longDate(invoice.dueAt))
            }
        }
        let lines = invoice.lineItems.map {
            Line(id: $0.id, label: $0.description, amountText: moneyFormatter.string(from: $0.amount), isCredit: $0.amount.isNegative)
        }
        let subtotals = invoice.subtotals().map {
            Line(id: $0.category.rawValue, label: L10n.string("invoice.category.\($0.category.rawValue.lowercased())"),
                 amountText: moneyFormatter.string(from: $0.amount), isCredit: $0.amount.isNegative)
        }
        return Content(invoice: invoice, effectiveStatus: status,
                       totalText: moneyFormatter.string(from: invoice.total),
                       amountDueText: moneyFormatter.string(from: invoice.amountDue),
                       dueText: dueText, lines: lines, subtotals: subtotals,
                       breakdownIncomplete: !invoice.lineItemsReconcile)
    }

    public var canPay: Bool {
        guard let invoice = state.value?.invoice else { return false }
        return !invoice.isSettled
    }

    /// Requests a fresh signed link each time: links are short-lived and
    /// must not be cached or shared.
    public func openDocument() async {
        guard !isFetchingDocument else { return }
        isFetchingDocument = true
        documentError = nil
        defer { isFetchingDocument = false }
        do {
            documentURL = try await billing.invoicePDF(id: invoiceId)
        } catch {
            documentError = UserFacingError(error)
        }
    }
}
