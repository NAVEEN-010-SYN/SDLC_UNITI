import SwiftUI
import GoKineticCore
import GoKineticUI

/// Builds every screen's view model from the composition root so views
/// never reach into the container themselves.
@MainActor
public struct FeatureFactory {
    public let container: DependencyContainer
    public let serviceId: String
    public let appVersion: String
    public let signOut: () async -> Void

    public init(container: DependencyContainer, serviceId: String, appVersion: String, signOut: @escaping () async -> Void) {
        self.container = container
        self.serviceId = serviceId
        self.appVersion = appVersion
        self.signOut = signOut
    }

    @ViewBuilder
    public func destination(for route: AppRoute) -> some View {
        let c = container
        switch route {
        case .link(.dashboard), .link(.bills):
            BillingView(viewModel: BillingViewModel(accounts: c.accounts, billing: c.billing, analytics: c.analytics, clock: c.clock))
        case .link(.invoice(let id)):
            InvoiceDetailView(viewModel: InvoiceDetailViewModel(invoiceId: id, billing: c.billing, clock: c.clock))
        case .link(.payBill(let invoiceId)):
            PayBillView(viewModel: PayBillViewModel(invoiceId: invoiceId, accounts: c.accounts, billing: c.billing,
                                                    analytics: c.analytics, clock: c.clock))
        case .link(.plan), .link(.upgrade):
            planView
        case .link(.usage):
            UsageView(viewModel: UsageViewModel(serviceId: serviceId, usage: c.usage, preferences: c.preferences, clock: c.clock))
        case .link(.wifi), .link(.devices):
            wifiView
        case .link(.speedTest):
            SpeedTestView(viewModel: SpeedTestViewModel(speedTest: c.speedTest, plan: nil, analytics: c.analytics))
        case .link(.outages):
            OutagesView(viewModel: OutagesViewModel(serviceId: serviceId, outages: c.outages, router: c.router, clock: c.clock))
        case .link(.tickets):
            supportView
        case .link(.ticket(let id)):
            TicketDetailView(viewModel: TicketDetailViewModel(ticketId: id, support: c.support, analytics: c.analytics, clock: c.clock))
        case .link(.appointments), .link(.appointment):
            AppointmentsView(viewModel: AppointmentsViewModel(appointments: c.appointments, analytics: c.analytics, clock: c.clock,
                                                              supportPhone: c.environment.supportPhone))
        case .link(.settings):
            SettingsView(viewModel: SettingsViewModel(
                notifications: c.notifications, biometricUnlock: c.authSession, biometrics: biometrics,
                analytics: c.analytics, preferences: c.preferences, appVersion: appVersion, signOut: signOut))
        case .bookAppointment(let type, let ticketId):
            AppointmentBookingView(viewModel: AppointmentBookingViewModel(
                mode: .book(ticketId: ticketId), type: type, appointments: c.appointments, analytics: c.analytics, clock: c.clock))
        case .rescheduleAppointment(let appointment):
            AppointmentBookingView(viewModel: AppointmentBookingViewModel(
                mode: .reschedule(appointment), type: nil, appointments: c.appointments, analytics: c.analytics, clock: c.clock))
        case .editWiFi(let routerId, let network):
            WiFiSettingsView(viewModel: WiFiSettingsViewModel(routerId: routerId, network: network, router: c.router, analytics: c.analytics))
        case .troubleshoot:
            TroubleshootView(viewModel: TroubleshootViewModel(serviceId: serviceId, outages: c.outages, router: c.router, clock: c.clock),
                             makeTicketForm: { draft in
                                 NewTicketViewModel(serviceId: serviceId, support: c.support, analytics: c.analytics, prefill: draft)
                             })
        case .profile:
            ProfileView(viewModel: ProfileViewModel(accounts: c.accounts))
        }
    }

    /// Biometric availability is a device property; the session owns the flag.
    private var biometrics: BiometricAuthenticating {
        #if canImport(LocalAuthentication)
        return LocalBiometricAuthenticator()
        #else
        return UnavailableBiometrics()
        #endif
    }

    var planView: some View {
        let c = container, serviceId = self.serviceId
        return PlanView(viewModel: PlanViewModel(serviceId: serviceId, plans: c.plans, clock: c.clock)) { current, options in
            UpgradeFlowViewModel(serviceId: serviceId, currentPlan: current.plan, options: options, plans: c.plans,
                                 analytics: c.analytics, clock: c.clock)
        }
    }

    var wifiView: some View {
        WiFiView(viewModel: WiFiViewModel(serviceId: serviceId, router: container.router, analytics: container.analytics, clock: container.clock))
    }

    var supportView: some View {
        let c = container, serviceId = self.serviceId
        return TicketsView(viewModel: TicketsViewModel(support: c.support)) { onCreated in
            NewTicketViewModel(serviceId: serviceId, support: c.support, analytics: c.analytics, onCreated: onCreated)
        }
    }
}

private struct UnavailableBiometrics: BiometricAuthenticating {
    func availableBiometry() -> BiometryKind { .none }
    func authenticate(reason: String) async throws -> Bool { false }
}

/// Signed-in shell: one navigation stack per tab, all sharing the
/// `AppRoute` destination table, with deep links pushed onto the active tab.
public struct MainTabView: View {
    @ObservedObject private var app: AppViewModel
    private let factory: FeatureFactory
    @State private var paths: [AppTab: NavigationPath] = [:]

    public init(app: AppViewModel, factory: FeatureFactory) {
        self.app = app
        self.factory = factory
    }

    public var body: some View {
        TabView(selection: $app.selectedTab) {
            tab(.home, L10n.Tabs.home, "house") {
                DashboardView(viewModel: DashboardViewModel(
                    accounts: factory.container.accounts, router: factory.container.router, outages: factory.container.outages,
                    appointments: factory.container.appointments, clock: factory.container.clock)) { link in app.open(link) }
            }
            tab(.billing, L10n.Tabs.billing, "creditcard") { factory.destination(for: .link(.bills)) }
            tab(.plan, L10n.Tabs.plan, "speedometer") { factory.planView }
            tab(.wifi, L10n.Tabs.wifi, "wifi") { factory.wifiView }
            tab(.support, L10n.Tabs.support, "questionmark.bubble") { factory.supportView }
        }
        .onChange(of: app.activeLink) { link in
            guard let link else { return }
            if Self.rootLinks.contains(link) == false {
                paths[link.tab, default: NavigationPath()].append(link.route)
            }
            app.consumeActiveLink()
        }
    }

    /// Links that are a tab's root screen select the tab without pushing.
    private static let rootLinks: Set<DeepLink> = [.dashboard, .bills, .plan, .wifi, .tickets]

    private func tab<Content: View>(_ tab: AppTab, _ title: String, _ symbol: String,
                                    @ViewBuilder root: () -> Content) -> some View {
        NavigationStack(path: Binding(get: { paths[tab] ?? NavigationPath() }, set: { paths[tab] = $0 })) {
            root().navigationDestination(for: AppRoute.self) { factory.destination(for: $0) }
        }
        .tabItem { Label(title, systemImage: symbol) }
        .tag(tab)
    }
}
