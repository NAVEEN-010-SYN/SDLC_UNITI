# Go Kinetic Consumer mobile app (B2C): apps/gokinetic-consumer-ios/Sources/GoKineticFeatures (part 4 of 7)

- **Application:** Go Kinetic Consumer mobile app (B2C)
- **Tech stack:** Swift / SwiftUI
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 15

## Files

- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Appointments/AppointmentViews.swift` (237 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Appointments/AppointmentsViewModel.swift` (85 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Billing/BillingViewModel.swift` (149 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Billing/BillingViews.swift` (276 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Billing/InvoiceDetailViewModel.swift` (103 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Billing/PayBillViewModel.swift` (194 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Common/AsyncResult.swift` (15 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Common/PagedCollection.swift` (94 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Dashboard/DashboardView.swift` (114 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Dashboard/DashboardViewModel.swift` (157 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Login/LoginViewModel.swift` (112 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Login/LoginViews.swift` (74 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Outages/OutagesView.swift` (83 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Outages/OutagesViewModel.swift` (119 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Plan/PlanViewModel.swift` (91 lines)

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Appointments/AppointmentViews.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Appointments/AppointmentViews.swift`.

```swift
import SwiftUI
import GoKineticCore
import GoKineticUI

public struct AppointmentsView: View {
    @StateObject private var viewModel: AppointmentsViewModel
    @State private var cancelCandidate: Appointment?
    @State private var cancelReason = ""
    @Environment(\.openURL) private var openURL
    private let dateFormatter = DisplayDateFormatter()

    public init(viewModel: @autoclosure @escaping () -> AppointmentsViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        List {
            AsyncContentView(state: viewModel.state, emptyTitle: L10n.string("appointments.empty"), emptySymbol: "calendar",
                             retry: { Task { await viewModel.load() } }) { content in
                Section(L10n.string("appointments.upcoming")) {
                    if content.upcoming.isEmpty {
                        Text(L10n.string("appointments.noneUpcoming")).foregroundStyle(.secondary)
                    }
                    ForEach(content.upcoming) { appointment in upcomingRow(appointment) }
                }
                if !content.past.isEmpty {
                    Section(L10n.string("appointments.past")) {
                        ForEach(content.past) { appointment in
                            AppointmentSummaryRow(appointment: appointment, window: dateFormatter.slotWindow(appointment.slot))
                        }
                    }
                }
            }
            if let error = viewModel.actionError {
                Banner(title: L10n.string(error.titleKey), message: error.detail, tone: .danger,
                       actionTitle: L10n.string("common.dismiss")) { viewModel.actionError = nil }
            }
        }
        .refreshable { await viewModel.load() }
        .navigationTitle(L10n.string("appointments.title"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NavigationLink(value: AppRoute.bookAppointment(type: nil, ticketId: nil)) {
                    Label(L10n.string("appointments.book"), systemImage: "plus")
                }
            }
        }
        .alert(L10n.string("appointments.tooLateTitle"), isPresented: Binding(
            get: { viewModel.callSupportPrompt != nil },
            set: { if !$0 { viewModel.callSupportPrompt = nil } }
        )) {
            if let url = viewModel.supportPhoneURL {
                Button(L10n.string("appointments.callSupport")) { openURL(url) }
            }
            Button(L10n.Common.cancel, role: .cancel) {}
        } message: {
            Text(L10n.string("appointments.tooLateMessage"))
        }
        .alert(L10n.string("appointments.cancelTitle"), isPresented: Binding(
            get: { cancelCandidate != nil },
            set: { if !$0 { cancelCandidate = nil } }
        )) {
            TextField(L10n.string("appointments.cancelReason"), text: $cancelReason)
            Button(L10n.string("appointments.cancelConfirm"), role: .destructive) {
                guard let appointment = cancelCandidate else { return }
                let reason = cancelReason
                cancelReason = ""
                Task { await viewModel.cancel(appointment, reason: reason) }
            }
            Button(L10n.string("appointments.keep"), role: .cancel) {}
        }
    }

    private func upcomingRow(_ appointment: Appointment) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            AppointmentSummaryRow(appointment: appointment, window: dateFormatter.slotWindow(appointment.slot))
            if appointment.status == .scheduled {
                HStack {
                    if viewModel.eligibility(for: appointment) == .allowed {
                        NavigationLink(value: AppRoute.rescheduleAppointment(appointment)) {
                            Text(L10n.string("appointments.reschedule"))
                        }
                        .buttonStyle(.bordered)
                    } else {
                        Button(L10n.string("appointments.reschedule")) { _ = viewModel.requestChange(appointment) }
                            .buttonStyle(.bordered)
                    }
                    Button(L10n.string("appointments.cancel"), role: .destructive) {
                        if viewModel.requestChange(appointment) { cancelCandidate = appointment }
                    }
                    .buttonStyle(.bordered)
                    .disabled(viewModel.cancellingId == appointment.id)
                }
            }
        }
    }
}

struct AppointmentSummaryRow: View {
    let appointment: Appointment
    let window: String

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                Text(L10n.string("appointment.type.\(appointment.type.rawValue.lowercased())")).font(Theme.Typography.headline)
                Spacer()
                StatusBadge(L10n.string("appointment.status.\(appointment.status.rawValue.lowercased())"), tone: appointment.status.tone)
            }
            Text(window).font(.subheadline)
            if let technician = appointment.technicianName {
                Text(L10n.string("appointment.technician", technician)).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

extension AppointmentStatus {
    var tone: Tone {
        switch self {
        case .scheduled: return .info
        case .enRoute, .inProgress: return .warning
        case .completed: return .success
        case .cancelled: return .neutral
        }
    }
}

public struct AppointmentBookingView: View {
    @StateObject private var viewModel: AppointmentBookingViewModel
    @Environment(\.dismiss) private var dismiss
    private let dateFormatter = DisplayDateFormatter()

    public init(viewModel: @autoclosure @escaping () -> AppointmentBookingViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    private var title: String {
        if case .reschedule = viewModel.mode { return L10n.string("appointments.reschedule") }
        return L10n.string("appointments.book")
    }

    public var body: some View {
        Group {
            if case .confirmed(let appointment) = viewModel.phase {
                confirmation(appointment)
            } else {
                form
            }
        }
        .navigationTitle(title)
    }

    private var form: some View {
        Form {
            if viewModel.canChangeType {
                Picker(L10n.string("appointments.visitType"), selection: $viewModel.type) {
                    ForEach(AppointmentType.allCases) { type in
                        Text(L10n.string("appointment.type.\(type.rawValue.lowercased())")).tag(type)
                    }
                }
            }
            if viewModel.slotWasTaken {
                Banner(title: L10n.string("appointments.slotTaken"), tone: .warning)
            }
            Section(L10n.string("appointments.chooseSlot")) {
                AsyncContentView(state: viewModel.days, emptyTitle: L10n.string("appointments.noSlots"), emptySymbol: "calendar.badge.exclamationmark",
                                 retry: { Task { await viewModel.loadSlots() } }) { days in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Theme.Spacing.s) {
                            ForEach(days) { day in
                                dayChip(day)
                            }
                        }
                    }
                    ForEach(viewModel.slotsForSelectedDay) { slot in
                        Button { viewModel.selectedSlotId = slot.id } label: {
                            HStack {
                                Text("\(dateFormatter.time(slot.start)) – \(dateFormatter.time(slot.end))")
                                Spacer()
                                if viewModel.selectedSlotId == slot.id {
                                    Image(systemName: "checkmark").foregroundStyle(Theme.Palette.brand)
                                }
                            }
                        }
                        .foregroundStyle(.primary)
                    }
                }
            }
            if case .book = viewModel.mode {
                Section(L10n.string("appointments.notes")) {
                    TextEditor(text: $viewModel.notes).frame(minHeight: 90)
                    if let message = viewModel.notesMessage {
                        Text(message).font(.footnote).foregroundStyle(Theme.Palette.danger)
                    }
                }
            }
            if let error = viewModel.submitError {
                Banner(title: L10n.string(error.titleKey), message: error.detail, tone: .danger)
            }
            PrimaryButton(L10n.string("appointments.confirm"), isLoading: viewModel.phase == .submitting,
                          isEnabled: viewModel.canConfirm) {
                Task { await viewModel.confirm() }
            }
            .listRowInsets(EdgeInsets())
        }
    }

    private func dayChip(_ day: SlotDay) -> some View {
        let selected = viewModel.selectedDay == day.day
        return Button { viewModel.selectedDay = day.day } label: {
            VStack(spacing: Theme.Spacing.xxs) {
                Text(dateFormatter.shortDate(day.day)).font(.subheadline.weight(.semibold))
                Text(L10n.string("appointments.slotCount", day.slots.count)).font(.caption2)
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.vertical, Theme.Spacing.s)
            .foregroundStyle(selected ? Color.white : Color.primary)
            .background(selected ? Theme.Palette.brand : Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.small))
        }
        .buttonStyle(.plain)
    }

    private func confirmation(_ appointment: Appointment) -> some View {
        VStack(spacing: Theme.Spacing.l) {
            Image(systemName: "calendar.badge.checkmark").font(.system(size: 56)).foregroundStyle(Theme.Palette.success)
            Text(L10n.string("appointments.confirmed")).font(Theme.Typography.title)
            Text(dateFormatter.slotWindow(appointment.slot)).font(Theme.Typography.headline)
            Text(L10n.string("appointments.confirmedDetail")).font(.footnote).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            PrimaryButton(L10n.Common.done) { dismiss() }
        }
        .padding(Theme.Spacing.xl)
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Appointments/AppointmentsViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Appointments/AppointmentsViewModel.swift`.

```swift
import Foundation
import GoKineticCore
import GoKineticUI

/// Engineer visits: upcoming and past, with cancel and the entry point to
/// rescheduling.
@MainActor
public final class AppointmentsViewModel: ObservableObject {
    public struct Content: Equatable {
        public let upcoming: [Appointment]
        public let past: [Appointment]
    }

    @Published public private(set) var state: ViewState<Content> = .idle
    @Published public private(set) var cancellingId: String?
    @Published public var actionError: UserFacingError?
    /// Set when the customer asks to change a visit that is inside the
    /// cutoff; the view offers to call support instead.
    @Published public var callSupportPrompt: Appointment?

    public let supportPhone: String
    private let appointments: AppointmentRepository
    private let analytics: AnalyticsTracking
    private let clock: Clock

    public init(appointments: AppointmentRepository, analytics: AnalyticsTracking, clock: Clock, supportPhone: String) {
        self.appointments = appointments
        self.analytics = analytics
        self.clock = clock
        self.supportPhone = supportPhone
    }

    public func load() async {
        state = state.reloading()
        do {
            let all = try await appointments.appointments()
            let now = clock.now()
            // The repository splits by status; a scheduled visit whose window
            // has fully passed belongs with the history.
            let upcoming = all.filter { $0.isUpcoming && $0.slot.end > now }
            let past = all.filter { !upcoming.contains($0) }
            state = all.isEmpty ? .empty : .loaded(Content(upcoming: upcoming, past: past))
        } catch {
            state = state.failing(error)
        }
    }

    public func eligibility(for appointment: Appointment) -> AppointmentPolicy.ChangeEligibility {
        AppointmentPolicy.eligibility(for: appointment, at: clock.now())
    }

    /// Returns true when the caller may proceed to the reschedule screen.
    public func requestChange(_ appointment: Appointment) -> Bool {
        switch eligibility(for: appointment) {
        case .allowed:
            return true
        case .tooLate:
            callSupportPrompt = appointment
            return false
        case .notChangeable:
            actionError = UserFacingError(kind: .notAllowed, titleKey: "appointment.error.notChangeable", isRetryable: false)
            return false
        }
    }

    public func cancel(_ appointment: Appointment, reason: String?) async {
        guard cancellingId == nil, requestChange(appointment) else { return }
        cancellingId = appointment.id
        defer { cancellingId = nil }
        let trimmed = reason?.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await appointments.cancel(appointmentId: appointment.id, reason: trimmed?.isEmpty == false ? trimmed : nil)
            analytics.track(.appointmentCancelled)
            await load()
        } catch {
            actionError = UserFacingError(error)
        }
    }

    public var supportPhoneURL: URL? {
        let digits = supportPhone.filter { $0.isNumber || $0 == "+" }
        return digits.isEmpty ? nil : URL(string: "tel:\(digits)")
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Billing/BillingViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Billing/BillingViewModel.swift`.

```swift
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
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Billing/BillingViews.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Billing/BillingViews.swift`.

```swift
import SwiftUI
import GoKineticCore
import GoKineticUI

public struct BillingView: View {
    @StateObject private var viewModel: BillingViewModel
    private let dateFormatter = DisplayDateFormatter()

    public init(viewModel: @autoclosure @escaping () -> BillingViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        List {
            Section {
                AsyncContentView(state: viewModel.overview, emptyTitle: L10n.Billing.noInvoices,
                                 retry: { Task { await viewModel.load(forceRefresh: true) } }) { overview in
                    overviewCard(overview)
                }
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)

            if let error = viewModel.inlineError {
                Banner(title: L10n.string(error.titleKey), message: error.detail, tone: .warning,
                       actionTitle: L10n.string("common.dismiss")) { viewModel.inlineError = nil }
            }

            Section(L10n.Billing.history) {
                AsyncContentView(state: viewModel.invoices, emptyTitle: L10n.Billing.noInvoices, emptySymbol: "doc.text",
                                 retry: { Task { await viewModel.load() } }) { invoices in
                    ForEach(invoices) { invoice in
                        NavigationLink(value: DeepLink.invoice(id: invoice.id).route) {
                            InvoiceRowView(row: viewModel.row(for: invoice))
                        }
                        .task { await viewModel.loadMoreIfNeeded(current: invoice) }
                    }
                    if viewModel.isLoadingMore {
                        ProgressView().frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .refreshable { await viewModel.load(forceRefresh: true) }
        .navigationTitle(L10n.Tabs.billing)
    }

    private func overviewCard(_ overview: BillingViewModel.Overview) -> some View {
        Card(title: L10n.Billing.balance) {
            Text(overview.balanceText).font(Theme.Typography.metric)
            if let next = overview.nextBillDate {
                Text(L10n.string("billing.nextBill", dateFormatter.longDate(next)))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if overview.balance.isPositive {
                NavigationLink(value: DeepLink.payBill(invoiceId: nil).route) {
                    Text(L10n.Billing.payNow).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }
            Divider()
            Toggle(isOn: Binding(
                get: { overview.autopay.enabled },
                set: { enabled in Task { await viewModel.setAutopay(enabled: enabled) } }
            )) {
                VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                    Text(L10n.Billing.autopay)
                    if let method = overview.autopayMethod, overview.autopay.enabled {
                        Text(method.displayName).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .disabled(viewModel.isUpdatingAutopay)
        }
        .padding(.vertical, Theme.Spacing.s)
    }
}

struct InvoiceRowView: View {
    let row: BillingViewModel.InvoiceRow

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                Text(row.invoice.number).font(Theme.Typography.headline)
                Text(row.periodText).font(.footnote).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: Theme.Spacing.xxs) {
                Text(row.amountText).monospacedDigit()
                StatusBadge(L10n.string(row.statusKey), tone: row.tone)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

public struct InvoiceDetailView: View {
    @StateObject private var viewModel: InvoiceDetailViewModel
    @Environment(\.openURL) private var openURL

    public init(viewModel: @autoclosure @escaping () -> InvoiceDetailViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        ScrollView {
            AsyncContentView(state: viewModel.state, emptyTitle: L10n.string("error.notFound"),
                             retry: { Task { await viewModel.load() } }) { content in
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    summary(content)
                    breakdown(content)
                    if let error = viewModel.documentError {
                        Banner(title: L10n.string(error.titleKey), tone: .warning)
                    }
                    SecondaryButton(L10n.string("invoice.downloadPDF")) {
                        Task { await viewModel.openDocument() }
                    }
                    .disabled(viewModel.isFetchingDocument)
                    if viewModel.canPay {
                        NavigationLink(value: DeepLink.payBill(invoiceId: content.invoice.id).route) {
                            Text(L10n.Billing.payNow).font(Theme.Typography.headline).frame(maxWidth: .infinity, minHeight: 50)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
                .padding(Theme.Spacing.l)
            }
        }
        .navigationTitle(viewModel.state.value?.invoice.number ?? L10n.string("invoice.title"))
        .onChange(of: viewModel.documentURL) { url in
            guard let url else { return }
            openURL(url)
            viewModel.documentURL = nil
        }
    }

    private func summary(_ content: InvoiceDetailViewModel.Content) -> some View {
        Card {
            HStack {
                Text(content.totalText).font(Theme.Typography.metric)
                Spacer()
                StatusBadge(L10n.string("invoice.status.\(content.effectiveStatus.rawValue.lowercased())"),
                            tone: content.effectiveStatus.tone)
            }
            Text(content.dueText).font(.subheadline).foregroundStyle(.secondary)
            if !content.invoice.isSettled && content.amountDueText != content.totalText {
                Text(L10n.string("invoice.amountDue", content.amountDueText)).font(.subheadline)
            }
        }
    }

    private func breakdown(_ content: InvoiceDetailViewModel.Content) -> some View {
        Card(title: L10n.string("invoice.breakdown")) {
            if content.breakdownIncomplete {
                Banner(title: L10n.string("invoice.breakdownIncomplete"), tone: .info)
            } else {
                ForEach(content.subtotals) { line in amountRow(line, emphasised: true) }
                Divider()
                ForEach(content.lines) { line in amountRow(line, emphasised: false) }
            }
        }
    }

    private func amountRow(_ line: InvoiceDetailViewModel.Line, emphasised: Bool) -> some View {
        HStack {
            Text(line.label).font(emphasised ? .subheadline.weight(.semibold) : .subheadline)
            Spacer()
            Text(line.amountText).monospacedDigit()
                .foregroundStyle(line.isCredit ? Theme.Palette.success : .primary)
        }
    }
}

public struct PayBillView: View {
    @StateObject private var viewModel: PayBillViewModel
    @Environment(\.dismiss) private var dismiss
    private let dateFormatter = DisplayDateFormatter()

    public init(viewModel: @autoclosure @escaping () -> PayBillViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        Group {
            if case .succeeded(let payment) = viewModel.phase {
                receipt(payment)
            } else {
                AsyncContentView(state: viewModel.setup, emptyTitle: L10n.string("payment.nothingDue"),
                                 retry: { Task { await viewModel.load() } }) { setup in
                    form(setup)
                }
            }
        }
        .navigationTitle(L10n.Billing.payNow)
    }

    private func form(_ setup: PayBillViewModel.Setup) -> some View {
        Form {
            Section(L10n.string("payment.amount")) {
                Picker(L10n.string("payment.amount"), selection: $viewModel.amountChoice) {
                    ForEach(setup.options) { option in
                        HStack {
                            Text(viewModel.label(for: option))
                            Spacer()
                            Text(viewModel.amountText(option.amount)).monospacedDigit()
                        }
                        .tag(Optional(PayBillViewModel.AmountChoice.option(option.id)))
                    }
                    Text(L10n.string("payment.option.custom")).tag(Optional(PayBillViewModel.AmountChoice.custom))
                }
                .pickerStyle(.inline)
                .labelsHidden()
                if viewModel.amountChoice == .custom {
                    ValidatedField(L10n.string("payment.customAmount"), text: $viewModel.customAmountText,
                                   message: viewModel.amountMessage, contentType: .amount)
                        .onChange(of: viewModel.customAmountText) { _ in viewModel.customAmountEdited() }
                } else if let message = viewModel.amountMessage {
                    Text(message).font(.footnote).foregroundStyle(Theme.Palette.danger)
                }
            }

            Section(L10n.string("payment.method")) {
                if setup.methods.isEmpty {
                    Text(L10n.string("payment.noMethods")).foregroundStyle(.secondary)
                } else {
                    Picker(L10n.string("payment.method"), selection: $viewModel.selectedMethodId) {
                        ForEach(setup.methods) { method in
                            Text(method.displayName).tag(Optional(method.id))
                        }
                    }
                }
                if setup.hasExpiredMethods {
                    Text(L10n.string("payment.expiredHidden")).font(.footnote).foregroundStyle(.secondary)
                }
            }

            if case .failed(let failure) = viewModel.phase {
                Section {
                    Banner(title: L10n.string(failure.messageKey), tone: failure == .outcomeUnknown ? .warning : .danger,
                           actionTitle: failure == .outcomeUnknown ? L10n.Common.retry : nil) {
                        Task { await viewModel.retry() }
                    }
                }
            }

            Section {
                PrimaryButton(viewModel.confirmTitle, isLoading: viewModel.phase == .submitting, isEnabled: viewModel.canSubmit) {
                    Task { await viewModel.submit() }
                }
                .listRowInsets(EdgeInsets())
            } footer: {
                Text(L10n.string("payment.footer"))
            }
        }
    }

    private func receipt(_ payment: Payment) -> some View {
        VStack(spacing: Theme.Spacing.l) {
            Image(systemName: payment.status == .pending ? "clock.badge.checkmark" : "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(Theme.Palette.success)
                .accessibilityHidden(true)
            Text(L10n.string(payment.status == .pending ? "payment.processing" : "payment.success"))
                .font(Theme.Typography.title)
            Text(viewModel.amountText(payment.amount)).font(Theme.Typography.metric)
            Text(L10n.string("payment.receiptDetail", payment.methodDisplay, dateFormatter.longDate(payment.createdAt)))
                .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Text(L10n.string("payment.reference", payment.id)).font(.caption).foregroundStyle(.secondary)
            Spacer()
            PrimaryButton(L10n.Common.done) { dismiss() }
        }
        .padding(Theme.Spacing.xl)
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Billing/InvoiceDetailViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Billing/InvoiceDetailViewModel.swift`.

```swift
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
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Billing/PayBillViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Billing/PayBillViewModel.swift`.

```swift
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
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Common/AsyncResult.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Common/AsyncResult.swift`.

```swift
import Foundation

extension Result where Failure == Error {
    /// Async counterpart of `Result(catching:)`, used to run independent
    /// loads in parallel with `async let` without one failure cancelling
    /// the others.
    static func capturing(_ body: () async throws -> Success) async -> Result<Success, Error> {
        do {
            return .success(try await body())
        } catch {
            return .failure(error)
        }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Common/PagedCollection.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Common/PagedCollection.swift`.

```swift
import Foundation
import GoKineticCore
import GoKineticUI

/// Accumulates `{ items, page, pageSize, total }` pages for infinite lists.
/// Items are de-duplicated by id because a record created between two page
/// fetches shifts later pages by one and would otherwise appear twice.
struct PagedCollection<Item: Identifiable & Codable & Sendable> {
    let pageSize: Int
    private(set) var items: [Item] = []
    private(set) var nextPage: Int? = 1
    private(set) var total = 0

    init(pageSize: Int) {
        self.pageSize = pageSize
    }

    var hasMore: Bool { nextPage != nil }

    mutating func reset() {
        items = []
        nextPage = 1
        total = 0
    }

    mutating func append(_ page: Page<Item>) {
        if page.page <= 1 { items = [] }
        var seen = Set(items.map(\.id))
        for item in page.items where seen.insert(item.id).inserted {
            items.append(item)
        }
        total = page.total
        nextPage = page.nextPage
    }

    mutating func replace(_ item: Item) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        items[index] = item
    }

    mutating func prepend(_ item: Item) {
        items.removeAll { $0.id == item.id }
        items.insert(item, at: 0)
        total += 1
    }
}

/// Drives a paged list's `ViewState` through first load, refresh and
/// load-more without duplicating that bookkeeping in every view model.
@MainActor
final class PagedLoader<Item: Identifiable & Codable & Sendable> {
    private(set) var collection: PagedCollection<Item>
    private(set) var isLoadingMore = false
    private let fetch: (Int, Int) async throws -> Page<Item>

    init(pageSize: Int, fetch: @escaping (Int, Int) async throws -> Page<Item>) {
        self.collection = PagedCollection(pageSize: pageSize)
        self.fetch = fetch
    }

    /// Reloads page 1. Callers move their state to `.reloading()` first so
    /// current rows stay visible; on failure those rows are kept as stale.
    func refresh(current: ViewState<[Item]>) async -> ViewState<[Item]> {
        do {
            let page = try await fetch(1, collection.pageSize)
            collection.append(page)
            return state
        } catch {
            return current.failing(error)
        }
    }

    /// Current rows as a view state (`.empty` when there are none).
    var state: ViewState<[Item]> { .from(collection.items) }

    /// Fetches the next page; failures leave the loaded rows untouched and
    /// are returned for a non-blocking inline message.
    func loadMore() async -> UserFacingError? {
        guard let next = collection.nextPage, next > 1, !isLoadingMore else { return nil }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            collection.append(try await fetch(next, collection.pageSize))
            return nil
        } catch {
            return UserFacingError(error)
        }
    }

    func update(_ mutate: (inout PagedCollection<Item>) -> Void) {
        mutate(&collection)
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Dashboard/DashboardView.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Dashboard/DashboardView.swift`.

```swift
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
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Dashboard/DashboardViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Dashboard/DashboardViewModel.swift`.

```swift
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
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Login/LoginViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Login/LoginViewModel.swift`.

```swift
import Foundation
import GoKineticCore

@MainActor
public final class LoginViewModel: ObservableObject {
    @Published public private(set) var isSigningIn = false
    @Published public private(set) var errorMessageKey: String?
    @Published public var loginHint = ""

    private let session: AuthSession
    private let analytics: AnalyticsTracking

    public init(session: AuthSession, analytics: AnalyticsTracking) {
        self.session = session
        self.analytics = analytics
    }

    public func signIn() async {
        guard !isSigningIn else { return }
        isSigningIn = true
        errorMessageKey = nil
        analytics.track(.loginStarted)
        defer { isSigningIn = false }

        let hint = loginHint.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await session.signIn(loginHint: hint.isEmpty ? nil : hint)
            analytics.track(.loginSucceeded(method: "oidc"))
        } catch {
            let (key, reason) = Self.describe(error)
            errorMessageKey = key
            if let reason { analytics.track(.loginFailed(reason: reason)) }
        }
    }

    /// Maps sign-in failures to copy. Cancellation is silent: the user
    /// closed the browser sheet on purpose.
    static func describe(_ error: Error) -> (key: String?, reason: String?) {
        switch error {
        case AuthError.userCancelled:
            return (nil, nil)
        case AuthError.roleNotPermitted:
            return ("login.notConsumer", "role")
        case AuthError.stateMismatch, AuthError.nonceMismatch, AuthError.invalidCallback:
            return ("login.error.security", "callback")
        case AuthError.provider(let code, _):
            return ("login.error.provider", code)
        case AuthError.tokenExchangeFailed, AuthError.invalidTokenResponse:
            return ("login.error.generic", "token")
        case APIError.offline, APIError.timedOut:
            return ("error.offline", "offline")
        default:
            return ("login.error.generic", "unknown")
        }
    }
}

@MainActor
public final class BiometricLockViewModel: ObservableObject {
    @Published public private(set) var isAuthenticating = false
    @Published public private(set) var failed = false
    public let biometry: BiometryKind

    private let session: AuthSession
    private let analytics: AnalyticsTracking
    private let reason: String
    private var hasAutoPrompted = false

    public init(session: AuthSession, biometrics: BiometricAuthenticating, analytics: AnalyticsTracking, reason: String) {
        self.session = session
        self.analytics = analytics
        self.reason = reason
        self.biometry = biometrics.availableBiometry()
    }

    public var symbolName: String {
        switch biometry {
        case .faceID: return "faceid"
        case .touchID: return "touchid"
        case .opticID: return "opticid"
        case .none: return "lock.fill"
        }
    }

    /// Prompts automatically once when the lock screen first appears.
    public func onAppear() async {
        guard !hasAutoPrompted else { return }
        hasAutoPrompted = true
        await unlock()
    }

    public func unlock() async {
        guard !isAuthenticating else { return }
        isAuthenticating = true
        failed = false
        defer { isAuthenticating = false }
        do {
            let success = try await session.unlockWithBiometrics(reason: reason)
            failed = !success
            analytics.track(.biometricUnlock(success: success))
        } catch {
            failed = true
            analytics.track(.biometricUnlock(success: false))
        }
    }

    /// Falls back to a full OIDC login, discarding the stored session.
    public func usePasswordInstead() async {
        await session.signOut()
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Login/LoginViews.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Login/LoginViews.swift`.

```swift
import SwiftUI
import GoKineticCore
import GoKineticUI

public struct LoginView: View {
    @StateObject private var viewModel: LoginViewModel

    public init(viewModel: @autoclosure @escaping () -> LoginViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        VStack(spacing: Theme.Spacing.xl) {
            Spacer()
            Image(systemName: "bolt.horizontal.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(Theme.Palette.brand)
                .accessibilityHidden(true)
            VStack(spacing: Theme.Spacing.s) {
                Text(L10n.Login.title).font(Theme.Typography.display)
                Text(L10n.Login.subtitle)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            ValidatedField(L10n.string("login.emailOptional"), text: $viewModel.loginHint, contentType: .email)
            if let key = viewModel.errorMessageKey {
                Banner(title: L10n.string(key), tone: .danger)
            }
            Spacer()
            PrimaryButton(L10n.Login.signIn, isLoading: viewModel.isSigningIn) {
                Task { await viewModel.signIn() }
            }
            Text(L10n.string("login.footer"))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(Theme.Spacing.xl)
    }
}

public struct BiometricLockView: View {
    @StateObject private var viewModel: BiometricLockViewModel

    public init(viewModel: @autoclosure @escaping () -> BiometricLockViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        VStack(spacing: Theme.Spacing.xl) {
            Spacer()
            Image(systemName: viewModel.symbolName)
                .font(.system(size: 64))
                .foregroundStyle(Theme.Palette.brand)
                .accessibilityHidden(true)
            Text(L10n.string("lock.title")).font(Theme.Typography.title)
            if viewModel.failed {
                Banner(title: L10n.string("lock.failed"), tone: .warning)
            }
            Spacer()
            PrimaryButton(L10n.Login.unlock, isLoading: viewModel.isAuthenticating) {
                Task { await viewModel.unlock() }
            }
            Button(L10n.Login.usePassword) {
                Task { await viewModel.usePasswordInstead() }
            }
            .font(.subheadline)
        }
        .padding(Theme.Spacing.xl)
        .task { await viewModel.onAppear() }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Outages/OutagesView.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Outages/OutagesView.swift`.

```swift
import SwiftUI
import GoKineticCore
import GoKineticUI

public struct OutagesView: View {
    @StateObject private var viewModel: OutagesViewModel
    private let dateFormatter = DisplayDateFormatter()

    public init(viewModel: @autoclosure @escaping () -> OutagesViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        List {
            AsyncContentView(state: viewModel.state, emptyTitle: L10n.string("health.unknown"),
                             retry: { Task { await viewModel.load() } }) { content in
                Section {
                    healthHeader(content.health)
                }
                Section(L10n.string("outages.active")) {
                    if content.active.isEmpty {
                        Text(L10n.string("outages.noneActive")).foregroundStyle(.secondary)
                    }
                    ForEach(content.active) { outage in outageRow(viewModel.row(for: outage)) }
                }
                if !content.resolved.isEmpty {
                    Section(L10n.string("outages.recentlyResolved")) {
                        ForEach(content.resolved) { outage in outageRow(viewModel.row(for: outage)) }
                    }
                }
            }
            if let updated = viewModel.lastUpdated {
                Text(L10n.string("outages.lastUpdated", dateFormatter.time(updated)))
                    .font(.caption).foregroundStyle(.secondary)
                    .listRowBackground(Color.clear)
            }
        }
        .refreshable { await viewModel.load() }
        .navigationTitle(L10n.string("outages.title"))
        .onAppear { viewModel.startAutoRefresh() }
        .onDisappear { viewModel.stopAutoRefresh() }
    }

    private func healthHeader(_ health: ServiceHealth) -> some View {
        let tone = viewModel.healthTone(health)
        return VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Label(L10n.string(health.headlineKey), systemImage: tone.symbol)
                .font(Theme.Typography.headline)
                .foregroundStyle(tone.color)
            if case .degraded(let issues) = health {
                ForEach(issues, id: \.self) { issue in
                    Text("• " + L10n.string(issue.messageKey)).font(.subheadline)
                }
            }
            if health.suggestsTroubleshooting {
                NavigationLink(value: AppRoute.troubleshoot) {
                    Text(L10n.string("outages.troubleshoot"))
                }
            }
        }
        .padding(.vertical, Theme.Spacing.xs)
    }

    private func outageRow(_ row: OutagesViewModel.OutageRow) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                Text(row.outage.title).font(Theme.Typography.headline)
                Spacer()
                StatusBadge(L10n.string("outage.severity.\(row.outage.severity.rawValue.lowercased())"), tone: row.outage.severity.tone)
            }
            Text(row.outage.detail).font(.subheadline).foregroundStyle(.secondary)
            HStack(spacing: Theme.Spacing.s) {
                if row.outage.affectsMyService && row.outage.isActive {
                    StatusBadge(L10n.string("outage.affectsYou"), tone: .warning)
                }
                Text(row.timingText).font(.caption)
                    .foregroundStyle(row.isDelayed ? Theme.Palette.warning : .secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Outages/OutagesViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Outages/OutagesViewModel.swift`.

```swift
import Foundation
import GoKineticCore
import GoKineticUI

/// Service status: overall health verdict plus the outage list, refreshed
/// periodically while the screen is visible.
@MainActor
public final class OutagesViewModel: ObservableObject {
    public struct Content: Equatable {
        public let health: ServiceHealth
        public let active: [Outage]
        public let resolved: [Outage]
    }

    public struct OutageRow: Equatable, Identifiable {
        public let outage: Outage
        public let timingText: String
        public let isDelayed: Bool
        public var id: String { outage.id }
    }

    /// Resolved incidents older than this are not interesting to customers.
    static let resolvedLookback: TimeInterval = 72 * 3600

    @Published public private(set) var state: ViewState<Content> = .idle
    @Published public private(set) var lastUpdated: Date?

    public let serviceId: String
    private let outages: OutageRepository
    private let router: RouterRepository
    private let clock: Clock
    private let sleeper: Sleeper
    private let refreshInterval: TimeInterval
    private let dateFormatter: DisplayDateFormatter
    private var refreshTask: Task<Void, Never>?

    public init(serviceId: String, outages: OutageRepository, router: RouterRepository, clock: Clock,
                sleeper: Sleeper = TaskSleeper(), refreshInterval: TimeInterval = 120,
                dateFormatter: DisplayDateFormatter = DisplayDateFormatter()) {
        self.serviceId = serviceId
        self.outages = outages
        self.router = router
        self.clock = clock
        self.sleeper = sleeper
        self.refreshInterval = refreshInterval
        self.dateFormatter = dateFormatter
    }

    deinit { refreshTask?.cancel() }

    /// Outages are required; router telemetry only sharpens the verdict, so
    /// its failure is tolerated.
    public func load() async {
        state = state.reloading()
        async let routerStatus = Result.capturing { try await router.status(serviceId: serviceId) }
        do {
            let list = try await outages.outages(serviceId: serviceId)
            let status = try? await routerStatus.get()
            state = .loaded(makeContent(outages: list, router: status))
            lastUpdated = clock.now()
        } catch {
            _ = await routerStatus
            state = state.failing(error)
        }
    }

    func makeContent(outages list: [Outage], router status: RouterStatus?) -> Content {
        let now = clock.now()
        let active = list.filter(\.isActive)
        let resolved = list
            .filter { outage in outage.resolvedAt.map { now.timeIntervalSince($0) <= Self.resolvedLookback } ?? false }
            .sorted { ($0.resolvedAt ?? .distantPast) > ($1.resolvedAt ?? .distantPast) }
        let health = ServiceHealthEvaluator.evaluate(outages: list, router: status, latestSpeedTest: nil, plan: nil, now: now)
        return Content(health: health, active: active, resolved: resolved)
    }

    public func row(for outage: Outage) -> OutageRow {
        let now = clock.now()
        let timing: String
        if let resolvedAt = outage.resolvedAt {
            timing = L10n.string("outage.resolvedAt", dateFormatter.relative(resolvedAt, to: now))
        } else if outage.isPastEstimate(at: now) {
            timing = L10n.string("outage.delayed")
        } else if let eta = outage.estimatedResolution {
            timing = L10n.string("outage.eta", dateFormatter.time(eta))
        } else {
            timing = L10n.string("outage.started", dateFormatter.relative(outage.startedAt, to: now))
        }
        return OutageRow(outage: outage, timingText: timing, isDelayed: outage.isPastEstimate(at: now))
    }

    public func healthTone(_ health: ServiceHealth) -> Tone {
        switch health {
        case .operational: return .success
        case .maintenance: return .info
        case .degraded: return .warning
        case .outage: return .danger
        case .unknown: return .neutral
        }
    }

    public func startAutoRefresh() {
        guard refreshTask == nil else { return }
        let sleeper = self.sleeper, interval = refreshInterval
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                do { try await sleeper.sleep(seconds: interval) } catch { return }
                guard let self else { return }
                await self.load()
            }
        }
    }

    public func stopAutoRefresh() {
        refreshTask?.cancel()
        refreshTask = nil
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Plan/PlanViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Plan/PlanViewModel.swift`.

```swift
import Foundation
import GoKineticCore
import GoKineticUI

/// "My plan": current tier, contract status, pending change and the list
/// of faster tiers available at the service address.
@MainActor
public final class PlanViewModel: ObservableObject {
    public struct Content: Equatable {
        public let current: CurrentPlan
        public let upgrades: [UpgradeOption]
        public let contractMonthsRemaining: Int
    }

    public struct UpgradeOption: Equatable, Identifiable {
        public let plan: Plan
        public let priceText: String
        public let deltaText: String
        public let speedMultiplierText: String?
        public let isRecommended: Bool
        public var id: String { plan.id }
    }

    @Published public private(set) var state: ViewState<Content> = .idle

    public let serviceId: String
    private let plans: PlanRepository
    private let clock: Clock
    private let formatter: MoneyFormatter

    public init(serviceId: String, plans: PlanRepository, clock: Clock, formatter: MoneyFormatter = MoneyFormatter()) {
        self.serviceId = serviceId
        self.plans = plans
        self.clock = clock
        self.formatter = formatter
    }

    public func load() async {
        state = state.reloading()
        do {
            async let currentTask = plans.currentPlan(serviceId: serviceId)
            async let catalogTask = plans.availablePlans(serviceId: serviceId)
            let (current, catalog) = try await (currentTask, catalogTask)
            state = .loaded(Content(
                current: current,
                upgrades: makeOptions(current: current.plan, catalog: catalog),
                contractMonthsRemaining: current.monthsRemaining(asOf: clock.now())
            ))
        } catch {
            state = state.failing(error)
        }
    }

    /// Only genuine upgrades, priced against the current plan. The cheapest
    /// option at least twice as fast is flagged as recommended.
    func makeOptions(current: Plan, catalog: [Plan]) -> [UpgradeOption] {
        let upgrades = catalog
            .filter { $0.id != current.id && $0.isUpgrade(from: current) && $0.monthlyPrice.currency == current.monthlyPrice.currency }
            .sorted { $0.downloadMbps < $1.downloadMbps }
        let recommendedId = upgrades
            .filter { $0.downloadMbps >= current.downloadMbps * 2 }
            .min { $0.monthlyPrice < $1.monthlyPrice }?.id

        return upgrades.map { plan in
            let delta = (try? plan.monthlyPrice.subtracting(current.monthlyPrice)) ?? .zero(plan.monthlyPrice.currency)
            let deltaText: String
            if delta.isPositive {
                deltaText = L10n.string("plan.deltaMore", formatter.compactString(from: delta))
            } else if delta.isNegative {
                deltaText = L10n.string("plan.deltaLess", formatter.compactString(from: delta.absolute))
            } else {
                deltaText = L10n.string("plan.deltaSame")
            }
            let multiplier = current.downloadMbps > 0 ? Double(plan.downloadMbps) / Double(current.downloadMbps) : 0
            let multiplierText = multiplier >= 1.5 ? String(format: "%.0f×", multiplier.rounded()) : nil
            return UpgradeOption(plan: plan,
                                 priceText: formatter.compactString(from: plan.monthlyPrice) + L10n.Common.perMonth,
                                 deltaText: deltaText,
                                 speedMultiplierText: multiplierText,
                                 isRecommended: plan.id == recommendedId)
        }
    }

    /// Upgrades are blocked while another plan change is in flight.
    public var canStartUpgrade: Bool {
        guard let content = state.value else { return false }
        if let pending = content.current.pendingChange, !pending.status.isTerminal { return false }
        return !content.upgrades.isEmpty
    }
}
```
