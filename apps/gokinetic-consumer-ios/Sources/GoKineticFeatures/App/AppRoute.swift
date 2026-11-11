import Foundation
import GoKineticCore

/// Everything a navigation stack can push. Deep links cover the externally
/// addressable screens; the remaining cases carry in-app context (a ticket
/// to attach a visit to, the appointment being moved) that never appears
/// in a URL.
public enum AppRoute: Hashable {
    case link(DeepLink)
    case bookAppointment(type: AppointmentType?, ticketId: String?)
    case rescheduleAppointment(Appointment)
    case editWiFi(routerId: String, network: WiFiNetwork)
    case troubleshoot
    case profile
}

public extension DeepLink {
    var route: AppRoute { .link(self) }
}
