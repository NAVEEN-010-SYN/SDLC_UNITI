import Foundation

/// Bookable slots for one local calendar day.
public struct SlotDay: Equatable, Identifiable, Sendable {
    public let day: Date
    public let slots: [TimeSlot]

    public init(day: Date, slots: [TimeSlot]) {
        self.day = day
        self.slots = slots
    }

    public var id: Date { day }
}

/// Business rules for engineer visits shared by booking, rescheduling and
/// cancelling.
public enum AppointmentPolicy {
    /// Changes inside this window must go through the contact centre because
    /// the engineer's route is already planned.
    public static let modificationCutoff: TimeInterval = 24 * 3600
    public static let notesLimit = 500
    public static let bookingWindowDays = 14

    public enum ChangeEligibility: Equatable, Sendable {
        case allowed
        /// Inside the cutoff: the customer must call support.
        case tooLate
        /// Engineer en route, visit underway, or already finished/cancelled.
        case notChangeable
    }

    public static func eligibility(for appointment: Appointment, at date: Date) -> ChangeEligibility {
        guard appointment.status == .scheduled else { return .notChangeable }
        guard appointment.slot.start > date else { return .notChangeable }
        return appointment.canModify(at: date, cutoff: modificationCutoff) ? .allowed : .tooLate
    }

    /// Groups slots by the customer's local day (slots are UTC on the wire),
    /// keeping chronological order inside and across days.
    public static func groupByDay(_ slots: [TimeSlot], calendar: Calendar) -> [SlotDay] {
        let grouped = Dictionary(grouping: slots) { calendar.startOfDay(for: $0.start) }
        return grouped.keys.sorted().map { day in
            SlotDay(day: day, slots: (grouped[day] ?? []).sorted { $0.start < $1.start })
        }
    }

    /// Slots offered when rescheduling: never the appointment's own slot or
    /// one starting at the same time, and never inside the cutoff window.
    public static func reschedulingOptions(_ slots: [TimeSlot], for appointment: Appointment, at date: Date) -> [TimeSlot] {
        slots.filter { slot in
            slot.available
                && slot.id != appointment.slot.id
                && slot.start != appointment.slot.start
                && slot.start.timeIntervalSince(date) >= modificationCutoff
        }
    }

    public static func validateNotes(_ notes: String) -> ValidationResult {
        let trimmed = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count <= notesLimit else {
            return ValidationResult([ValidationIssue(field: "notes", messageKey: "appointment.validation.notesLength")])
        }
        return .valid
    }

    /// Visit type implied by a support ticket, when one is needed at all.
    public static func suggestedType(for category: TicketCategory) -> AppointmentType? {
        switch category {
        case .connectivity: return .repair
        case .equipment: return .equipmentSwap
        case .installation: return .installation
        case .billing, .account, .other: return nil
        }
    }
}
