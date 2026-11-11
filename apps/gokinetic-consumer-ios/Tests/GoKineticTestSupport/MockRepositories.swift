import Foundation
import GoKineticCore

public final class MockAccountRepository: AccountRepository, @unchecked Sendable {
    public let profileStub = Stub<UserProfile>()
    public let summaryStub = Stub<AccountSummary>()
    public let updateStub = Stub<UserProfile>()
    public let updates = Recorder<(email: String?, phone: String?)>()

    public init() {}

    public func profile(forceRefresh: Bool) async throws -> UserProfile { try profileStub.next() }
    public func summary(forceRefresh: Bool) async throws -> AccountSummary { try summaryStub.next() }
    public func updateContact(email: String?, phone: String?) async throws -> UserProfile {
        updates.record((email, phone))
        return try updateStub.next()
    }
    public func clearCache() async {}
}

public final class MockBillingRepository: BillingRepository, @unchecked Sendable {
    public let invoicesStub = Stub<Page<Invoice>>()
    public let invoiceStub = Stub<Invoice>()
    public let pdfStub = Stub<URL>()
    public let methodsStub = Stub<[PaymentMethod]>()
    public let paymentsStub = Stub<Page<Payment>>()
    public let payStub = Stub<Payment>()
    public let autopayStub = Stub<AutopaySettings>()
    public let setAutopayStub = Stub<AutopaySettings>()
    public let payRequests = Recorder<PaymentRequest>()
    public let autopayRequests = Recorder<AutopaySettings>()
    public let invoicePages = Recorder<Int>()

    public init() {}

    public func invoices(page: Int, pageSize: Int) async throws -> Page<Invoice> {
        invoicePages.record(page)
        return try invoicesStub.next()
    }
    public func invoice(id: String) async throws -> Invoice { try invoiceStub.next() }
    public func invoicePDF(id: String) async throws -> URL { try pdfStub.next() }
    public func paymentMethods() async throws -> [PaymentMethod] { try methodsStub.next() }
    public func payments(page: Int, pageSize: Int) async throws -> Page<Payment> { try paymentsStub.next() }
    public func pay(_ request: PaymentRequest) async throws -> Payment {
        payRequests.record(request)
        return try payStub.next()
    }
    public func autopay() async throws -> AutopaySettings { try autopayStub.next() }
    public func setAutopay(_ settings: AutopaySettings) async throws -> AutopaySettings {
        autopayRequests.record(settings)
        return try setAutopayStub.next()
    }
    public func invalidate() async {}
}

public final class MockUsageRepository: UsageRepository, @unchecked Sendable {
    public let usageStub = Stub<UsageReport>()
    public let periods = Recorder<UsagePeriod>()
    public init() {}
    public func usage(serviceId: String, period: UsagePeriod, forceRefresh: Bool) async throws -> UsageReport {
        periods.record(period)
        return try usageStub.next()
    }
}

public final class MockRouterRepository: RouterRepository, @unchecked Sendable {
    public let statusStub = Stub<RouterStatus>()
    public let rebootStub = Stub<Void>([.success(())])
    public let wifiStub = Stub<WiFiNetwork>()
    public let devicesStub = Stub<[ConnectedDevice]>()
    public let deviceUpdateStub = Stub<ConnectedDevice>()
    public let reboots = Recorder<String>()
    public let wifiRequests = Recorder<WiFiUpdateRequest>()

    public init() {}

    public func status(serviceId: String) async throws -> RouterStatus { try statusStub.next() }
    public func reboot(routerId: String) async throws {
        reboots.record(routerId)
        try rebootStub.next()
    }
    public func updateWiFi(routerId: String, _ request: WiFiUpdateRequest) async throws -> WiFiNetwork {
        wifiRequests.record(request)
        return try wifiStub.next()
    }
    public func connectedDevices(routerId: String) async throws -> [ConnectedDevice] { try devicesStub.next() }
    public func setDeviceBlocked(routerId: String, deviceId: String, blocked: Bool) async throws -> ConnectedDevice {
        try deviceUpdateStub.next()
    }
    public func renameDevice(routerId: String, deviceId: String, name: String) async throws -> ConnectedDevice {
        try deviceUpdateStub.next()
    }
}

public final class MockOutageRepository: OutageRepository, @unchecked Sendable {
    public let outagesStub = Stub<[Outage]>([.success([])])
    public init() {}
    public func outages(serviceId: String) async throws -> [Outage] { try outagesStub.next() }
}

public final class MockSupportRepository: SupportRepository, @unchecked Sendable {
    public let ticketsStub = Stub<Page<Ticket>>()
    public let ticketStub = Stub<Ticket>()
    public let createStub = Stub<Ticket>()
    public let commentStub = Stub<TicketComment>()
    public let chatStub = Stub<ChatSession>()
    public let created = Recorder<(request: NewTicketRequest, key: String)>()
    public let ticketQueries = Recorder<(page: Int, includeClosed: Bool)>()

    public init() {}

    public func tickets(page: Int, pageSize: Int, includeClosed: Bool) async throws -> Page<Ticket> {
        ticketQueries.record((page, includeClosed))
        return try ticketsStub.next()
    }
    public func ticket(id: String) async throws -> Ticket { try ticketStub.next() }
    public func createTicket(_ request: NewTicketRequest, idempotencyKey: String) async throws -> Ticket {
        created.record((request, idempotencyKey))
        return try createStub.next()
    }
    public func addComment(ticketId: String, body: String) async throws -> TicketComment { try commentStub.next() }
    public func startChat(topic: TicketCategory, ticketId: String?) async throws -> ChatSession { try chatStub.next() }
}

public final class MockAppointmentRepository: AppointmentRepository, @unchecked Sendable {
    public let listStub = Stub<[Appointment]>()
    public let slotsStub = Stub<[TimeSlot]>()
    public let bookStub = Stub<Appointment>()
    public let rescheduleStub = Stub<Appointment>()
    public let cancelStub = Stub<Void>([.success(())])
    public let bookings = Recorder<(request: BookAppointmentRequest, key: String)>()
    public let cancellations = Recorder<(id: String, reason: String?)>()

    public init() {}

    public func appointments() async throws -> [Appointment] { try listStub.next() }
    public func availableSlots(type: AppointmentType, from: Date, days: Int) async throws -> [TimeSlot] { try slotsStub.next() }
    public func book(_ request: BookAppointmentRequest, idempotencyKey: String) async throws -> Appointment {
        bookings.record((request, idempotencyKey))
        return try bookStub.next()
    }
    public func reschedule(appointmentId: String, slotId: String) async throws -> Appointment { try rescheduleStub.next() }
    public func cancel(appointmentId: String, reason: String?) async throws {
        cancellations.record((appointmentId, reason))
        try cancelStub.next()
    }
}

public final class MockNotificationRepository: NotificationRepository, @unchecked Sendable {
    public let preferencesStub = Stub<NotificationPreferences>()
    public let updates = Recorder<NotificationPreferences>()
    /// When set, updates fail with this error; otherwise the server echoes the request.
    public var updateError: Error?
    /// Invoked during each update, letting tests flip toggles mid-save.
    public var onUpdate: (@Sendable () async -> Void)?

    public init() {}

    public func register(_ registration: DeviceRegistration) async throws {}
    public func unregister(token: String) async throws {}
    public func preferences() async throws -> NotificationPreferences { try preferencesStub.next() }
    public func updatePreferences(_ preferences: NotificationPreferences) async throws -> NotificationPreferences {
        updates.record(preferences)
        await onUpdate?()
        if let updateError { throw updateError }
        return preferences
    }
}
