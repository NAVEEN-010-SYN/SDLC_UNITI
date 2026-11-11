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
