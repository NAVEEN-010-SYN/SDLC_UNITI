# Go Kinetic Consumer mobile app (B2C): apps/gokinetic-consumer-ios/Sources/GoKineticCore (part 2 of 7)

- **Application:** Go Kinetic Consumer mobile app (B2C)
- **Tech stack:** Swift / SwiftUI
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 14

## Files

- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/PlanModels.swift` (185 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/SupportModels.swift` (240 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Networking/APIClient.swift` (145 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Networking/APIError.swift` (182 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Networking/Endpoint.swift` (147 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Networking/RequestBuilder.swift` (100 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Networking/RetryPolicy.swift` (53 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Repositories/AccountRepository.swift` (104 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Repositories/BillingRepository.swift` (139 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Repositories/HomeNetworkRepositories.swift` (157 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Repositories/PlanRepository.swift` (75 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Repositories/SupportRepositories.swift` (218 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/AppointmentPolicy.swift` (77 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/ConnectionDiagnostics.swift` (168 lines)

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/PlanModels.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/PlanModels.swift`.

```swift
import Foundation

/// A fibre broadband tier. Speeds are in Mbps (symmetric fibre unless noted).
public struct Plan: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let downloadMbps: Int
    public let uploadMbps: Int
    public let monthlyPrice: Money
    public let contractMonths: Int
    public let features: [String]
    public let dataCapGB: Int?

    public init(id: String, name: String, downloadMbps: Int, uploadMbps: Int, monthlyPrice: Money, contractMonths: Int, features: [String], dataCapGB: Int? = nil) {
        self.id = id
        self.name = name
        self.downloadMbps = downloadMbps
        self.uploadMbps = uploadMbps
        self.monthlyPrice = monthlyPrice
        self.contractMonths = contractMonths
        self.features = features
        self.dataCapGB = dataCapGB
    }

    public var isUnlimited: Bool { dataCapGB == nil }

    /// "1 Gbps" for 1000, "500 Mbps" for 500, "2.5 Gbps" for 2500.
    public var speedLabel: String {
        Plan.speedLabel(mbps: downloadMbps)
    }

    public static func speedLabel(mbps: Int) -> String {
        guard mbps >= 1000 else { return "\(mbps) Mbps" }
        if mbps % 1000 == 0 { return "\(mbps / 1000) Gbps" }
        let tenths = (mbps + 50) / 100
        return "\(tenths / 10).\(tenths % 10) Gbps"
    }

    public func isUpgrade(from other: Plan) -> Bool {
        downloadMbps > other.downloadMbps
            || (downloadMbps == other.downloadMbps && uploadMbps > other.uploadMbps)
    }
}

public struct CurrentPlan: Codable, Hashable, Sendable {
    public let serviceId: String
    public let plan: Plan
    public let contractEndDate: Date?
    public let pendingChange: PendingPlanChange?

    public init(serviceId: String, plan: Plan, contractEndDate: Date?, pendingChange: PendingPlanChange?) {
        self.serviceId = serviceId
        self.plan = plan
        self.contractEndDate = contractEndDate
        self.pendingChange = pendingChange
    }

    public func monthsRemaining(asOf date: Date, calendar: Calendar = .gregorianUTC) -> Int {
        guard let end = contractEndDate, end > date else { return 0 }
        let components = calendar.dateComponents([.month, .day], from: date, to: end)
        let months = components.month ?? 0
        return (components.day ?? 0) > 0 ? months + 1 : months
    }
}

public struct PendingPlanChange: Codable, Hashable, Sendable {
    public let orderId: String
    public let targetPlanName: String
    public let status: OrderStatus
    public let effectiveDate: Date?

    public init(orderId: String, targetPlanName: String, status: OrderStatus, effectiveDate: Date?) {
        self.orderId = orderId
        self.targetPlanName = targetPlanName
        self.status = status
        self.effectiveDate = effectiveDate
    }
}

/// Order lifecycle: DRAFT → SUBMITTED → VALIDATED → PROVISIONING → ACTIVE
/// (or CANCELLED / FAILED).
public enum OrderStatus: String, Codable, Sendable, CaseIterable {
    case draft = "DRAFT"
    case submitted = "SUBMITTED"
    case validated = "VALIDATED"
    case provisioning = "PROVISIONING"
    case active = "ACTIVE"
    case cancelled = "CANCELLED"
    case failed = "FAILED"

    public var isTerminal: Bool {
        switch self {
        case .active, .cancelled, .failed: return true
        default: return false
        }
    }

    /// Ordinal along the happy path, used to draw progress trackers.
    public var progressIndex: Int? {
        switch self {
        case .draft: return 0
        case .submitted: return 1
        case .validated: return 2
        case .provisioning: return 3
        case .active: return 4
        case .cancelled, .failed: return nil
        }
    }

    public static let happyPath: [OrderStatus] = [.draft, .submitted, .validated, .provisioning, .active]

    public func canTransition(to next: OrderStatus) -> Bool {
        if isTerminal { return false }
        if next == .cancelled || next == .failed { return true }
        guard let from = progressIndex, let to = next.progressIndex else { return false }
        return to == from + 1
    }
}

public enum UpgradeTiming: String, Codable, Sendable, CaseIterable {
    case immediate = "IMMEDIATE"
    case nextBillingCycle = "NEXT_BILLING_CYCLE"
}

public struct UpgradeQuoteRequest: Codable, Sendable, Equatable {
    public let serviceId: String
    public let targetPlanId: String
    public let timing: UpgradeTiming

    public init(serviceId: String, targetPlanId: String, timing: UpgradeTiming) {
        self.serviceId = serviceId
        self.targetPlanId = targetPlanId
        self.timing = timing
    }
}

public struct UpgradeQuote: Codable, Hashable, Sendable {
    public let quoteId: String
    public let targetPlan: Plan
    public let proratedCharge: Money
    public let newMonthlyPrice: Money
    public let oneTimeFees: [LineItem]
    public let effectiveDate: Date
    public let expiresAt: Date

    public init(quoteId: String, targetPlan: Plan, proratedCharge: Money, newMonthlyPrice: Money, oneTimeFees: [LineItem], effectiveDate: Date, expiresAt: Date) {
        self.quoteId = quoteId
        self.targetPlan = targetPlan
        self.proratedCharge = proratedCharge
        self.newMonthlyPrice = newMonthlyPrice
        self.oneTimeFees = oneTimeFees
        self.effectiveDate = effectiveDate
        self.expiresAt = expiresAt
    }

    public func isExpired(at date: Date) -> Bool { date >= expiresAt }

    /// Amount due on the next bill as a result of this change.
    public func dueToday() throws -> Money {
        try Money.sum([proratedCharge] + oneTimeFees.map(\.amount), currency: proratedCharge.currency)
    }
}

public struct Order: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let status: OrderStatus
    public let createdAt: Date
    public let summary: String

    public init(id: String, status: OrderStatus, createdAt: Date, summary: String) {
        self.id = id
        self.status = status
        self.createdAt = createdAt
        self.summary = summary
    }
}

public extension Calendar {
    static let gregorianUTC: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/SupportModels.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/SupportModels.swift`.

```swift
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

/// Ticket status: OPEN → IN_PROGRESS → PENDING_CUSTOMER → RESOLVED → CLOSED.
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
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Networking/APIClient.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Networking/APIClient.swift`.

```swift
import Foundation

/// The raw I/O seam. Production uses `URLSession`; tests inject a stub.
public protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

public struct URLSessionTransport: HTTPTransport {
    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.transport(code: URLError.badServerResponse.rawValue)
        }
        return (data, http)
    }
}

/// Supplies bearer tokens and is told when the server rejected one.
public protocol AccessTokenProviding: Sendable {
    /// Returns a non-expired access token, refreshing if needed.
    func validAccessToken() async throws -> String
    /// Forces a refresh after the server returned 401 for `rejectedToken`.
    func refreshAfterRejection(of rejectedToken: String) async throws -> String
}

public protocol APIClientProtocol: Sendable {
    func send<Response>(_ endpoint: Endpoint<Response>) async throws -> Response
}

/// async/await API client: builds requests, attaches auth, retries
/// transient failures, refreshes once on 401, and maps errors.
public final class APIClient: APIClientProtocol, @unchecked Sendable {
    private let builder: RequestBuilder
    private let transport: HTTPTransport
    private let tokenProvider: AccessTokenProviding?
    private let retryPolicy: RetryPolicy
    private let sleeper: Sleeper
    private let correlationIds: CorrelationIDGenerating
    private let logger: AppLogger

    public init(
        builder: RequestBuilder,
        transport: HTTPTransport = URLSessionTransport(),
        tokenProvider: AccessTokenProviding?,
        retryPolicy: RetryPolicy = RetryPolicy(),
        sleeper: Sleeper = TaskSleeper(),
        correlationIds: CorrelationIDGenerating = UUIDCorrelationIDGenerator(),
        logger: AppLogger = .shared
    ) {
        self.builder = builder
        self.transport = transport
        self.tokenProvider = tokenProvider
        self.retryPolicy = retryPolicy
        self.sleeper = sleeper
        self.correlationIds = correlationIds
        self.logger = logger
    }

    public func send<Response>(_ endpoint: Endpoint<Response>) async throws -> Response {
        // One correlation ID per logical call, shared across retries so the
        // server can see they are the same operation.
        let correlationId = correlationIds.next()
        var attempt = 0
        var didRefresh = false

        while true {
            attempt += 1
            try Task.checkCancellation()
            let token = endpoint.requiresAuth ? try await currentToken() : nil

            do {
                return try await perform(endpoint, token: token, correlationId: correlationId, attempt: attempt)
            } catch APIError.unauthorized where endpoint.requiresAuth && !didRefresh {
                guard let provider = tokenProvider, let rejected = token else { throw APIError.unauthorized }
                didRefresh = true
                logger.info("auth.refresh_after_401", ["path": endpoint.path, "correlationId": correlationId])
                _ = try await provider.refreshAfterRejection(of: rejected)
                attempt -= 1 // a token refresh does not consume a retry attempt
                continue
            } catch let error as APIError {
                guard let delay = retryPolicy.delay(afterAttempt: attempt, error: error, endpointRetryable: endpoint.isRetryable) else {
                    throw error
                }
                logger.warning("http.retry", [
                    "path": endpoint.path, "attempt": String(attempt),
                    "delay": String(format: "%.2f", delay), "correlationId": correlationId
                ])
                try await sleeper.sleep(seconds: delay)
            }
        }
    }

    private func currentToken() async throws -> String {
        guard let provider = tokenProvider else { throw APIError.unauthorized }
        return try await provider.validAccessToken()
    }

    private func perform<Response>(_ endpoint: Endpoint<Response>, token: String?, correlationId: String, attempt: Int) async throws -> Response {
        let request = try builder.build(endpoint, accessToken: token, correlationId: correlationId)
        let started = Date()
        let data: Data
        let response: HTTPURLResponse
        do {
            (data, response) = try await transport.send(request)
        } catch let urlError as URLError {
            throw APIError.from(urlError: urlError)
        } catch is CancellationError {
            throw APIError.cancelled
        }

        let elapsedMs = Int(Date().timeIntervalSince(started) * 1000)
        logger.debug("http.response", [
            "method": endpoint.method.rawValue, "path": endpoint.path,
            "status": String(response.statusCode), "ms": String(elapsedMs),
            "attempt": String(attempt), "correlationId": correlationId
        ])

        guard (200..<300).contains(response.statusCode) else {
            throw APIError.from(status: response.statusCode, data: data, headers: response.allHeaderFields)
        }
        return try decode(Response.self, from: data, status: response.statusCode)
    }

    private func decode<Response: Decodable>(_ type: Response.Type, from data: Data, status: Int) throws -> Response {
        if Response.self == EmptyResponse.self, let empty = EmptyResponse() as? Response {
            return empty
        }
        if data.isEmpty, status == 204 {
            throw APIError.decoding("Expected \(Response.self) but response had no body")
        }
        do {
            return try JSONCoding.decoder.decode(Response.self, from: data)
        } catch {
            logger.error("http.decode_failed", ["type": String(describing: Response.self), "error": String(describing: error)])
            throw APIError.decoding(String(describing: error))
        }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Networking/APIError.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Networking/APIError.swift`.

```swift
import Foundation

/// RFC 7807 `application/problem+json` body returned by every platform API.
public struct ProblemDetails: Codable, Hashable, Sendable {
    public let type: String?
    public let title: String?
    public let status: Int?
    public let detail: String?
    public let instance: String?
    /// Field-level validation messages, keyed by JSON field name.
    public let errors: [String: [String]]?
    public let correlationId: String?

    public init(type: String? = nil, title: String? = nil, status: Int? = nil, detail: String? = nil, instance: String? = nil, errors: [String: [String]]? = nil, correlationId: String? = nil) {
        self.type = type
        self.title = title
        self.status = status
        self.detail = detail
        self.instance = instance
        self.errors = errors
        self.correlationId = correlationId
    }

    /// The last path component of `type`, e.g. "insufficient-funds" for
    /// `https://errors.uniti.example/payments/insufficient-funds`.
    public var code: String? {
        guard let type, !type.isEmpty, type != "about:blank" else { return nil }
        return type.split(separator: "/").last.map(String.init)
    }

    public func firstError(for field: String) -> String? {
        errors?[field]?.first
    }
}

/// Every failure the networking layer can surface, already classified so
/// view models can decide how to present it without inspecting HTTP.
public enum APIError: Error, Equatable, Sendable {
    case offline
    case timedOut
    case cancelled
    case transport(code: Int)
    case unauthorized
    case forbidden(ProblemDetails?)
    case notFound(ProblemDetails?)
    case conflict(ProblemDetails?)
    case validation(ProblemDetails)
    case rateLimited(retryAfter: TimeInterval?)
    case server(status: Int, problem: ProblemDetails?)
    case unexpectedStatus(Int)
    case decoding(String)
    case encoding(String)
    case invalidURL(String)

    public var isRetryable: Bool {
        switch self {
        case .offline, .timedOut, .transport, .rateLimited: return true
        case .server(let status, _): return status == 502 || status == 503 || status == 504
        default: return false
        }
    }

    public var problem: ProblemDetails? {
        switch self {
        case .forbidden(let p), .notFound(let p), .conflict(let p): return p
        case .validation(let p): return p
        case .server(_, let p): return p
        default: return nil
        }
    }

    /// Maps an HTTP status and optional body into a classified error.
    public static func from(status: Int, data: Data, headers: [AnyHashable: Any]) -> APIError {
        let problem = try? JSONCoding.decoder.decode(ProblemDetails.self, from: data)
        switch status {
        case 400, 422:
            return .validation(problem ?? ProblemDetails(title: "Invalid request", status: status))
        case 401: return .unauthorized
        case 403: return .forbidden(problem)
        case 404: return .notFound(problem)
        case 409: return .conflict(problem)
        case 429: return .rateLimited(retryAfter: parseRetryAfter(headers))
        case 500...599: return .server(status: status, problem: problem)
        default: return .unexpectedStatus(status)
        }
    }

    /// `Retry-After` may be delta-seconds or an HTTP-date.
    static func parseRetryAfter(_ headers: [AnyHashable: Any], now: Date = Date()) -> TimeInterval? {
        let value = headers.first { ($0.key as? String)?.lowercased() == "retry-after" }?.value as? String
        guard let raw = value?.trimmingCharacters(in: .whitespaces), !raw.isEmpty else { return nil }
        if let seconds = TimeInterval(raw) { return max(0, seconds) }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "GMT")
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        guard let date = formatter.date(from: raw) else { return nil }
        return max(0, date.timeIntervalSince(now))
    }

    static func from(urlError: URLError) -> APIError {
        switch urlError.code {
        case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .internationalRoamingOff:
            return .offline
        case .timedOut: return .timedOut
        case .cancelled: return .cancelled
        default: return .transport(code: urlError.code.rawValue)
        }
    }
}

/// A presentation-ready error. View models convert `Error` into this so
/// screens never show raw server text that wasn't meant for customers.
public struct UserFacingError: Error, Equatable, Sendable, Identifiable {
    public enum Kind: Equatable, Sendable {
        case offline
        case sessionExpired
        case notAllowed
        case notFound
        case validation
        case busy
        case server
        case unknown
    }

    public let id = UUID()
    public let kind: Kind
    /// Localization key for the headline.
    public let titleKey: String
    /// Optional server-provided detail that is safe to show (validation).
    public let detail: String?
    public let correlationId: String?
    public let isRetryable: Bool

    public init(kind: Kind, titleKey: String, detail: String? = nil, correlationId: String? = nil, isRetryable: Bool) {
        self.kind = kind
        self.titleKey = titleKey
        self.detail = detail
        self.correlationId = correlationId
        self.isRetryable = isRetryable
    }

    public static func == (lhs: UserFacingError, rhs: UserFacingError) -> Bool {
        lhs.kind == rhs.kind && lhs.titleKey == rhs.titleKey && lhs.detail == rhs.detail
    }

    public init(_ error: Error) {
        if let mapped = error as? UserFacingError {
            self = mapped
            return
        }
        guard let apiError = error as? APIError else {
            self.init(kind: .unknown, titleKey: "error.generic", isRetryable: true)
            return
        }
        switch apiError {
        case .offline:
            self.init(kind: .offline, titleKey: "error.offline", isRetryable: true)
        case .timedOut, .transport:
            self.init(kind: .offline, titleKey: "error.network", isRetryable: true)
        case .unauthorized:
            self.init(kind: .sessionExpired, titleKey: "error.sessionExpired", isRetryable: false)
        case .forbidden(let p):
            self.init(kind: .notAllowed, titleKey: "error.forbidden", correlationId: p?.correlationId, isRetryable: false)
        case .notFound(let p):
            self.init(kind: .notFound, titleKey: "error.notFound", correlationId: p?.correlationId, isRetryable: false)
        case .validation(let p):
            let fieldMessages = p.errors?.values.flatMap { $0 } ?? []
            let detail = fieldMessages.first ?? p.detail
            self.init(kind: .validation, titleKey: "error.validation", detail: detail, correlationId: p.correlationId, isRetryable: false)
        case .conflict(let p):
            self.init(kind: .validation, titleKey: "error.conflict", detail: p?.detail, correlationId: p?.correlationId, isRetryable: false)
        case .rateLimited:
            self.init(kind: .busy, titleKey: "error.rateLimited", isRetryable: true)
        case .server(_, let p):
            self.init(kind: .server, titleKey: "error.server", correlationId: p?.correlationId, isRetryable: true)
        case .cancelled, .unexpectedStatus, .decoding, .encoding, .invalidURL:
            self.init(kind: .unknown, titleKey: "error.generic", isRetryable: true)
        }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Networking/Endpoint.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Networking/Endpoint.swift`.

```swift
import Foundation

public enum HTTPMethod: String, Sendable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"

    /// Idempotent methods may be retried automatically on transient failure.
    /// POST is only retried when the endpoint carries an idempotency key.
    public var isIdempotent: Bool {
        switch self {
        case .get, .put, .delete: return true
        case .post, .patch: return false
        }
    }
}

/// Marker for endpoints that return no body (204 No Content).
public struct EmptyResponse: Codable, Sendable, Equatable {
    public init() {}
}

/// Describes a single API call and its decoded response type. Paths are
/// relative to `/api/v1`; the `RequestBuilder` prefixes the version.
public struct Endpoint<Response: Decodable & Sendable>: Sendable {
    public let path: String
    public let method: HTTPMethod
    public let query: [URLQueryItem]
    public let body: Data?
    public let headers: [String: String]
    public let requiresAuth: Bool
    public let idempotencyKey: String?
    public let timeout: TimeInterval?

    public init(
        path: String,
        method: HTTPMethod = .get,
        query: [URLQueryItem] = [],
        body: Data? = nil,
        headers: [String: String] = [:],
        requiresAuth: Bool = true,
        idempotencyKey: String? = nil,
        timeout: TimeInterval? = nil
    ) {
        self.path = path
        self.method = method
        self.query = query
        self.body = body
        self.headers = headers
        self.requiresAuth = requiresAuth
        self.idempotencyKey = idempotencyKey
        self.timeout = timeout
    }

    /// Convenience for endpoints with an `Encodable` JSON body.
    public init<Body: Encodable>(
        path: String,
        method: HTTPMethod,
        jsonBody: Body,
        query: [URLQueryItem] = [],
        requiresAuth: Bool = true,
        idempotencyKey: String? = nil
    ) throws {
        let data: Data
        do {
            data = try JSONCoding.encoder.encode(jsonBody)
        } catch {
            throw APIError.encoding(String(describing: error))
        }
        self.init(path: path, method: method, query: query, body: data,
                  headers: ["Content-Type": "application/json"],
                  requiresAuth: requiresAuth, idempotencyKey: idempotencyKey)
    }

    public var isRetryable: Bool {
        method.isIdempotent || idempotencyKey != nil
    }
}

public extension Array where Element == URLQueryItem {
    /// Standard pagination parameters `?page=&pageSize=`.
    static func pagination(page: Int, pageSize: Int) -> [URLQueryItem] {
        [URLQueryItem(name: "page", value: String(max(page, 1))),
         URLQueryItem(name: "pageSize", value: String(min(max(pageSize, 1), 100)))]
    }
}

/// Shared JSON configuration: ISO-8601 UTC dates on the wire, with or
/// without fractional seconds.
public enum JSONCoding {
    public static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(ISO8601.string(from: date))
        }
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    public static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = ISO8601.date(from: raw) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid ISO-8601 date: \(raw)")
            }
            return date
        }
        return decoder
    }()
}

public enum ISO8601 {
    private static let withFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter
    }()

    private static let plain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter
    }()

    private static let dateOnly: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter
    }()

    public static func string(from date: Date) -> String {
        withFraction.string(from: date)
    }

    public static func date(from string: String) -> Date? {
        withFraction.date(from: string) ?? plain.date(from: string) ?? dateOnly.date(from: string)
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Networking/RequestBuilder.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Networking/RequestBuilder.swift`.

```swift
import Foundation

/// Generates the correlation ID propagated on every request via
/// `X-Correlation-Id` so client logs can be joined with server logs.
public protocol CorrelationIDGenerating: Sendable {
    func next() -> String
}

public struct UUIDCorrelationIDGenerator: CorrelationIDGenerating {
    public init() {}
    public func next() -> String { UUID().uuidString.lowercased() }
}

public struct ClientIdentity: Sendable, Equatable {
    public let appVersion: String
    public let buildNumber: String
    public let osVersion: String
    public let deviceModel: String

    public init(appVersion: String, buildNumber: String, osVersion: String, deviceModel: String) {
        self.appVersion = appVersion
        self.buildNumber = buildNumber
        self.osVersion = osVersion
        self.deviceModel = deviceModel
    }

    public var userAgent: String {
        "GoKinetic-iOS/\(appVersion) (\(buildNumber); \(deviceModel); iOS \(osVersion))"
    }
}

/// Turns an `Endpoint` into a `URLRequest` against the configured base URL.
public struct RequestBuilder: Sendable {
    public static let apiVersionPrefix = "/api/v1"
    public static let correlationHeader = "X-Correlation-Id"
    public static let idempotencyHeader = "Idempotency-Key"

    public let baseURL: URL
    public let identity: ClientIdentity
    public let defaultTimeout: TimeInterval
    public let acceptLanguage: String

    public init(baseURL: URL, identity: ClientIdentity, defaultTimeout: TimeInterval = 30, acceptLanguage: String = Locale.preferredLanguages.prefix(3).joined(separator: ", ")) {
        self.baseURL = baseURL
        self.identity = identity
        self.defaultTimeout = defaultTimeout
        self.acceptLanguage = acceptLanguage
    }

    public func makeURL(path: String, query: [URLQueryItem]) throws -> URL {
        let normalizedPath = path.hasPrefix("/") ? path : "/" + path
        guard !normalizedPath.contains(".."), !normalizedPath.contains("//") else {
            throw APIError.invalidURL(path)
        }
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw APIError.invalidURL(baseURL.absoluteString)
        }
        let basePath = components.path.hasSuffix("/") ? String(components.path.dropLast()) : components.path
        components.path = basePath + Self.apiVersionPrefix + normalizedPath
        let filtered = query.filter { $0.value != nil }
        components.queryItems = filtered.isEmpty ? nil : filtered.sorted { $0.name < $1.name }
        // URLComponents leaves '+' unescaped in queries; servers decode it as a space.
        components.percentEncodedQuery = components.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        guard let url = components.url else { throw APIError.invalidURL(path) }
        return url
    }

    public func build<Response>(
        _ endpoint: Endpoint<Response>,
        accessToken: String?,
        correlationId: String
    ) throws -> URLRequest {
        let url = try makeURL(path: endpoint.path, query: endpoint.query)
        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.timeoutInterval = endpoint.timeout ?? defaultTimeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.httpBody = endpoint.body

        request.setValue("application/json, application/problem+json", forHTTPHeaderField: "Accept")
        request.setValue(acceptLanguage, forHTTPHeaderField: "Accept-Language")
        request.setValue(identity.userAgent, forHTTPHeaderField: "User-Agent")
        request.setValue(correlationId, forHTTPHeaderField: Self.correlationHeader)
        if endpoint.body != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let key = endpoint.idempotencyKey {
            request.setValue(key, forHTTPHeaderField: Self.idempotencyHeader)
        }
        for (name, value) in endpoint.headers {
            request.setValue(value, forHTTPHeaderField: name)
        }
        if endpoint.requiresAuth {
            guard let token = accessToken, !token.isEmpty else { throw APIError.unauthorized }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Networking/RetryPolicy.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Networking/RetryPolicy.swift`.

```swift
import Foundation

/// Abstraction over `Task.sleep` so retry timing is deterministic in tests.
public protocol Sleeper: Sendable {
    func sleep(seconds: TimeInterval) async throws
}

public struct TaskSleeper: Sleeper {
    public init() {}
    public func sleep(seconds: TimeInterval) async throws {
        guard seconds > 0 else { return }
        try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }
}

/// Exponential backoff with full jitter, capped, honouring `Retry-After`.
public struct RetryPolicy: Sendable {
    public let maxAttempts: Int
    public let baseDelay: TimeInterval
    public let maxDelay: TimeInterval
    public let maxRetryAfter: TimeInterval
    private let jitter: @Sendable (ClosedRange<Double>) -> Double

    public init(
        maxAttempts: Int = 3,
        baseDelay: TimeInterval = 0.5,
        maxDelay: TimeInterval = 8,
        maxRetryAfter: TimeInterval = 30,
        jitter: @escaping @Sendable (ClosedRange<Double>) -> Double = { Double.random(in: $0) }
    ) {
        self.maxAttempts = max(1, maxAttempts)
        self.baseDelay = baseDelay
        self.maxDelay = maxDelay
        self.maxRetryAfter = maxRetryAfter
        self.jitter = jitter
    }

    public static let none = RetryPolicy(maxAttempts: 1)

    /// Returns the delay before the next attempt, or nil to stop retrying.
    /// `attempt` is 1-based: the attempt that just failed.
    public func delay(afterAttempt attempt: Int, error: APIError, endpointRetryable: Bool) -> TimeInterval? {
        guard attempt < maxAttempts, endpointRetryable, error.isRetryable else { return nil }
        if case .rateLimited(let retryAfter?) = error {
            // A server asking us to wait longer than we are willing to is a stop signal.
            return retryAfter <= maxRetryAfter ? retryAfter : nil
        }
        let exponential = baseDelay * pow(2, Double(attempt - 1))
        let capped = min(exponential, maxDelay)
        return jitter(0...capped)
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Repositories/AccountRepository.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Repositories/AccountRepository.swift`.

```swift
import Foundation

public protocol AccountRepository: Sendable {
    func profile(forceRefresh: Bool) async throws -> UserProfile
    func summary(forceRefresh: Bool) async throws -> AccountSummary
    func updateContact(email: String?, phone: String?) async throws -> UserProfile
    func clearCache() async
}

enum AccountEndpoints {
    static func profile() -> Endpoint<UserProfile> {
        Endpoint(path: "/me")
    }

    static func summary() -> Endpoint<AccountSummary> {
        Endpoint(path: "/me/account")
    }

    struct ContactUpdate: Encodable {
        let email: String?
        let phone: String?
    }

    static func updateContact(_ body: ContactUpdate) throws -> Endpoint<UserProfile> {
        try Endpoint(path: "/me", method: .patch, jsonBody: body)
    }
}

public final class LiveAccountRepository: AccountRepository {
    private let client: APIClientProtocol
    private let profileCache: TTLCache<String, UserProfile>
    private let summaryCache: TTLCache<String, AccountSummary>

    public init(client: APIClientProtocol, clock: Clock = SystemClock()) {
        self.client = client
        self.profileCache = TTLCache(ttl: 15 * 60, clock: clock)
        self.summaryCache = TTLCache(ttl: 60, clock: clock)
    }

    public func profile(forceRefresh: Bool) async throws -> UserProfile {
        let client = self.client
        return try await profileCache.value(for: "me", forceRefresh: forceRefresh) {
            try await client.send(AccountEndpoints.profile())
        }
    }

    public func summary(forceRefresh: Bool) async throws -> AccountSummary {
        let client = self.client
        do {
            return try await summaryCache.value(for: "account", forceRefresh: forceRefresh) {
                try await client.send(AccountEndpoints.summary())
            }
        } catch APIError.offline {
            // Prefer a stale dashboard over an error screen when offline.
            if let stale = await summaryCache.staleValue(for: "account") { return stale }
            throw APIError.offline
        }
    }

    public func updateContact(email: String?, phone: String?) async throws -> UserProfile {
        let normalizedEmail = email?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let normalizedEmail, !ContactValidator.isValidEmail(normalizedEmail) {
            throw APIError.validation(ProblemDetails(title: "Invalid email", errors: ["email": ["Enter a valid email address."]]))
        }
        let normalizedPhone = phone.map(ContactValidator.normalizePhone)
        if let normalizedPhone, normalizedPhone == nil {
            throw APIError.validation(ProblemDetails(title: "Invalid phone", errors: ["phone": ["Enter a valid phone number."]]))
        }
        let updated = try await client.send(AccountEndpoints.updateContact(.init(email: normalizedEmail, phone: normalizedPhone ?? nil)))
        await profileCache.store(updated, for: "me")
        return updated
    }

    public func clearCache() async {
        await profileCache.invalidateAll()
        await summaryCache.invalidateAll()
    }
}

public enum ContactValidator {
    public static func isValidEmail(_ email: String) -> Bool {
        let parts = email.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty, parts[0].count <= 64 else { return false }
        let domain = parts[1]
        let labels = domain.split(separator: ".", omittingEmptySubsequences: false)
        guard labels.count >= 2, labels.allSatisfy({ !$0.isEmpty && !$0.hasPrefix("-") && !$0.hasSuffix("-") }) else { return false }
        guard let tld = labels.last, tld.count >= 2, tld.allSatisfy(\.isLetter) else { return false }
        return !email.contains(where: \.isWhitespace)
    }

    /// Normalizes to E.164 (`+15551234567`). US/CA 10-digit numbers get +1.
    /// Returns nil for anything that can't be a valid phone number.
    public static func normalizePhone(_ raw: String) -> String? {
        let hasPlus = raw.trimmingCharacters(in: .whitespaces).hasPrefix("+")
        let digits = raw.filter(\.isNumber)
        switch (hasPlus, digits.count) {
        case (false, 10): return "+1" + digits
        case (false, 11) where digits.hasPrefix("1"): return "+" + digits
        case (true, 8...15): return "+" + digits
        default: return nil
        }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Repositories/BillingRepository.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Repositories/BillingRepository.swift`.

```swift
import Foundation

public protocol BillingRepository: Sendable {
    func invoices(page: Int, pageSize: Int) async throws -> Page<Invoice>
    func invoice(id: String) async throws -> Invoice
    func invoicePDF(id: String) async throws -> URL
    func paymentMethods() async throws -> [PaymentMethod]
    func payments(page: Int, pageSize: Int) async throws -> Page<Payment>
    func pay(_ request: PaymentRequest) async throws -> Payment
    func autopay() async throws -> AutopaySettings
    func setAutopay(_ settings: AutopaySettings) async throws -> AutopaySettings
    func invalidate() async
}

enum BillingEndpoints {
    static func invoices(page: Int, pageSize: Int) -> Endpoint<Page<Invoice>> {
        Endpoint(path: "/billing/invoices", query: .pagination(page: page, pageSize: pageSize))
    }

    static func invoice(id: String) -> Endpoint<Invoice> {
        Endpoint(path: "/billing/invoices/\(id)")
    }

    struct DocumentLink: Codable, Sendable {
        let url: URL
        let expiresAt: Date
    }

    static func invoicePDF(id: String) -> Endpoint<DocumentLink> {
        Endpoint(path: "/billing/invoices/\(id)/document")
    }

    static func paymentMethods() -> Endpoint<[PaymentMethod]> {
        Endpoint(path: "/billing/payment-methods")
    }

    static func payments(page: Int, pageSize: Int) -> Endpoint<Page<Payment>> {
        Endpoint(path: "/billing/payments", query: .pagination(page: page, pageSize: pageSize))
    }

    static func pay(_ request: PaymentRequest) throws -> Endpoint<Payment> {
        try Endpoint(path: "/billing/payments", method: .post, jsonBody: request, idempotencyKey: request.idempotencyKey)
    }

    static func autopay() -> Endpoint<AutopaySettings> {
        Endpoint(path: "/billing/autopay")
    }

    static func setAutopay(_ settings: AutopaySettings) throws -> Endpoint<AutopaySettings> {
        try Endpoint(path: "/billing/autopay", method: .put, jsonBody: settings)
    }
}

public final class LiveBillingRepository: BillingRepository {
    private let client: APIClientProtocol
    private let clock: Clock
    private let invoicePageCache: TTLCache<Int, Page<Invoice>>
    private let invoiceCache: TTLCache<String, Invoice>
    private let methodsCache: TTLCache<String, [PaymentMethod]>

    public init(client: APIClientProtocol, clock: Clock = SystemClock()) {
        self.client = client
        self.clock = clock
        self.invoicePageCache = TTLCache(ttl: 5 * 60, maxEntries: 10, clock: clock)
        self.invoiceCache = TTLCache(ttl: 10 * 60, maxEntries: 50, clock: clock)
        self.methodsCache = TTLCache(ttl: 10 * 60, clock: clock)
    }

    public func invoices(page: Int, pageSize: Int) async throws -> Page<Invoice> {
        let client = self.client
        let result = try await invoicePageCache.value(for: page) {
            try await client.send(BillingEndpoints.invoices(page: page, pageSize: pageSize))
        }
        // Seed the detail cache so tapping a row is instant.
        for invoice in result.items { await invoiceCache.store(invoice, for: invoice.id) }
        return result
    }

    public func invoice(id: String) async throws -> Invoice {
        let client = self.client
        return try await invoiceCache.value(for: id) {
            try await client.send(BillingEndpoints.invoice(id: id))
        }
    }

    /// Returns a short-lived signed URL for the invoice PDF; rejects links
    /// that are already expired or not served over HTTPS.
    public func invoicePDF(id: String) async throws -> URL {
        let link = try await client.send(BillingEndpoints.invoicePDF(id: id))
        guard link.url.scheme == "https", link.expiresAt > clock.now() else {
            throw APIError.decoding("Invoice document link is invalid or expired")
        }
        return link.url
    }

    public func paymentMethods() async throws -> [PaymentMethod] {
        let client = self.client
        let now = clock.now()
        let methods = try await methodsCache.value(for: "methods") {
            try await client.send(BillingEndpoints.paymentMethods())
        }
        // Default first, then non-expired, then the rest.
        return methods.sorted { lhs, rhs in
            if lhs.isDefault != rhs.isDefault { return lhs.isDefault }
            let lhsExpired = lhs.isExpired(at: now), rhsExpired = rhs.isExpired(at: now)
            if lhsExpired != rhsExpired { return !lhsExpired }
            return lhs.id < rhs.id
        }
    }

    public func payments(page: Int, pageSize: Int) async throws -> Page<Payment> {
        try await client.send(BillingEndpoints.payments(page: page, pageSize: pageSize))
    }

    public func pay(_ request: PaymentRequest) async throws -> Payment {
        let payment = try await client.send(BillingEndpoints.pay(request))
        // Balances and invoice statuses changed; drop everything billing-related.
        await invalidate()
        return payment
    }

    public func autopay() async throws -> AutopaySettings {
        try await client.send(BillingEndpoints.autopay())
    }

    public func setAutopay(_ settings: AutopaySettings) async throws -> AutopaySettings {
        if settings.enabled && settings.paymentMethodId == nil {
            throw APIError.validation(ProblemDetails(title: "Payment method required",
                                                     errors: ["paymentMethodId": ["Choose a payment method for autopay."]]))
        }
        return try await client.send(BillingEndpoints.setAutopay(settings))
    }

    public func invalidate() async {
        await invoicePageCache.invalidateAll()
        await invoiceCache.invalidateAll()
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Repositories/HomeNetworkRepositories.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Repositories/HomeNetworkRepositories.swift`.

```swift
import Foundation

// MARK: - Usage

public protocol UsageRepository: Sendable {
    func usage(serviceId: String, period: UsagePeriod, forceRefresh: Bool) async throws -> UsageReport
}

enum UsageEndpoints {
    static func usage(serviceId: String, period: UsagePeriod) -> Endpoint<UsageReport> {
        Endpoint(path: "/services/\(serviceId)/usage", query: [URLQueryItem(name: "period", value: period.rawValue)])
    }
}

public final class LiveUsageRepository: UsageRepository {
    private struct Key: Hashable, Sendable { let serviceId: String; let period: UsagePeriod }

    private let client: APIClientProtocol
    private let cache: TTLCache<Key, UsageReport>

    public init(client: APIClientProtocol, clock: Clock = SystemClock()) {
        self.client = client
        // Usage is aggregated hourly upstream; caching for 10 minutes is safe.
        self.cache = TTLCache(ttl: 10 * 60, clock: clock)
    }

    public func usage(serviceId: String, period: UsagePeriod, forceRefresh: Bool) async throws -> UsageReport {
        let client = self.client
        return try await cache.value(for: Key(serviceId: serviceId, period: period), forceRefresh: forceRefresh) {
            let report = try await client.send(UsageEndpoints.usage(serviceId: serviceId, period: period))
            return UsageReport(serviceId: report.serviceId, period: report.period,
                               samples: report.samples.sorted { $0.timestamp < $1.timestamp },
                               dataCapBytes: report.dataCapBytes, cycleStart: report.cycleStart, cycleEnd: report.cycleEnd)
        }
    }
}

// MARK: - Router

public protocol RouterRepository: Sendable {
    func status(serviceId: String) async throws -> RouterStatus
    func reboot(routerId: String) async throws
    func updateWiFi(routerId: String, _ request: WiFiUpdateRequest) async throws -> WiFiNetwork
    func connectedDevices(routerId: String) async throws -> [ConnectedDevice]
    func setDeviceBlocked(routerId: String, deviceId: String, blocked: Bool) async throws -> ConnectedDevice
    func renameDevice(routerId: String, deviceId: String, name: String) async throws -> ConnectedDevice
}

enum RouterEndpoints {
    static func status(serviceId: String) -> Endpoint<RouterStatus> {
        Endpoint(path: "/services/\(serviceId)/router", timeout: 20)
    }

    static func reboot(routerId: String) -> Endpoint<EmptyResponse> {
        // Not idempotent from the user's perspective: never auto-retried.
        Endpoint(path: "/routers/\(routerId)/reboot", method: .post)
    }

    static func updateWiFi(routerId: String, _ request: WiFiUpdateRequest) throws -> Endpoint<WiFiNetwork> {
        try Endpoint(path: "/routers/\(routerId)/wifi/\(request.networkId)", method: .put, jsonBody: request)
    }

    static func devices(routerId: String) -> Endpoint<[ConnectedDevice]> {
        Endpoint(path: "/routers/\(routerId)/devices")
    }

    struct DevicePatch: Encodable { let blocked: Bool?; let name: String? }

    static func patchDevice(routerId: String, deviceId: String, _ patch: DevicePatch) throws -> Endpoint<ConnectedDevice> {
        try Endpoint(path: "/routers/\(routerId)/devices/\(deviceId)", method: .patch, jsonBody: patch)
    }
}

public final class LiveRouterRepository: RouterRepository {
    private let client: APIClientProtocol

    public init(client: APIClientProtocol) {
        self.client = client
    }

    public func status(serviceId: String) async throws -> RouterStatus {
        try await client.send(RouterEndpoints.status(serviceId: serviceId))
    }

    public func reboot(routerId: String) async throws {
        _ = try await client.send(RouterEndpoints.reboot(routerId: routerId))
    }

    public func updateWiFi(routerId: String, _ request: WiFiUpdateRequest) async throws -> WiFiNetwork {
        let result = WiFiCredentialsValidator.validate(ssid: request.ssid, passphrase: request.passphrase, confirmation: request.passphrase)
        guard result.isValid else {
            var errors: [String: [String]] = [:]
            result.issues.forEach { errors[$0.field, default: []].append($0.messageKey) }
            throw APIError.validation(ProblemDetails(title: "Invalid Wi-Fi settings", errors: errors))
        }
        return try await client.send(RouterEndpoints.updateWiFi(routerId: routerId, request))
    }

    /// Online devices first (most recently active), then offline/blocked.
    public func connectedDevices(routerId: String) async throws -> [ConnectedDevice] {
        let devices = try await client.send(RouterEndpoints.devices(routerId: routerId))
        return devices.sorted { lhs, rhs in
            if lhs.isBlocked != rhs.isBlocked { return !lhs.isBlocked }
            return lhs.lastActive > rhs.lastActive
        }
    }

    public func setDeviceBlocked(routerId: String, deviceId: String, blocked: Bool) async throws -> ConnectedDevice {
        try await client.send(RouterEndpoints.patchDevice(routerId: routerId, deviceId: deviceId, .init(blocked: blocked, name: nil)))
    }

    public func renameDevice(routerId: String, deviceId: String, name: String) async throws -> ConnectedDevice {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...40).contains(trimmed.count) else {
            throw APIError.validation(ProblemDetails(title: "Invalid name", errors: ["name": ["Use 1–40 characters."]]))
        }
        return try await client.send(RouterEndpoints.patchDevice(routerId: routerId, deviceId: deviceId, .init(blocked: nil, name: trimmed)))
    }
}

// MARK: - Outages

public protocol OutageRepository: Sendable {
    func outages(serviceId: String) async throws -> [Outage]
}

enum OutageEndpoints {
    static func outages(serviceId: String) -> Endpoint<[Outage]> {
        Endpoint(path: "/services/\(serviceId)/outages")
    }
}

public final class LiveOutageRepository: OutageRepository {
    private let client: APIClientProtocol
    private let cache: TTLCache<String, [Outage]>

    public init(client: APIClientProtocol, clock: Clock = SystemClock()) {
        self.client = client
        self.cache = TTLCache(ttl: 2 * 60, clock: clock)
    }

    /// Active outages affecting the user first, ordered by severity, then
    /// other active outages, then recently resolved.
    public func outages(serviceId: String) async throws -> [Outage] {
        let client = self.client
        let list = try await cache.value(for: serviceId) {
            try await client.send(OutageEndpoints.outages(serviceId: serviceId))
        }
        return list.sorted { lhs, rhs in
            if lhs.isActive != rhs.isActive { return lhs.isActive }
            if lhs.affectsMyService != rhs.affectsMyService { return lhs.affectsMyService }
            if lhs.severity != rhs.severity { return lhs.severity > rhs.severity }
            return lhs.startedAt > rhs.startedAt
        }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Repositories/PlanRepository.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Repositories/PlanRepository.swift`.

```swift
import Foundation

public protocol PlanRepository: Sendable {
    func currentPlan(serviceId: String) async throws -> CurrentPlan
    func availablePlans(serviceId: String) async throws -> [Plan]
    func quoteUpgrade(_ request: UpgradeQuoteRequest) async throws -> UpgradeQuote
    func submitUpgrade(quoteId: String, idempotencyKey: String) async throws -> Order
    func order(id: String) async throws -> Order
}

enum PlanEndpoints {
    static func current(serviceId: String) -> Endpoint<CurrentPlan> {
        Endpoint(path: "/services/\(serviceId)/plan")
    }

    static func available(serviceId: String) -> Endpoint<[Plan]> {
        Endpoint(path: "/services/\(serviceId)/plans/available")
    }

    static func quote(_ request: UpgradeQuoteRequest) throws -> Endpoint<UpgradeQuote> {
        try Endpoint(path: "/plan-changes/quotes", method: .post, jsonBody: request,
                     idempotencyKey: "quote-\(request.serviceId)-\(request.targetPlanId)-\(request.timing.rawValue)")
    }

    struct SubmitBody: Encodable { let quoteId: String }

    static func submit(quoteId: String, idempotencyKey: String) throws -> Endpoint<Order> {
        try Endpoint(path: "/plan-changes/orders", method: .post, jsonBody: SubmitBody(quoteId: quoteId), idempotencyKey: idempotencyKey)
    }

    static func order(id: String) -> Endpoint<Order> {
        Endpoint(path: "/orders/\(id)")
    }
}

public final class LivePlanRepository: PlanRepository {
    private let client: APIClientProtocol
    private let catalogCache: TTLCache<String, [Plan]>

    public init(client: APIClientProtocol, clock: Clock = SystemClock()) {
        self.client = client
        self.catalogCache = TTLCache(ttl: 30 * 60, clock: clock)
    }

    public func currentPlan(serviceId: String) async throws -> CurrentPlan {
        try await client.send(PlanEndpoints.current(serviceId: serviceId))
    }

    /// Plans offered at the service address, sorted slowest → fastest so the
    /// upgrade picker reads naturally.
    public func availablePlans(serviceId: String) async throws -> [Plan] {
        let client = self.client
        return try await catalogCache.value(for: serviceId) {
            let plans = try await client.send(PlanEndpoints.available(serviceId: serviceId))
            return plans.sorted {
                ($0.downloadMbps, $0.monthlyPrice.minorUnits) < ($1.downloadMbps, $1.monthlyPrice.minorUnits)
            }
        }
    }

    public func quoteUpgrade(_ request: UpgradeQuoteRequest) async throws -> UpgradeQuote {
        try await client.send(PlanEndpoints.quote(request))
    }

    public func submitUpgrade(quoteId: String, idempotencyKey: String) async throws -> Order {
        let order = try await client.send(PlanEndpoints.submit(quoteId: quoteId, idempotencyKey: idempotencyKey))
        await catalogCache.invalidateAll()
        return order
    }

    public func order(id: String) async throws -> Order {
        try await client.send(PlanEndpoints.order(id: id))
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Repositories/SupportRepositories.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Repositories/SupportRepositories.swift`.

```swift
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
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/AppointmentPolicy.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/AppointmentPolicy.swift`.

```swift
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
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/ConnectionDiagnostics.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/ConnectionDiagnostics.swift`.

```swift
import Foundation

/// Advice produced by the Wi-Fi troubleshooting flow, most useful first.
public enum Recommendation: Equatable, Hashable, Sendable {
    case waitForOutage(estimatedResolution: Date?)
    case checkPowerAndCables
    case restartRouter
    case moveCloser(deviceNames: [String])
    case switchTo5GHz(deviceNames: [String])
    case reduceActiveDevices(count: Int)
    case testOverEthernet
    case contactSupport

    public var messageKey: String {
        switch self {
        case .waitForOutage: return "troubleshoot.rec.waitForOutage"
        case .checkPowerAndCables: return "troubleshoot.rec.checkPower"
        case .restartRouter: return "troubleshoot.rec.restartRouter"
        case .moveCloser: return "troubleshoot.rec.moveCloser"
        case .switchTo5GHz: return "troubleshoot.rec.switch5GHz"
        case .reduceActiveDevices: return "troubleshoot.rec.reduceDevices"
        case .testOverEthernet: return "troubleshoot.rec.testWired"
        case .contactSupport: return "troubleshoot.rec.contactSupport"
        }
    }
}

/// Everything the troubleshooting flow learned. Turned into advice for the
/// customer and, on escalation, into a support ticket so the agent does not
/// have to ask the same questions again.
public struct DiagnosticReport: Equatable, Sendable {
    public static let busyDeviceThreshold = 25

    public let startedAt: Date
    public var outage: Outage?
    public var routerBefore: RouterStatus?
    public var rebootAttempted = false
    public var routerAfter: RouterStatus?
    public var devices: [ConnectedDevice] = []
    public var speedTest: SpeedTestResult?
    public var plan: Plan?

    public init(startedAt: Date) {
        self.startedAt = startedAt
    }

    public var currentRouter: RouterStatus? { routerAfter ?? routerBefore }

    public var routerUnreachable: Bool {
        currentRouter?.state == .offline
    }

    public func onlineWirelessDevices(at date: Date) -> [ConnectedDevice] {
        devices.filter { !$0.isWired && $0.isOnline(at: date) }
    }

    public func recommendations(at date: Date) -> [Recommendation] {
        if let outage, outage.isActive, outage.affectsMyService {
            return [.waitForOutage(estimatedResolution: outage.estimatedResolution)]
        }
        if routerUnreachable {
            return rebootAttempted ? [.checkPowerAndCables, .contactSupport] : [.checkPowerAndCables, .restartRouter]
        }

        var result: [Recommendation] = []
        let wireless = onlineWirelessDevices(at: date)
        let weak = wireless.filter { $0.signalQuality == .poor }.map(\.name).sorted()
        if !weak.isEmpty { result.append(.moveCloser(deviceNames: weak)) }

        let dualBandCapableOn24 = wireless
            .filter { $0.band == .ghz2_4 && ($0.signalQuality == .excellent || $0.signalQuality == .good) }
            .map(\.name).sorted()
        let routerHas5GHz = currentRouter?.networks.contains { $0.enabled && $0.bands.contains(.ghz5) } ?? false
        if routerHas5GHz && !dualBandCapableOn24.isEmpty { result.append(.switchTo5GHz(deviceNames: dualBandCapableOn24)) }

        if wireless.count >= Self.busyDeviceThreshold { result.append(.reduceActiveDevices(count: wireless.count)) }

        if let speedTest, let plan, speedTest.verdict(against: plan) == .belowExpected {
            if !rebootAttempted { result.append(.restartRouter) }
            result.append(.testOverEthernet)
        }
        if result.isEmpty && currentRouter?.state == .degraded && !rebootAttempted {
            result.append(.restartRouter)
        }
        return result
    }

    /// Ticket raised when the customer says the flow did not fix things.
    /// Total loss of service after a reboot is triaged one level higher.
    public func ticketRequest(serviceId: String?, customerNotes: String) -> NewTicketRequest {
        let priority: TicketPriority = routerUnreachable && rebootAttempted ? .p1 : TicketCategory.connectivity.suggestedPriority
        let subject = routerUnreachable ? "Router offline after troubleshooting" : "Wi-Fi problem not resolved by troubleshooting"
        return NewTicketRequest(subject: subject, description: summary(customerNotes: customerNotes),
                                category: .connectivity, priority: priority, serviceId: serviceId)
    }

    /// Agent-facing plain-text summary (not localized: read by support staff).
    public func summary(customerNotes: String) -> String {
        var lines: [String] = []
        let notes = customerNotes.trimmingCharacters(in: .whitespacesAndNewlines)
        if !notes.isEmpty { lines.append("Customer notes: \(notes)") }
        lines.append("Troubleshooting started: \(ISO8601.string(from: startedAt))")
        if let outage {
            lines.append("Known outage: \(outage.id) (\(outage.severity.rawValue), active: \(outage.isActive))")
        } else {
            lines.append("No outage affecting this service.")
        }
        if let before = routerBefore {
            lines.append("Router \(before.routerId) \(before.model) fw \(before.firmwareVersion): \(before.state.rawValue), uptime \(before.uptimeSeconds)s")
        }
        lines.append("Reboot attempted: \(rebootAttempted ? "yes" : "no")")
        if let after = routerAfter { lines.append("Router state after reboot: \(after.state.rawValue)") }
        if !devices.isEmpty {
            let poor = devices.filter { $0.signalQuality == .poor }.count
            lines.append("Devices: \(devices.count) known, \(poor) with poor signal")
        }
        if let test = speedTest {
            var line = String(format: "Speed test: %.0f/%.0f Mbps, %.0f ms latency", test.downloadMbps, test.uploadMbps, test.latencyMs)
            if let plan { line += " (plan \(plan.downloadMbps)/\(plan.uploadMbps) Mbps)" }
            lines.append(line)
        }
        return lines.joined(separator: "\n")
    }
}

/// Reboots a router and waits for it to come back, tolerating the errors
/// expected while it is unreachable.
public struct RouterRecoveryMonitor: Sendable {
    public enum RecoveryError: Error, Equatable {
        case didNotRecover(lastKnown: RouterState?)
    }

    private let router: RouterRepository
    private let sleeper: Sleeper
    public let initialDelay: TimeInterval
    public let pollInterval: TimeInterval
    public let maxPolls: Int

    public init(router: RouterRepository, sleeper: Sleeper, initialDelay: TimeInterval = 30, pollInterval: TimeInterval = 15, maxPolls: Int = 16) {
        self.router = router
        self.sleeper = sleeper
        self.initialDelay = initialDelay
        self.pollInterval = pollInterval
        self.maxPolls = max(1, maxPolls)
    }

    /// Issues the reboot, then polls until the router reports online or
    /// degraded. `onState` receives each observed state for progress UI.
    public func rebootAndWait(routerId: String, serviceId: String,
                              onState: @Sendable (RouterState) async -> Void = { _ in }) async throws -> RouterStatus {
        try await router.reboot(routerId: routerId)
        await onState(.rebooting)
        try await sleeper.sleep(seconds: initialDelay)

        var lastKnown: RouterState?
        for poll in 0..<maxPolls {
            try Task.checkCancellation()
            if let status = try? await router.status(serviceId: serviceId) {
                lastKnown = status.state
                await onState(status.state)
                if status.state == .online || status.state == .degraded { return status }
            }
            if poll < maxPolls - 1 { try await sleeper.sleep(seconds: pollInterval) }
        }
        throw RecoveryError.didNotRecover(lastKnown: lastKnown)
    }
}
```
