import Foundation
import GoKineticCore
import GoKineticUI

/// Aggregates the home screen: account balance, next bill, plan, active
/// outages, router health and upcoming appointment. Each section loads
/// independently so one failing backend doesn't blank the dashboard.
@MainActor
public final class DashboardViewModel: ObservableObject {
    public struct BillSummary: Equatable {
        public let balanceText: String
        public let dueText: String?
        public let tone: Tone
        public let canPay: Bool
    }

    public struct Alert: Equatable, Identifiable {
        public let id: String
        public let titleKey: String
        public let message: String?
        public let tone: Tone
        public let link: DeepLink
    }

    @Published public private(set) var greetingName: String = ""
    @Published public private(set) var account: ViewState<AccountSummary> = .idle
    @Published public private(set) var bill: BillSummary?
    @Published public private(set) var router: ViewState<RouterStatus> = .idle
    @Published public private(set) var nextAppointment: Appointment?
    @Published public private(set) var alerts: [Alert] = []

    private let accounts: AccountRepository
    private let routerRepository: RouterRepository
    private let outages: OutageRepository
    private let appointments: AppointmentRepository
    private let clock: Clock
    private let moneyFormatter: MoneyFormatter
    private let dateFormatter: DisplayDateFormatter

    public init(
        accounts: AccountRepository,
        router: RouterRepository,
        outages: OutageRepository,
        appointments: AppointmentRepository,
        clock: Clock,
        moneyFormatter: MoneyFormatter = MoneyFormatter(),
        dateFormatter: DisplayDateFormatter = DisplayDateFormatter()
    ) {
        self.accounts = accounts
        self.routerRepository = router
        self.outages = outages
        self.appointments = appointments
        self.clock = clock
        self.moneyFormatter = moneyFormatter
        self.dateFormatter = dateFormatter
    }

    public func load(forceRefresh: Bool = false) async {
        account = account.reloading()
        async let profileTask: Void = loadGreeting(forceRefresh: forceRefresh)
        do {
            let summary = try await accounts.summary(forceRefresh: forceRefresh)
            account = .loaded(summary)
            bill = makeBillSummary(summary)
            await loadServiceSections(for: summary)
        } catch {
            account = account.failing(error)
        }
        await profileTask
    }

    private func loadGreeting(forceRefresh: Bool) async {
        if let profile = try? await accounts.profile(forceRefresh: forceRefresh) {
            greetingName = profile.firstName.isEmpty ? profile.displayName : profile.firstName
        }
    }

    private func loadServiceSections(for summary: AccountSummary) async {
        guard let service = summary.primaryService else {
            router = .empty
            alerts = []
            return
        }
        router = router.reloading()
        async let routerResult = Result.capturing { try await routerRepository.status(serviceId: service.id) }
        async let outageResult = Result.capturing { try await outages.outages(serviceId: service.id) }
        async let appointmentResult = Result.capturing { try await appointments.appointments() }

        let (routerOutcome, outageOutcome, appointmentOutcome) = await (routerResult, outageResult, appointmentResult)

        switch routerOutcome {
        case .success(let status): router = .loaded(status)
        case .failure(let error): router = router.failing(error)
        }
        nextAppointment = (try? appointmentOutcome.get())?.first { $0.isUpcoming && $0.slot.start > clock.now() }
        alerts = buildAlerts(summary: summary,
                             outages: (try? outageOutcome.get()) ?? [],
                             router: try? routerOutcome.get(),
                             service: service)
    }

    func makeBillSummary(_ summary: AccountSummary) -> BillSummary {
        let balance = summary.balance
        let balanceText = moneyFormatter.balanceString(from: balance, creditSuffix: L10n.Common.credit)
        guard balance.isPositive else {
            return BillSummary(balanceText: balanceText, dueText: nil, tone: .success, canPay: false)
        }
        guard let due = summary.nextBillDate else {
            return BillSummary(balanceText: balanceText, dueText: nil, tone: .info, canPay: true)
        }
        let days = Calendar.gregorianUTC.dateComponents([.day], from: Calendar.gregorianUTC.startOfDay(for: clock.now()),
                                                        to: Calendar.gregorianUTC.startOfDay(for: due)).day ?? 0
        let dueText: String
        let tone: Tone
        switch days {
        case ..<0:
            dueText = L10n.Billing.overdueBy(days: -days)
            tone = .danger
        case 0...3:
            dueText = days == 0 ? L10n.string("billing.dueToday") : L10n.Billing.dueIn(days: days)
            tone = .warning
        default:
            dueText = L10n.string("billing.dueOnDate", dateFormatter.shortDate(due))
            tone = .info
        }
        return BillSummary(balanceText: balanceText, dueText: dueText,
                           tone: summary.autopayEnabled && days >= 0 ? .info : tone, canPay: true)
    }

    /// Ranks what needs the customer's attention: an outage on their
    /// service outranks router trouble, which outranks billing nudges.
    func buildAlerts(summary: AccountSummary, outages: [Outage], router: RouterStatus?, service: Service) -> [Alert] {
        var result: [Alert] = []
        let now = clock.now()

        if let outage = outages.first(where: { $0.isActive && $0.affectsMyService }) {
            let eta = outage.estimatedResolution.map { L10n.string("outage.eta", dateFormatter.time($0)) }
            result.append(Alert(id: "outage-\(outage.id)", titleKey: "dashboard.alert.outage",
                                message: outage.isPastEstimate(at: now) ? L10n.string("outage.delayed") : eta,
                                tone: outage.severity.tone, link: .outages))
        }
        if let router, router.state == .offline, !result.contains(where: { $0.link == .outages }) {
            result.append(Alert(id: "router-offline", titleKey: "dashboard.alert.routerOffline",
                                message: nil, tone: .danger, link: .wifi))
        }
        if summary.balance.isPositive, let due = summary.nextBillDate, due < now, !summary.autopayEnabled {
            result.append(Alert(id: "bill-overdue", titleKey: "dashboard.alert.billOverdue",
                                message: moneyFormatter.string(from: summary.balance), tone: .danger, link: .payBill(invoiceId: nil)))
        }
        if service.status == .suspended {
            result.append(Alert(id: "service-suspended", titleKey: "dashboard.alert.suspended",
                                message: nil, tone: .danger, link: .tickets))
        }
        return result
    }
}
