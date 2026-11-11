import SwiftUI
import GoKineticCore
import GoKineticUI

public struct DashboardView: View {
    @StateObject private var viewModel: DashboardViewModel
    private let onOpen: (DeepLink) -> Void
    private let dateFormatter = DisplayDateFormatter()

    public init(viewModel: @autoclosure @escaping () -> DashboardViewModel, onOpen: @escaping (DeepLink) -> Void) {
        _viewModel = StateObject(wrappedValue: viewModel())
        self.onOpen = onOpen
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                if !viewModel.greetingName.isEmpty {
                    Text(L10n.string("dashboard.greeting", viewModel.greetingName))
                        .font(Theme.Typography.title)
                }
                ForEach(viewModel.alerts) { alert in
                    Banner(title: L10n.string(alert.titleKey), message: alert.message, tone: alert.tone,
                           actionTitle: L10n.string("common.view")) { onOpen(alert.link) }
                }
                AsyncContentView(state: viewModel.account, emptyTitle: L10n.string("dashboard.noAccount"),
                                 retry: { Task { await viewModel.load(forceRefresh: true) } }) { summary in
                    VStack(spacing: Theme.Spacing.l) {
                        billCard
                        serviceCard(summary)
                        routerCard
                        appointmentCard
                        quickActions
                    }
                }
            }
            .padding(Theme.Spacing.l)
        }
        .refreshable { await viewModel.load(forceRefresh: true) }
        .task { await viewModel.load() }
        .navigationTitle(L10n.Tabs.home)
    }

    @ViewBuilder private var billCard: some View {
        if let bill = viewModel.bill {
            Card(title: L10n.Billing.balance) {
                HStack(alignment: .firstTextBaseline) {
                    Text(bill.balanceText).font(Theme.Typography.metric)
                    Spacer()
                    if let due = bill.dueText { StatusBadge(due, tone: bill.tone) }
                }
                if bill.canPay {
                    PrimaryButton(L10n.Billing.payNow) { onOpen(.payBill(invoiceId: nil)) }
                }
            }
        }
    }

    private func serviceCard(_ summary: AccountSummary) -> some View {
        Card(title: L10n.string("dashboard.myService")) {
            if let service = summary.primaryService {
                Text(service.productName).font(Theme.Typography.headline)
                Text(service.address.singleLine).font(.footnote).foregroundStyle(.secondary)
                Button(L10n.string("dashboard.viewPlan")) { onOpen(.plan) }
            } else {
                Text(L10n.string("dashboard.noService")).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder private var routerCard: some View {
        if let status = viewModel.router.value {
            Card(title: L10n.string("dashboard.homeWifi")) {
                HStack {
                    VStack(alignment: .leading) {
                        Text(status.primaryNetwork?.ssid ?? status.model).font(Theme.Typography.headline)
                        Text(L10n.string("wifi.uptime", DurationFormatter.compact(seconds: status.uptimeSeconds)))
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    Spacer()
                    StatusBadge(L10n.string("router.state.\(status.state.rawValue.lowercased())"), tone: status.state.tone)
                }
                Button(L10n.string("dashboard.manageWifi")) { onOpen(.wifi) }
            }
        }
    }

    @ViewBuilder private var appointmentCard: some View {
        if let appointment = viewModel.nextAppointment {
            Card(title: L10n.string("dashboard.nextAppointment")) {
                Text(L10n.string("appointment.type.\(appointment.type.rawValue.lowercased())")).font(Theme.Typography.headline)
                Text(dateFormatter.slotWindow(appointment.slot)).font(.footnote).foregroundStyle(.secondary)
                Button(L10n.string("common.view")) { onOpen(.appointment(id: appointment.id)) }
            }
        }
    }

    private var quickActions: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Theme.Spacing.m) {
            quickAction("speedometer", "dashboard.action.speedTest", .speedTest)
            quickAction("chart.bar.fill", "dashboard.action.usage", .usage)
            quickAction("exclamationmark.bubble", "dashboard.action.support", .tickets)
            quickAction("antenna.radiowaves.left.and.right", "dashboard.action.outages", .outages)
        }
    }

    private func quickAction(_ symbol: String, _ key: String, _ link: DeepLink) -> some View {
        Button { onOpen(link) } label: {
            StatTile(value: L10n.string(key), caption: "", symbol: symbol)
        }
        .buttonStyle(.plain)
    }
}
