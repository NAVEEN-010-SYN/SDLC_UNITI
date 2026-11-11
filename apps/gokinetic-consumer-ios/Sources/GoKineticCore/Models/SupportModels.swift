import Foundation

// MARK: - Tickets

public enum TicketPriority: String, Codable, Sendable, CaseIterable, Comparable {
    case p1 = "P1"
    case p2 = "P2"
    case p3 = "P3"
    case p4 = "P4"

    private var rank: Int {
        switch self { case .p1: return 1; case .p2: return 2; case .p3: return 3; case .p4: return 4 }
    }

    /// P1 sorts first (most urgent).
    public static func < (lhs: TicketPriority, rhs: TicketPriority) -> Bool { lhs.rank < rhs.rank }
}

/// Ticket status: OPEN -> IN_PROGRESS -> PENDING_CUSTOMER -> RESOLVED -> CLOSED.
public enum TicketStatus: String, Codable, Sendable, CaseIterable {
    case open = "OPEN"
    case inProgress = "IN_PROGRESS"
    case pendingCustomer = "PENDING_CUSTOMER"
    case resolved = "RESOLVED"
    case closed = "CLOSED"

    public var isClosed: Bool { self == .resolved || self == .closed }
    public var awaitsCustomer: Bool { self == .pendingCustomer }

    /// Customers may comment on anything not CLOSED; commenting on a RESOLVED
    /// ticket reopens it server-side.
    public var acceptsComments: Bool { self != .closed }
}

public enum TicketCategory: String, Codable, Sendable, CaseIterable, Identifiable {
    case connectivity = "CONNECTIVITY"
    case billing = "BILLING"
    case equipment = "EQUIPMENT"
    case installation = "INSTALLATION"
    case account = "ACCOUNT"
    case other = "OTHER"

    public var id: String { rawValue }

    /// Default priority the client proposes; agents may re-triage.
    public var suggestedPriority: TicketPriority {
        switch self {
        case .connectivity: return .p2
        case .equipment, .installation: return .p3
        case .billing, .account, .other: return .p4
        }
    }
}

public struct TicketComment: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let author: String
    public let isFromCustomer: Bool
    public let body: String
    public let createdAt: Date

    public init(id: String, author: String, isFromCustomer: Bool, body: String, createdAt: Date) {
        self.id = id
        self.author = author
        self.isFromCustomer = isFromCustomer
        self.body = body
        self.createdAt = createdAt
    }
}

public struct Ticket: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let reference: String
    public let subject: String
    public let category: TicketCategory
    public let priority: TicketPriority
    public let status: TicketStatus
    public let createdAt: Date
    public let updatedAt: Date
    public let comments: [TicketComment]

    public init(id: String, reference: String, subject: String, category: TicketCategory, priority: TicketPriority, status: TicketStatus, createdAt: Date, updatedAt: Date, comments: [TicketComment]) {
        self.id = id
        self.reference = reference
        self.subject = subject
        self.category = category
        self.priority = priority
        self.status = status
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.comments = comments
    }

    public func appending(_ comment: TicketComment, status newStatus: TicketStatus? = nil) -> Ticket {
        Ticket(id: id, reference: reference, subject: subject, category: category, priority: priority,
               status: newStatus ?? status, createdAt: createdAt, updatedAt: comment.createdAt,
               comments: comments + [comment])
    }
}

public struct NewTicketRequest: Codable, Sendable, Equatable {
    public let subject: String
    public let description: String
    public let category: TicketCategory
    public let priority: TicketPriority
    public let serviceId: String?

    public init(subject: String, description: String, category: TicketCategory, priority: TicketPriority, serviceId: String?) {
        self.subject = subject
        self.description = description
        self.category = category
        self.priority = priority
        self.serviceId = serviceId
    }
}

public struct ChatSession: Codable, Hashable, Sendable {
    public let sessionId: String
    public let websocketURL: URL
    public let estimatedWaitSeconds: Int?
    public let agentsAvailable: Bool

    public init(sessionId: String, websocketURL: URL, estimatedWaitSeconds: Int?, agentsAvailable: Bool) {
        self.sessionId = sessionId
        self.websocketURL = websocketURL
        self.estimatedWaitSeconds = estimatedWaitSeconds
        self.agentsAvailable = agentsAvailable
    }
}

// MARK: - Appointments

public enum AppointmentType: String, Codable, Sendable, CaseIterable, Identifiable {
    case installation = "INSTALLATION"
    case repair = "REPAIR"
    case equipmentSwap = "EQUIPMENT_SWAP"
    case survey = "SURVEY"

    public var id: String { rawValue }
}

public enum AppointmentStatus: String, Codable, Sendable {
    case scheduled = "SCHEDULED"
    case enRoute = "EN_ROUTE"
    case inProgress = "IN_PROGRESS"
    case completed = "COMPLETED"
    case cancelled = "CANCELLED"
}

public struct TimeSlot: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let start: Date
    public let end: Date
    public let available: Bool

    public init(id: String, start: Date, end: Date, available: Bool) {
        self.id = id
        self.start = start
        self.end = end
        self.available = available
    }

    public var duration: TimeInterval { end.timeIntervalSince(start) }
}

public struct Appointment: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let type: AppointmentType
    public let status: AppointmentStatus
    public let slot: TimeSlot
    public let technicianName: String?
    public let notes: String?
    public let ticketId: String?

    public init(id: String, type: AppointmentType, status: AppointmentStatus, slot: TimeSlot, technicianName: String?, notes: String?, ticketId: String?) {
        self.id = id
        self.type = type
        self.status = status
        self.slot = slot
        self.technicianName = technicianName
        self.notes = notes
        self.ticketId = ticketId
    }

    public var isUpcoming: Bool {
        status == .scheduled || status == .enRoute
    }

    /// Changes are allowed up to 24 hours before the slot starts.
    public func canModify(at date: Date, cutoff: TimeInterval = 24 * 3600) -> Bool {
        status == .scheduled && slot.start.timeIntervalSince(date) >= cutoff
    }
}

public struct BookAppointmentRequest: Codable, Sendable, Equatable {
    public let type: AppointmentType
    public let slotId: String
    public let notes: String?
    public let ticketId: String?

    public init(type: AppointmentType, slotId: String, notes: String?, ticketId: String?) {
        self.type = type
        self.slotId = slotId
        self.notes = notes
        self.ticketId = ticketId
    }
}

// MARK: - Notifications

public struct NotificationPreferences: Codable, Hashable, Sendable {
    public var billing: Bool
    public var outages: Bool
    public var appointments: Bool
    public var ticketUpdates: Bool
    public var marketing: Bool

    public init(billing: Bool = true, outages: Bool = true, appointments: Bool = true, ticketUpdates: Bool = true, marketing: Bool = false) {
        self.billing = billing
        self.outages = outages
        self.appointments = appointments
        self.ticketUpdates = ticketUpdates
        self.marketing = marketing
    }
}

public struct DeviceRegistration: Codable, Sendable, Equatable {
    public let token: String
    public let platform: String
    public let appVersion: String
    public let locale: String

    public init(token: String, platform: String = "IOS", appVersion: String, locale: String) {
        self.token = token
        self.platform = platform
        self.appVersion = appVersion
        self.locale = locale
    }
}
