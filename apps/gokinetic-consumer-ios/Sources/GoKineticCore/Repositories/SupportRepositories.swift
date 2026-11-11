import Foundation

// MARK: - Tickets & chat

public protocol SupportRepository: Sendable {
    func tickets(page: Int, pageSize: Int, includeClosed: Bool) async throws -> Page<Ticket>
    func ticket(id: String) async throws -> Ticket
    func createTicket(_ request: NewTicketRequest, idempotencyKey: String) async throws -> Ticket
    func addComment(ticketId: String, body: String) async throws -> TicketComment
    func startChat(topic: TicketCategory, ticketId: String?) async throws -> ChatSession
}

enum SupportEndpoints {
    static func tickets(page: Int, pageSize: Int, includeClosed: Bool) -> Endpoint<Page<Ticket>> {
        var query = [URLQueryItem].pagination(page: page, pageSize: pageSize)
        if !includeClosed {
            query.append(URLQueryItem(name: "status", value: "OPEN,IN_PROGRESS,PENDING_CUSTOMER"))
        }
        return Endpoint(path: "/support/tickets", query: query)
    }

    static func ticket(id: String) -> Endpoint<Ticket> {
        Endpoint(path: "/support/tickets/\(id)")
    }

    static func create(_ request: NewTicketRequest, idempotencyKey: String) throws -> Endpoint<Ticket> {
        try Endpoint(path: "/support/tickets", method: .post, jsonBody: request, idempotencyKey: idempotencyKey)
    }

    struct CommentBody: Encodable { let body: String }

    static func comment(ticketId: String, body: String) throws -> Endpoint<TicketComment> {
        try Endpoint(path: "/support/tickets/\(ticketId)/comments", method: .post, jsonBody: CommentBody(body: body))
    }

    struct ChatBody: Encodable { let topic: TicketCategory; let ticketId: String? }

    static func chat(topic: TicketCategory, ticketId: String?) throws -> Endpoint<ChatSession> {
        try Endpoint(path: "/support/chat/sessions", method: .post, jsonBody: ChatBody(topic: topic, ticketId: ticketId))
    }
}

public final class LiveSupportRepository: SupportRepository {
    private let client: APIClientProtocol

    public init(client: APIClientProtocol) {
        self.client = client
    }

    public func tickets(page: Int, pageSize: Int, includeClosed: Bool) async throws -> Page<Ticket> {
        try await client.send(SupportEndpoints.tickets(page: page, pageSize: pageSize, includeClosed: includeClosed))
    }

    public func ticket(id: String) async throws -> Ticket {
        let ticket = try await client.send(SupportEndpoints.ticket(id: id))
        return Ticket(id: ticket.id, reference: ticket.reference, subject: ticket.subject, category: ticket.category,
                      priority: ticket.priority, status: ticket.status, createdAt: ticket.createdAt,
                      updatedAt: ticket.updatedAt, comments: ticket.comments.sorted { $0.createdAt < $1.createdAt })
    }

    public func createTicket(_ request: NewTicketRequest, idempotencyKey: String) async throws -> Ticket {
        let validation = TicketValidator.validate(subject: request.subject, description: request.description)
        guard validation.isValid else {
            throw APIError.validation(ProblemDetails(title: "Invalid ticket", errors: Dictionary(grouping: validation.issues, by: \.field).mapValues { $0.map(\.messageKey) }))
        }
        let trimmed = NewTicketRequest(subject: request.subject.trimmingCharacters(in: .whitespacesAndNewlines),
                                       description: request.description.trimmingCharacters(in: .whitespacesAndNewlines),
                                       category: request.category, priority: request.priority, serviceId: request.serviceId)
        return try await client.send(SupportEndpoints.create(trimmed, idempotencyKey: idempotencyKey))
    }

    public func addComment(ticketId: String, body: String) async throws -> TicketComment {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard TicketValidator.validateComment(trimmed).isValid else {
            throw APIError.validation(ProblemDetails(title: "Invalid comment", errors: ["comment": ["ticket.validation.commentRequired"]]))
        }
        return try await client.send(SupportEndpoints.comment(ticketId: ticketId, body: trimmed))
    }

    public func startChat(topic: TicketCategory, ticketId: String?) async throws -> ChatSession {
        let session = try await client.send(SupportEndpoints.chat(topic: topic, ticketId: ticketId))
        guard session.websocketURL.scheme == "wss" else {
            throw APIError.decoding("Chat endpoint must use a secure websocket")
        }
        return session
    }
}

// MARK: - Appointments

public protocol AppointmentRepository: Sendable {
    func appointments() async throws -> [Appointment]
    func availableSlots(type: AppointmentType, from: Date, days: Int) async throws -> [TimeSlot]
    func book(_ request: BookAppointmentRequest, idempotencyKey: String) async throws -> Appointment
    func reschedule(appointmentId: String, slotId: String) async throws -> Appointment
    func cancel(appointmentId: String, reason: String?) async throws
}

enum AppointmentEndpoints {
    static func list() -> Endpoint<[Appointment]> {
        Endpoint(path: "/appointments")
    }

    static func slots(type: AppointmentType, from: Date, to: Date) -> Endpoint<[TimeSlot]> {
        Endpoint(path: "/appointments/slots", query: [
            URLQueryItem(name: "type", value: type.rawValue),
            URLQueryItem(name: "from", value: ISO8601.string(from: from)),
            URLQueryItem(name: "to", value: ISO8601.string(from: to))
        ])
    }

    static func book(_ request: BookAppointmentRequest, idempotencyKey: String) throws -> Endpoint<Appointment> {
        try Endpoint(path: "/appointments", method: .post, jsonBody: request, idempotencyKey: idempotencyKey)
    }

    struct RescheduleBody: Encodable { let slotId: String }

    static func reschedule(id: String, slotId: String) throws -> Endpoint<Appointment> {
        try Endpoint(path: "/appointments/\(id)", method: .patch, jsonBody: RescheduleBody(slotId: slotId))
    }

    struct CancelBody: Encodable { let reason: String? }

    static func cancel(id: String, reason: String?) throws -> Endpoint<EmptyResponse> {
        try Endpoint(path: "/appointments/\(id)/cancel", method: .post, jsonBody: CancelBody(reason: reason))
    }
}

public final class LiveAppointmentRepository: AppointmentRepository {
    private let client: APIClientProtocol
    private let clock: Clock

    public init(client: APIClientProtocol, clock: Clock = SystemClock()) {
        self.client = client
        self.clock = clock
    }

    /// Upcoming soonest-first, then past most-recent-first.
    public func appointments() async throws -> [Appointment] {
        let all = try await client.send(AppointmentEndpoints.list())
        let upcoming = all.filter(\.isUpcoming).sorted { $0.slot.start < $1.slot.start }
        let past = all.filter { !$0.isUpcoming }.sorted { $0.slot.start > $1.slot.start }
        return upcoming + past
    }

    /// Available slots only, never in the past, capped to a 30-day window.
    public func availableSlots(type: AppointmentType, from: Date, days: Int) async throws -> [TimeSlot] {
        let now = clock.now()
        let start = max(from, now)
        let window = TimeInterval(min(max(days, 1), 30)) * 86_400
        let slots = try await client.send(AppointmentEndpoints.slots(type: type, from: start, to: start.addingTimeInterval(window)))
        return slots.filter { $0.available && $0.start > now }.sorted { $0.start < $1.start }
    }

    public func book(_ request: BookAppointmentRequest, idempotencyKey: String) async throws -> Appointment {
        try await client.send(AppointmentEndpoints.book(request, idempotencyKey: idempotencyKey))
    }

    public func reschedule(appointmentId: String, slotId: String) async throws -> Appointment {
        try await client.send(AppointmentEndpoints.reschedule(id: appointmentId, slotId: slotId))
    }

    public func cancel(appointmentId: String, reason: String?) async throws {
        _ = try await client.send(AppointmentEndpoints.cancel(id: appointmentId, reason: reason))
    }
}

// MARK: - Notifications

public protocol NotificationRepository: Sendable {
    func register(_ registration: DeviceRegistration) async throws
    func unregister(token: String) async throws
    func preferences() async throws -> NotificationPreferences
    func updatePreferences(_ preferences: NotificationPreferences) async throws -> NotificationPreferences
}

enum NotificationEndpoints {
    static func register(_ registration: DeviceRegistration) throws -> Endpoint<EmptyResponse> {
        try Endpoint(path: "/notifications/devices", method: .put, jsonBody: registration)
    }

    static func unregister(token: String) -> Endpoint<EmptyResponse> {
        Endpoint(path: "/notifications/devices/\(token)", method: .delete)
    }

    static func preferences() -> Endpoint<NotificationPreferences> {
        Endpoint(path: "/notifications/preferences")
    }

    static func update(_ preferences: NotificationPreferences) throws -> Endpoint<NotificationPreferences> {
        try Endpoint(path: "/notifications/preferences", method: .put, jsonBody: preferences)
    }
}

public final class LiveNotificationRepository: NotificationRepository {
    private let client: APIClientProtocol

    public init(client: APIClientProtocol) {
        self.client = client
    }

    public func register(_ registration: DeviceRegistration) async throws {
        _ = try await client.send(NotificationEndpoints.register(registration))
    }

    public func unregister(token: String) async throws {
        _ = try await client.send(NotificationEndpoints.unregister(token: token))
    }

    public func preferences() async throws -> NotificationPreferences {
        try await client.send(NotificationEndpoints.preferences())
    }

    public func updatePreferences(_ preferences: NotificationPreferences) async throws -> NotificationPreferences {
        try await client.send(NotificationEndpoints.update(preferences))
    }
}
