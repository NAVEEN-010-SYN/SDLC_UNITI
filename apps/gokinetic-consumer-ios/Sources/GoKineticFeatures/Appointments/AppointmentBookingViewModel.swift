import Foundation
import GoKineticCore
import GoKineticUI

/// Books a new engineer visit or moves an existing one to another slot.
@MainActor
public final class AppointmentBookingViewModel: ObservableObject {
    public enum Mode: Equatable {
        case book(ticketId: String?)
        case reschedule(Appointment)
    }

    public enum Phase: Equatable {
        case choosing
        case submitting
        case confirmed(Appointment)
    }

    @Published public private(set) var days: ViewState<[SlotDay]> = .idle
    @Published public private(set) var phase: Phase = .choosing
    @Published public var type: AppointmentType {
        didSet { if type != oldValue { selectedSlotId = nil; Task { await loadSlots() } } }
    }
    @Published public var selectedDay: Date?
    @Published public var selectedSlotId: String? {
        didSet { if selectedSlotId != oldValue { idempotencyKey = UUID().uuidString } }
    }
    @Published public var notes = ""
    @Published public private(set) var submitError: UserFacingError?
    /// The chosen slot was taken by someone else; slots have been refreshed.
    @Published public private(set) var slotWasTaken = false

    public let mode: Mode
    private let appointments: AppointmentRepository
    private let analytics: AnalyticsTracking
    private let clock: Clock
    private let calendar: Calendar
    private var idempotencyKey = UUID().uuidString

    public init(mode: Mode, type: AppointmentType?, appointments: AppointmentRepository, analytics: AnalyticsTracking,
                clock: Clock, calendar: Calendar = .current) {
        self.mode = mode
        self.appointments = appointments
        self.analytics = analytics
        self.clock = clock
        self.calendar = calendar
        if case .reschedule(let existing) = mode {
            self.type = existing.type
            self.notes = existing.notes ?? ""
        } else {
            self.type = type ?? .repair
        }
    }

    /// The visit type is fixed when rescheduling or when booking against a ticket.
    public var canChangeType: Bool {
        if case .book(let ticketId) = mode { return ticketId == nil }
        return false
    }

    public func loadSlots() async {
        days = days.reloading()
        do {
            let now = clock.now()
            var slots = try await appointments.availableSlots(type: type, from: now, days: AppointmentPolicy.bookingWindowDays)
            if case .reschedule(let existing) = mode {
                slots = AppointmentPolicy.reschedulingOptions(slots, for: existing, at: now)
            }
            let grouped = AppointmentPolicy.groupByDay(slots, calendar: calendar)
            days = .from(grouped)
            if let selectedDay, !grouped.contains(where: { $0.day == selectedDay }) { self.selectedDay = nil }
            if selectedDay == nil { selectedDay = grouped.first?.day }
            if let selectedSlotId, !slots.contains(where: { $0.id == selectedSlotId }) { self.selectedSlotId = nil }
        } catch {
            days = days.failing(error)
        }
    }

    public var slotsForSelectedDay: [TimeSlot] {
        days.value?.first { $0.day == selectedDay }?.slots ?? []
    }

    public var selectedSlot: TimeSlot? {
        days.value?.lazy.flatMap(\.slots).first { $0.id == self.selectedSlotId }
    }

    public var notesMessage: String? {
        AppointmentPolicy.validateNotes(notes).message(for: "notes").map { L10n.string($0) }
    }

    public var canConfirm: Bool {
        phase == .choosing && selectedSlot != nil && notesMessage == nil
    }

    public func confirm() async {
        guard canConfirm, let slot = selectedSlot else { return }
        phase = .submitting
        submitError = nil
        slotWasTaken = false
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let appointment: Appointment
            switch mode {
            case .book(let ticketId):
                appointment = try await appointments.book(
                    BookAppointmentRequest(type: type, slotId: slot.id, notes: trimmedNotes.isEmpty ? nil : trimmedNotes, ticketId: ticketId),
                    idempotencyKey: idempotencyKey)
                analytics.track(.appointmentBooked(type: type.rawValue))
            case .reschedule(let existing):
                appointment = try await appointments.reschedule(appointmentId: existing.id, slotId: slot.id)
            }
            phase = .confirmed(appointment)
        } catch APIError.conflict(let problem) where problem?.code == "slot-unavailable" {
            phase = .choosing
            slotWasTaken = true
            selectedSlotId = nil
            await loadSlots()
        } catch {
            phase = .choosing
            submitError = UserFacingError(error)
        }
    }
}
