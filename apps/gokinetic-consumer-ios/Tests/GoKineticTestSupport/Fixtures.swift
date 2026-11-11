import Foundation
import GoKineticCore

/// Builders for domain values with sensible defaults; tests override only
/// the fields that matter to them.
public enum Fixtures {
    public static func date(_ iso: String) -> Date {
        guard let date = ISO8601.date(from: iso) else { preconditionFailure("Bad fixture date \(iso)") }
        return date
    }

    public static func usd(_ minorUnits: Int64) -> Money { Money(minorUnits: minorUnits, currency: "USD") }

    public static let address = PostalAddress(line1: "1 Fibre Way", city: "Springfield", region: "IL", postalCode: "62701", country: "US")

    public static func summary(balance: Int64 = 8_499, nextBillDate: Date? = date("2025-03-20T00:00:00Z"),
                               autopay: Bool = false) -> AccountSummary {
        AccountSummary(accountId: AccountID(rawValue: "ACC-12345678")!, holderName: "Jo Doe", balance: usd(balance),
                       nextBillDate: nextBillDate, autopayEnabled: autopay,
                       services: [Service(id: "SVC-1", productName: "Fibre 500", planId: "PLN-500", status: .active,
                                          address: address, activatedAt: nil)])
    }

    public static func profile(email: String = "jo@example.com", phone: String? = "+15551234567") -> UserProfile {
        UserProfile(id: "U-1", firstName: "Jo", lastName: "Doe", email: email, phone: phone,
                    roles: ["CONSUMER"], accountId: AccountID(rawValue: "ACC-12345678")!)
    }

    public static func invoice(id: String = "INV-1", total: Int64 = 8_499, paid: Int64 = 0,
                               status: InvoiceStatus = .open, due: Date = date("2025-03-20T00:00:00Z"),
                               lineItems: [LineItem]? = nil) -> Invoice {
        Invoice(id: id, number: "N-\(id)", issuedAt: due.addingTimeInterval(-14 * 86_400), dueAt: due,
                periodStart: due.addingTimeInterval(-30 * 86_400), periodEnd: due,
                total: usd(total), amountPaid: usd(paid), status: status,
                lineItems: lineItems ?? [LineItem(id: "L-\(id)", description: "Fibre 500", amount: usd(total), category: .recurring)])
    }

    public static func method(id: String = "PM-1", isDefault: Bool = true, expiryYear: Int? = 2030) -> PaymentMethod {
        PaymentMethod(id: id, kind: .card, brand: "Visa", last4: "4242", expiryMonth: 12, expiryYear: expiryYear, isDefault: isDefault)
    }

    public static func payment(amount: Int64 = 8_499, status: PaymentStatus = .succeeded, failureReason: String? = nil) -> Payment {
        Payment(id: "PAY-1", amount: usd(amount), createdAt: date("2025-03-10T12:00:00Z"), status: status,
                methodDisplay: "Visa •••• 4242", invoiceId: nil, failureReason: failureReason)
    }

    public static func page<T>(_ items: [T], page: Int = 1, pageSize: Int = 20, total: Int? = nil) -> Page<T> {
        Page(items: items, page: page, pageSize: pageSize, total: total ?? items.count)
    }

    public static func plan(mbps: Int = 500) -> Plan {
        Plan(id: "PLN-\(mbps)", name: "Fibre \(mbps)", downloadMbps: mbps, uploadMbps: mbps,
             monthlyPrice: usd(6_000), contractMonths: 12, features: [])
    }

    public static func network(id: String = "NET-1", ssid: String = "HomeFibre", bands: [WiFiBand] = [.ghz2_4, .ghz5]) -> WiFiNetwork {
        WiFiNetwork(id: id, ssid: ssid, bands: bands, security: .wpa2wpa3, isGuest: false, enabled: true)
    }

    public static func router(state: RouterState = .online) -> RouterStatus {
        RouterStatus(routerId: "RTR-1", model: "GK-X6", firmwareVersion: "6.2.1", state: state, uptimeSeconds: 3_600,
                     lastSeen: date("2025-03-10T11:59:00Z"), networks: [network()])
    }

    public static func device(id: String = "D-1", name: String = "Laptop", band: WiFiBand? = .ghz5, signal: Int? = -50,
                              wired: Bool = false, blocked: Bool = false,
                              lastActive: Date = date("2025-03-10T11:58:00Z")) -> ConnectedDevice {
        ConnectedDevice(id: id, name: name, macAddress: "AA:BB:CC:DD:EE:0\(id.suffix(1))", ipAddress: "192.168.1.10",
                        band: band, isWired: wired, signalDBm: signal, isBlocked: blocked, lastActive: lastActive)
    }

    public static func outage(id: String = "OUT-1", severity: OutageSeverity = .major, affectsMe: Bool = true,
                              started: Date = date("2025-03-10T10:00:00Z"), eta: Date? = nil, resolved: Date? = nil) -> Outage {
        Outage(id: id, title: "Fibre cut", detail: "Crews on site", severity: severity, startedAt: started,
               estimatedResolution: eta, resolvedAt: resolved, affectsMyService: affectsMe)
    }

    public static func ticket(id: String = "T-1", status: TicketStatus = .open, priority: TicketPriority = .p3,
                              category: TicketCategory = .connectivity,
                              updated: Date = date("2025-03-09T12:00:00Z")) -> Ticket {
        Ticket(id: id, reference: "REF-\(id)", subject: "Slow speeds", category: category, priority: priority, status: status,
               createdAt: date("2025-03-01T12:00:00Z"), updatedAt: updated, comments: [])
    }

    public static func slot(id: String, start: String, hours: Double = 4, available: Bool = true) -> TimeSlot {
        let begin = date(start)
        return TimeSlot(id: id, start: begin, end: begin.addingTimeInterval(hours * 3600), available: available)
    }

    public static func appointment(id: String = "APT-1", status: AppointmentStatus = .scheduled,
                                   slot: TimeSlot = Fixtures.slot(id: "S-0", start: "2025-03-14T08:00:00Z")) -> Appointment {
        Appointment(id: id, type: .repair, status: status, slot: slot, technicianName: nil, notes: nil, ticketId: nil)
    }

    public static func speedTest(download: Double, measuredAt: Date = date("2025-03-10T11:00:00Z")) -> SpeedTestResult {
        SpeedTestResult(id: "ST-1", measuredAt: measuredAt, downloadMbps: download, uploadMbps: download,
                        latencyMs: 8, jitterMs: 1, server: "Springfield")
    }

    public static func validationProblem(code: String, field: String? = nil, message: String = "Rejected") -> APIError {
        .validation(ProblemDetails(type: "https://errors.uniti.example/payments/\(code)", title: "Rejected",
                                   errors: field.map { [$0: [message]] }))
    }
}
