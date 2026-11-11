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
