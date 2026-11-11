# Go Kinetic Consumer mobile app (B2C): apps/gokinetic-consumer-ios/Sources (part 3 of 7)

- **Application:** Go Kinetic Consumer mobile app (B2C)
- **Tech stack:** Swift / SwiftUI
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 15

## Files

- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/DeepLink.swift` (157 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/PaymentPlanning.swift` (203 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/ServiceHealth.swift` (87 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/SpeedTestService.swift` (214 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/UsageInsights.swift` (134 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Support/Analytics.swift` (129 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Support/AppLogger.swift` (106 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Support/Formatters.swift` (150 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Support/TTLCache.swift` (109 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Support/Validators.swift` (166 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/App/AppRoute.swift` (20 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/App/AppViewModel.swift` (138 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/App/RootView.swift` (150 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/App/WebAuthenticator.swift` (49 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Appointments/AppointmentBookingViewModel.swift` (124 lines)

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/DeepLink.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/DeepLink.swift`.

```swift
import Foundation

/// Destinations reachable from push notifications, universal links and
/// the custom URL scheme.
public enum DeepLink: Equatable, Hashable, Sendable {
    case dashboard
    case bills
    case invoice(id: String)
    case payBill(invoiceId: String?)
    case plan
    case upgrade
    case usage
    case wifi
    case devices
    case speedTest
    case outages
    case tickets
    case ticket(id: String)
    case appointments
    case appointment(id: String)
    case settings

    /// Tab that should be selected when navigating to this link.
    public var tab: AppTab {
        switch self {
        case .dashboard, .outages: return .home
        case .bills, .invoice, .payBill: return .billing
        case .plan, .upgrade, .usage: return .plan
        case .wifi, .devices, .speedTest: return .wifi
        case .tickets, .ticket, .appointments, .appointment, .settings: return .support
        }
    }

    /// Parses `gokinetic://bills/INV-123` or
    /// `https://my.gokinetic.example/app/bills/INV-123`.
    public init?(url: URL, universalLinkHost: String = "my.gokinetic.example") {
        var segments: [String]
        switch url.scheme?.lowercased() {
        case "gokinetic":
            segments = ([url.host].compactMap { $0 } + url.pathComponents).filter { $0 != "/" && !$0.isEmpty }
        case "https" where url.host?.lowercased() == universalLinkHost:
            segments = url.pathComponents.filter { $0 != "/" && !$0.isEmpty }
            guard segments.first == "app" else { return nil }
            segments.removeFirst()
        default:
            return nil
        }
        guard let link = DeepLink(segments: segments.map { $0.removingPercentEncoding ?? $0 }) else { return nil }
        self = link
    }

    init?(segments: [String]) {
        guard let head = segments.first?.lowercased() else {
            self = .dashboard
            return
        }
        let id = segments.count > 1 ? segments[1] : nil
        if let id, !DeepLink.isSafeIdentifier(id) { return nil }
        switch (head, id) {
        case ("home", _), ("dashboard", _): self = .dashboard
        case ("bills", nil): self = .bills
        case ("bills", let id?): self = .invoice(id: id)
        case ("pay", let id): self = .payBill(invoiceId: id)
        case ("plan", nil): self = .plan
        case ("plan", "upgrade"?), ("upgrade", _): self = .upgrade
        case ("usage", _): self = .usage
        case ("wifi", nil): self = .wifi
        case ("wifi", "devices"?), ("devices", _): self = .devices
        case ("speedtest", _), ("speed-test", _): self = .speedTest
        case ("outages", _), ("outage", _): self = .outages
        case ("tickets", nil), ("support", nil): self = .tickets
        case ("tickets", let id?), ("support", let id?): self = .ticket(id: id)
        case ("appointments", nil): self = .appointments
        case ("appointments", let id?): self = .appointment(id: id)
        case ("settings", _): self = .settings
        default: return nil
        }
    }

    /// Identifiers are opaque server IDs; reject anything that could be
    /// used for path traversal or injection into later API paths.
    static func isSafeIdentifier(_ id: String) -> Bool {
        guard (1...64).contains(id.count) else { return false }
        return id.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }
    }
}

public enum AppTab: String, CaseIterable, Hashable, Sendable {
    case home, billing, plan, wifi, support
}

/// Push notification categories set by the backend in `aps.category`.
public enum PushCategory: String, Sendable {
    case billIssued = "BILL_ISSUED"
    case paymentFailed = "PAYMENT_FAILED"
    case paymentReceived = "PAYMENT_RECEIVED"
    case outageStarted = "OUTAGE_STARTED"
    case outageResolved = "OUTAGE_RESOLVED"
    case ticketUpdated = "TICKET_UPDATED"
    case appointmentReminder = "APPOINTMENT_REMINDER"
    case technicianEnRoute = "TECHNICIAN_EN_ROUTE"
    case planChangeCompleted = "PLAN_CHANGE_COMPLETED"
}

/// Parsed push payload. Pure logic — the UIKit delegate hands the raw
/// `userInfo` dictionary here and routes the resulting link.
public struct PushNotification: Equatable, Sendable {
    public let category: PushCategory
    public let link: DeepLink
    public let entityId: String?

    public init?(userInfo: [AnyHashable: Any]) {
        let aps = userInfo["aps"] as? [String: Any]
        guard let rawCategory = (aps?["category"] as? String) ?? (userInfo["category"] as? String),
              let category = PushCategory(rawValue: rawCategory) else { return nil }
        let entity = (userInfo["entityId"] as? String).flatMap { DeepLink.isSafeIdentifier($0) ? $0 : nil }

        // An explicit link wins when present and parseable.
        if let raw = userInfo["link"] as? String, let url = URL(string: raw), let explicit = DeepLink(url: url) {
            self.link = explicit
        } else {
            self.link = PushNotification.defaultLink(for: category, entityId: entity)
        }
        self.category = category
        self.entityId = entity
    }

    static func defaultLink(for category: PushCategory, entityId: String?) -> DeepLink {
        switch category {
        case .billIssued, .paymentReceived:
            return entityId.map { .invoice(id: $0) } ?? .bills
        case .paymentFailed:
            return .payBill(invoiceId: entityId)
        case .outageStarted, .outageResolved:
            return .outages
        case .ticketUpdated:
            return entityId.map { .ticket(id: $0) } ?? .tickets
        case .appointmentReminder, .technicianEnRoute:
            return entityId.map { .appointment(id: $0) } ?? .appointments
        case .planChangeCompleted:
            return .plan
        }
    }

    /// Whether a notification of this category should be shown as a banner
    /// while the app is in the foreground, given the user's preferences.
    public func shouldPresentInForeground(preferences: NotificationPreferences) -> Bool {
        switch category {
        case .billIssued, .paymentReceived, .paymentFailed: return preferences.billing
        case .outageStarted, .outageResolved: return preferences.outages
        case .ticketUpdated: return preferences.ticketUpdates
        case .appointmentReminder, .technicianEnRoute: return preferences.appointments
        case .planChangeCompleted: return true
        }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/PaymentPlanning.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/PaymentPlanning.swift`.

```swift
import Foundation

/// What a one-off payment is applied to.
public enum PaymentTarget: Equatable, Hashable, Sendable {
    case accountBalance
    case invoice(id: String)

    public var invoiceId: String? {
        if case .invoice(let id) = self { return id }
        return nil
    }
}

/// A preset amount offered on the pay-bill screen.
public struct PaymentAmountOption: Equatable, Identifiable, Sendable {
    public enum Kind: String, Sendable {
        case balance, invoice, overdueInvoice
    }

    public let kind: Kind
    public let target: PaymentTarget
    public let amount: Money
    public let invoiceNumber: String?

    public init(kind: Kind, target: PaymentTarget, amount: Money, invoiceNumber: String? = nil) {
        self.kind = kind
        self.target = target
        self.amount = amount
        self.invoiceNumber = invoiceNumber
    }

    public var id: String { "\(kind.rawValue)-\(target.invoiceId ?? "balance")" }
}

/// Pure rules behind the pay-bill screen: which amounts to offer, which
/// stored methods may be charged, and how much overpayment is tolerated.
public enum PaymentPlanner {
    /// The full balance first, then each unsettled invoice (overdue first,
    /// then by due date) whose amount differs from the balance.
    public static func amountOptions(balance: Money, invoices: [Invoice], at date: Date) -> [PaymentAmountOption] {
        var options: [PaymentAmountOption] = []
        if balance.isPositive {
            options.append(PaymentAmountOption(kind: .balance, target: .accountBalance, amount: balance))
        }
        let unsettled = invoices
            .filter { !$0.isSettled && $0.amountDue.currency == balance.currency && $0.amountDue.isPositive }
            .sorted { lhs, rhs in
                let lhsOverdue = lhs.isOverdue(at: date), rhsOverdue = rhs.isOverdue(at: date)
                if lhsOverdue != rhsOverdue { return lhsOverdue }
                return lhs.dueAt < rhs.dueAt
            }
        for invoice in unsettled where invoice.amountDue != balance || !balance.isPositive {
            options.append(PaymentAmountOption(
                kind: invoice.isOverdue(at: date) ? .overdueInvoice : .invoice,
                target: .invoice(id: invoice.id),
                amount: invoice.amountDue,
                invoiceNumber: invoice.number
            ))
        }
        return options
    }

    public static func usableMethods(_ methods: [PaymentMethod], at date: Date) -> [PaymentMethod] {
        methods.filter { !$0.isExpired(at: date) }
    }

    /// The default method when it is still valid, otherwise the first valid one.
    public static func preferredMethod(_ methods: [PaymentMethod], at date: Date) -> PaymentMethod? {
        let usable = usableMethods(methods, at: date)
        return usable.first(where: \.isDefault) ?? usable.first
    }

    /// Customers may overpay by up to one typical monthly bill (the largest
    /// recent invoice total) so the excess sits on the account as credit.
    public static func overpaymentAllowance(invoices: [Invoice], currency: String) -> Money {
        let largest = invoices
            .filter { $0.total.currency == currency && $0.status != .void }
            .map(\.total.minorUnits)
            .max() ?? 0
        return Money(minorUnits: largest, currency: currency)
    }
}

/// The in-progress payment the customer is composing. Owns the
/// idempotency key: the key is kept across retries of the *same* payment
/// (so a timeout followed by a retry can never double-charge) and rotated
/// whenever the terms change or the previous attempt reached a final
/// outcome on the server.
public struct PaymentDraft: Equatable, Sendable {
    public private(set) var target: PaymentTarget
    public private(set) var amount: Money?
    public private(set) var paymentMethodId: String?
    public private(set) var idempotencyKey: String

    public init(target: PaymentTarget = .accountBalance, amount: Money? = nil, paymentMethodId: String? = nil, idempotencyKey: String = UUID().uuidString) {
        self.target = target
        self.amount = amount
        self.paymentMethodId = paymentMethodId
        self.idempotencyKey = idempotencyKey
    }

    /// Applies new terms; returns true when anything actually changed.
    @discardableResult
    public mutating func update(target: PaymentTarget? = nil, amount: Money?? = nil, paymentMethodId: String?? = nil,
                                makeKey: () -> String = { UUID().uuidString }) -> Bool {
        let newTarget = target ?? self.target
        let newAmount = amount ?? self.amount
        let newMethod = paymentMethodId ?? self.paymentMethodId
        guard newTarget != self.target || newAmount != self.amount || newMethod != self.paymentMethodId else { return false }
        self.target = newTarget
        self.amount = newAmount
        self.paymentMethodId = newMethod
        self.idempotencyKey = makeKey()
        return true
    }

    public mutating func rotateKey(makeKey: () -> String = { UUID().uuidString }) {
        idempotencyKey = makeKey()
    }

    public var request: PaymentRequest? {
        guard let amount, let paymentMethodId else { return nil }
        return PaymentRequest(invoiceId: target.invoiceId, paymentMethodId: paymentMethodId,
                              amount: amount, idempotencyKey: idempotencyKey)
    }
}

/// Classified payment failure, from either a thrown API error or a
/// payment the server accepted but marked `FAILED`.
public enum PaymentFailure: Equatable, Sendable {
    case declined
    case insufficientFunds
    case methodExpired
    case amountRejected(detail: String?)
    case duplicate
    /// The request may or may not have reached the processor. Retrying with
    /// the same idempotency key is safe and resolves the uncertainty.
    case outcomeUnknown
    case other(UserFacingError)

    public init(_ error: Error) {
        switch error {
        case APIError.validation(let problem):
            self = PaymentFailure(code: problem.code) ?? .amountRejected(detail: problem.firstError(for: "amount") ?? problem.detail)
        case APIError.conflict(let problem):
            self = PaymentFailure(code: problem?.code) ?? .duplicate
        case APIError.offline, APIError.timedOut, APIError.transport:
            self = .outcomeUnknown
        case APIError.server(let status, _) where status == 502 || status == 504:
            self = .outcomeUnknown
        default:
            self = .other(UserFacingError(error))
        }
    }

    /// Maps a payment returned with status `FAILED`; nil for any other status.
    public init?(payment: Payment) {
        guard payment.status == .failed else { return nil }
        let normalized = payment.failureReason?.lowercased().replacingOccurrences(of: "_", with: "-")
        self = PaymentFailure(code: normalized) ?? .declined
    }

    private init?(code: String?) {
        switch code {
        case "card-declined", "declined", "do-not-honor": self = .declined
        case "insufficient-funds": self = .insufficientFunds
        case "payment-method-expired", "expired-card", "expired-method": self = .methodExpired
        case "duplicate-payment": self = .duplicate
        default: return nil
        }
    }

    /// Whether the server reached a final answer for this idempotency key.
    /// Only unknown outcomes keep the key so the retry is deduplicated.
    public var isFinal: Bool {
        self != .outcomeUnknown
    }

    public var messageKey: String {
        switch self {
        case .declined: return "payment.error.declined"
        case .insufficientFunds: return "payment.error.insufficientFunds"
        case .methodExpired: return "payment.error.methodExpired"
        case .amountRejected: return "payment.error.amountRejected"
        case .duplicate: return "payment.error.duplicate"
        case .outcomeUnknown: return "payment.error.outcomeUnknown"
        case .other(let error): return error.titleKey
        }
    }

    public var analyticsCode: String {
        switch self {
        case .declined: return "declined"
        case .insufficientFunds: return "insufficient_funds"
        case .methodExpired: return "method_expired"
        case .amountRejected: return "amount_rejected"
        case .duplicate: return "duplicate"
        case .outcomeUnknown: return "outcome_unknown"
        case .other(let error): return "other_\(error.kind)"
        }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/ServiceHealth.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/ServiceHealth.swift`.

```swift
import Foundation

public enum HealthIssue: Equatable, Hashable, Sendable {
    case routerOffline
    case routerDegraded
    case routerBusy(RouterState)
    case areaDegraded(outageId: String)
    case slowSpeed(measuredMbps: Int, planMbps: Int)

    public var messageKey: String {
        switch self {
        case .routerOffline: return "health.issue.routerOffline"
        case .routerDegraded: return "health.issue.routerDegraded"
        case .routerBusy(let state): return "health.issue.router.\(state.rawValue.lowercased())"
        case .areaDegraded: return "health.issue.areaDegraded"
        case .slowSpeed: return "health.issue.slowSpeed"
        }
    }
}

/// One-glance answer to "is my broadband OK?", combining network outages,
/// router telemetry and the customer's latest speed test.
public enum ServiceHealth: Equatable, Sendable {
    case operational
    /// Planned work affecting the customer, with nothing else wrong.
    case maintenance(Outage)
    case degraded([HealthIssue])
    case outage(Outage)
    case unknown

    public var headlineKey: String {
        switch self {
        case .operational: return "health.operational"
        case .maintenance: return "health.maintenance"
        case .degraded: return "health.degraded"
        case .outage: return "health.outage"
        case .unknown: return "health.unknown"
        }
    }

    /// Troubleshooting is pointless while a known outage explains the problem.
    public var suggestsTroubleshooting: Bool {
        switch self {
        case .degraded, .unknown: return true
        case .operational, .maintenance, .outage: return false
        }
    }
}

public enum ServiceHealthEvaluator {
    /// Speed tests older than this no longer describe the current line.
    public static let speedTestFreshness: TimeInterval = 24 * 3600

    public static func evaluate(outages: [Outage]?, router: RouterStatus?, latestSpeedTest: SpeedTestResult?,
                                plan: Plan?, now: Date) -> ServiceHealth {
        guard outages != nil || router != nil else { return .unknown }
        let affecting = (outages ?? []).filter { $0.isActive && $0.affectsMyService }

        if let major = affecting.filter({ $0.severity == .major }).max(by: { $0.startedAt < $1.startedAt }) {
            return .outage(major)
        }

        var issues: [HealthIssue] = affecting
            .filter { $0.severity == .degraded }
            .sorted { $0.startedAt < $1.startedAt }
            .map { .areaDegraded(outageId: $0.id) }

        if let router {
            switch router.state {
            case .offline: issues.append(.routerOffline)
            case .degraded: issues.append(.routerDegraded)
            case .rebooting, .updating: issues.append(.routerBusy(router.state))
            case .online: break
            }
        }

        if let test = latestSpeedTest, let plan, now.timeIntervalSince(test.measuredAt) <= speedTestFreshness,
           test.verdict(against: plan) == .belowExpected {
            issues.append(.slowSpeed(measuredMbps: Int(test.downloadMbps.rounded()), planMbps: plan.downloadMbps))
        }

        if !issues.isEmpty { return .degraded(issues) }
        if let planned = affecting.first(where: { $0.severity == .info }) { return .maintenance(planned) }
        return .operational
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/SpeedTestService.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/SpeedTestService.swift`.

```swift
import Foundation

/// Progress emitted while a speed test runs.
public enum SpeedTestPhase: Equatable, Sendable {
    case selectingServer
    case latency
    case download(currentMbps: Double, progress: Double)
    case upload(currentMbps: Double, progress: Double)
    case finished(SpeedTestResult)
}

/// Low-level probe that actually moves bytes. Abstracted so the statistical
/// logic below is testable without a network.
public protocol SpeedTestEngine: Sendable {
    func nearestServer() async throws -> SpeedTestServer
    /// Round-trip time of a tiny request in milliseconds.
    func ping(server: SpeedTestServer) async throws -> Double
    /// Downloads `bytes` and returns elapsed seconds.
    func download(server: SpeedTestServer, bytes: Int) async throws -> TimeInterval
    /// Uploads `bytes` and returns elapsed seconds.
    func upload(server: SpeedTestServer, bytes: Int) async throws -> TimeInterval
}

public struct SpeedTestServer: Codable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let baseURL: URL

    public init(id: String, name: String, baseURL: URL) {
        self.id = id
        self.name = name
        self.baseURL = baseURL
    }
}

public struct SpeedTestConfiguration: Sendable {
    public var pingSamples: Int = 8
    /// Payload sizes escalate so slow links finish quickly and fast links
    /// run long enough to fill the pipe.
    public var downloadSizes: [Int] = [1, 5, 10, 25, 50, 100].map { $0 * 1_000_000 }
    public var uploadSizes: [Int] = [1, 5, 10, 25].map { $0 * 1_000_000 }
    /// Stop escalating once a single transfer takes at least this long.
    public var targetTransferSeconds: TimeInterval = 2.0

    public init() {}
}

public protocol SpeedTestRunning: Sendable {
    func run() -> AsyncThrowingStream<SpeedTestPhase, Error>
    func history() async throws -> [SpeedTestResult]
}

enum SpeedTestEndpoints {
    static func record(_ result: SpeedTestResult) throws -> Endpoint<SpeedTestResult> {
        try Endpoint(path: "/diagnostics/speed-tests", method: .post, jsonBody: result, idempotencyKey: result.id)
    }

    static func history() -> Endpoint<[SpeedTestResult]> {
        Endpoint(path: "/diagnostics/speed-tests", query: [URLQueryItem(name: "limit", value: "10")])
    }
}

public final class SpeedTestService: SpeedTestRunning {
    private let engine: SpeedTestEngine
    private let client: APIClientProtocol
    private let clock: Clock
    private let configuration: SpeedTestConfiguration

    public init(engine: SpeedTestEngine, client: APIClientProtocol, clock: Clock = SystemClock(), configuration: SpeedTestConfiguration = SpeedTestConfiguration()) {
        self.engine = engine
        self.client = client
        self.clock = clock
        self.configuration = configuration
    }

    public func run() -> AsyncThrowingStream<SpeedTestPhase, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let result = try await self.measure { continuation.yield($0) }
                    continuation.yield(.finished(result))
                    // Recording is best-effort: the user still sees their result.
                    _ = try? await self.client.send(SpeedTestEndpoints.record(result))
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    public func history() async throws -> [SpeedTestResult] {
        try await client.send(SpeedTestEndpoints.history()).sorted { $0.measuredAt > $1.measuredAt }
    }

    func measure(progress: (SpeedTestPhase) -> Void) async throws -> SpeedTestResult {
        progress(.selectingServer)
        let server = try await engine.nearestServer()

        progress(.latency)
        var pings: [Double] = []
        for _ in 0..<configuration.pingSamples {
            try Task.checkCancellation()
            pings.append(try await engine.ping(server: server))
        }
        let latency = Self.trimmedMean(pings)
        let jitter = Self.jitter(pings)

        let download = try await throughput(sizes: configuration.downloadSizes) { bytes in
            try await self.engine.download(server: server, bytes: bytes)
        } report: { mbps, fraction in
            progress(.download(currentMbps: mbps, progress: fraction))
        }

        let upload = try await throughput(sizes: configuration.uploadSizes) { bytes in
            try await self.engine.upload(server: server, bytes: bytes)
        } report: { mbps, fraction in
            progress(.upload(currentMbps: mbps, progress: fraction))
        }

        return SpeedTestResult(measuredAt: clock.now(), downloadMbps: download, uploadMbps: upload,
                               latencyMs: latency, jitterMs: jitter, server: server.name)
    }

    /// Runs escalating transfers and reports the best sustained rate from
    /// transfers long enough to be meaningful.
    private func throughput(
        sizes: [Int],
        transfer: (Int) async throws -> TimeInterval,
        report: (Double, Double) -> Void
    ) async throws -> Double {
        var samples: [Double] = []
        for (index, bytes) in sizes.enumerated() {
            try Task.checkCancellation()
            let seconds = try await transfer(bytes)
            guard seconds > 0 else { continue }
            let mbps = Self.megabitsPerSecond(bytes: bytes, seconds: seconds)
            samples.append(mbps)
            report(mbps, Double(index + 1) / Double(sizes.count))
            if seconds >= configuration.targetTransferSeconds { break }
        }
        guard !samples.isEmpty else { throw APIError.timedOut }
        // The first small transfer is dominated by TCP slow start; ignore it
        // when we have better data.
        let usable = samples.count > 1 ? Array(samples.dropFirst()) : samples
        return usable.max() ?? 0
    }

    static func megabitsPerSecond(bytes: Int, seconds: TimeInterval) -> Double {
        (Double(bytes) * 8 / 1_000_000) / seconds
    }

    /// Mean after discarding the highest and lowest sample.
    static func trimmedMean(_ values: [Double]) -> Double {
        guard !values.isEmpty else { return 0 }
        guard values.count > 2 else { return values.reduce(0, +) / Double(values.count) }
        let trimmed = values.sorted().dropFirst().dropLast()
        return trimmed.reduce(0, +) / Double(trimmed.count)
    }

    /// Mean absolute difference between consecutive pings (RFC 3550 style).
    static func jitter(_ values: [Double]) -> Double {
        guard values.count > 1 else { return 0 }
        let diffs = zip(values.dropFirst(), values).map { abs($0 - $1) }
        return diffs.reduce(0, +) / Double(diffs.count)
    }
}

/// URLSession engine against the operator's speed-test servers.
public struct URLSessionSpeedTestEngine: SpeedTestEngine {
    private let session: URLSession
    private let discoveryURL: URL

    public init(discoveryURL: URL, session: URLSession = URLSession(configuration: .ephemeral)) {
        self.discoveryURL = discoveryURL
        self.session = session
    }

    public func nearestServer() async throws -> SpeedTestServer {
        let (data, _) = try await session.data(from: discoveryURL)
        let servers = try JSONCoding.decoder.decode([SpeedTestServer].self, from: data)
        guard let first = servers.first else { throw APIError.notFound(nil) }
        return first
    }

    public func ping(server: SpeedTestServer) async throws -> Double {
        var request = URLRequest(url: server.baseURL.appendingPathComponent("ping"))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let start = Date()
        _ = try await session.data(for: request)
        return Date().timeIntervalSince(start) * 1000
    }

    public func download(server: SpeedTestServer, bytes: Int) async throws -> TimeInterval {
        var components = URLComponents(url: server.baseURL.appendingPathComponent("download"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "bytes", value: String(bytes))]
        guard let url = components?.url else { throw APIError.invalidURL(server.baseURL.absoluteString) }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let start = Date()
        _ = try await session.data(for: request)
        return Date().timeIntervalSince(start)
    }

    public func upload(server: SpeedTestServer, bytes: Int) async throws -> TimeInterval {
        var request = URLRequest(url: server.baseURL.appendingPathComponent("upload"))
        request.httpMethod = "POST"
        let start = Date()
        _ = try await session.upload(for: request, from: Data(count: bytes))
        return Date().timeIntervalSince(start)
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/UsageInsights.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Services/UsageInsights.swift`.

```swift
import Foundation

public enum DataCapStatus: Equatable, Sendable {
    case unlimited
    case withinCap(fraction: Double)
    /// At or above the warning threshold but on track to stay under the cap.
    case approaching(fraction: Double)
    case projectedToExceed(projectedBytes: Int64)
    case exceeded(overageBytes: Int64)

    public static let warningThreshold = 0.8

    public var needsAttention: Bool {
        switch self {
        case .unlimited, .withinCap: return false
        case .approaching, .projectedToExceed, .exceeded: return true
        }
    }
}

public struct DailyUsage: Equatable, Hashable, Sendable, Identifiable {
    public let day: Date
    public let downloadBytes: Int64
    public let uploadBytes: Int64

    public init(day: Date, downloadBytes: Int64, uploadBytes: Int64) {
        self.day = day
        self.downloadBytes = downloadBytes
        self.uploadBytes = uploadBytes
    }

    public var id: Date { day }
    public var totalBytes: Int64 { downloadBytes + uploadBytes }
}

/// Derived figures for the usage screen: per-day totals, cap position,
/// projection and a daily budget for the rest of the billing cycle.
public struct UsageInsights: Equatable, Sendable {
    public let total: Int64
    public let days: [DailyUsage]
    public let averagePerDay: Int64
    public let busiestDay: DailyUsage?
    public let projectedCycleTotal: Int64
    public let daysLeftInCycle: Int
    public let capStatus: DataCapStatus
    /// Bytes per day that keep the customer under the cap; nil when unlimited.
    public let dailyBudget: Int64?
    /// Share of traffic that is download, 0...1.
    public let downloadShare: Double

    public init(report: UsageReport, now: Date, calendar: Calendar = .gregorianUTC) {
        let days = UsageInsights.dailyTotals(report.samples, calendar: calendar)
        let total = report.total
        let projected = report.projectedCycleTotal(at: now)
        let daysLeft = UsageInsights.daysRemaining(in: report, now: now, calendar: calendar)

        self.total = total
        self.days = days
        self.averagePerDay = days.isEmpty ? 0 : total / Int64(days.count)
        self.busiestDay = days.max { $0.totalBytes < $1.totalBytes }
        self.projectedCycleTotal = projected
        self.daysLeftInCycle = daysLeft
        self.downloadShare = total > 0 ? Double(report.totalDownload) / Double(total) : 0
        self.capStatus = UsageInsights.capStatus(total: total, projected: projected, cap: report.dataCapBytes)
        if let cap = report.dataCapBytes {
            let remaining = max(cap - total, 0)
            self.dailyBudget = remaining / Int64(max(daysLeft, 1))
        } else {
            self.dailyBudget = nil
        }
    }

    static func capStatus(total: Int64, projected: Int64, cap: Int64?) -> DataCapStatus {
        guard let cap, cap > 0 else { return .unlimited }
        if total >= cap { return .exceeded(overageBytes: total - cap) }
        if projected > cap { return .projectedToExceed(projectedBytes: projected) }
        let fraction = Double(total) / Double(cap)
        return fraction >= DataCapStatus.warningThreshold ? .approaching(fraction: fraction) : .withinCap(fraction: fraction)
    }

    /// Whole days from today until the cycle ends, counting today.
    static func daysRemaining(in report: UsageReport, now: Date, calendar: Calendar) -> Int {
        guard now < report.cycleEnd else { return 0 }
        let start = calendar.startOfDay(for: max(now, report.cycleStart))
        let end = calendar.startOfDay(for: report.cycleEnd)
        let whole = calendar.dateComponents([.day], from: start, to: end).day ?? 0
        return max(whole, 0) + (report.cycleEnd > end ? 1 : 0)
    }

    /// Collapses (typically hourly) samples into one entry per calendar day.
    public static func dailyTotals(_ samples: [UsageSample], calendar: Calendar = .gregorianUTC) -> [DailyUsage] {
        rebucket(samples, to: .day, calendar: calendar).map {
            DailyUsage(day: $0.timestamp, downloadBytes: $0.downloadBytes, uploadBytes: $0.uploadBytes)
        }
    }

    /// Re-aggregates samples into buckets of `component` (hour, day, week,
    /// month), each stamped with the bucket's start. Output is chronological.
    public static func rebucket(_ samples: [UsageSample], to component: Calendar.Component, calendar: Calendar = .gregorianUTC) -> [UsageSample] {
        var download: [Date: Int64] = [:]
        var upload: [Date: Int64] = [:]
        for sample in samples {
            let bucket = calendar.dateInterval(of: component, for: sample.timestamp)?.start ?? sample.timestamp
            download[bucket, default: 0] += sample.downloadBytes
            upload[bucket, default: 0] += sample.uploadBytes
        }
        return download.keys.sorted().map {
            UsageSample(timestamp: $0, downloadBytes: download[$0] ?? 0, uploadBytes: upload[$0] ?? 0)
        }
    }

    /// Hour of day (0–23) with the most traffic across the samples, used for
    /// the "your busiest time is 9 PM" hint. Nil without data.
    public static func peakHour(_ samples: [UsageSample], calendar: Calendar) -> Int? {
        var perHour: [Int: Int64] = [:]
        for sample in samples where sample.totalBytes > 0 {
            perHour[calendar.component(.hour, from: sample.timestamp), default: 0] += sample.totalBytes
        }
        return perHour.max { lhs, rhs in
            lhs.value == rhs.value ? lhs.key > rhs.key : lhs.value < rhs.value
        }?.key
    }
}

public extension UsagePeriod {
    /// Chart bucket granularity appropriate for the period.
    var chartUnit: Calendar.Component {
        switch self {
        case .day: return .hour
        case .week, .month: return .day
        }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Support/Analytics.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Support/Analytics.swift`.

```swift
import Foundation

/// Typed analytics events. Keeping events as an enum prevents typos in
/// event names and keeps the property set reviewable for privacy.
public enum AnalyticsEvent: Equatable, Sendable {
    case screenViewed(String)
    case loginStarted
    case loginSucceeded(method: String)
    case loginFailed(reason: String)
    case logout
    case biometricUnlock(success: Bool)
    case planUpgradeStarted(fromPlanId: String)
    case planUpgradeQuoted(targetPlanId: String)
    case planUpgradeSubmitted(targetPlanId: String, timing: String)
    case paymentSubmitted(amountMinor: Int64, currency: String)
    case paymentFailed(code: String)
    case autopayToggled(enabled: Bool)
    case routerRebooted
    case wifiUpdated(changedPassphrase: Bool)
    case deviceBlocked(blocked: Bool)
    case speedTestCompleted(downloadMbps: Int, verdict: String)
    case ticketCreated(category: String)
    case chatStarted
    case appointmentBooked(type: String)
    case appointmentCancelled
    case pushOpened(category: String)

    public var name: String {
        switch self {
        case .screenViewed: return "screen_viewed"
        case .loginStarted: return "login_started"
        case .loginSucceeded: return "login_succeeded"
        case .loginFailed: return "login_failed"
        case .logout: return "logout"
        case .biometricUnlock: return "biometric_unlock"
        case .planUpgradeStarted: return "plan_upgrade_started"
        case .planUpgradeQuoted: return "plan_upgrade_quoted"
        case .planUpgradeSubmitted: return "plan_upgrade_submitted"
        case .paymentSubmitted: return "payment_submitted"
        case .paymentFailed: return "payment_failed"
        case .autopayToggled: return "autopay_toggled"
        case .routerRebooted: return "router_rebooted"
        case .wifiUpdated: return "wifi_updated"
        case .deviceBlocked: return "device_blocked"
        case .speedTestCompleted: return "speed_test_completed"
        case .ticketCreated: return "ticket_created"
        case .chatStarted: return "chat_started"
        case .appointmentBooked: return "appointment_booked"
        case .appointmentCancelled: return "appointment_cancelled"
        case .pushOpened: return "push_opened"
        }
    }

    public var properties: [String: String] {
        switch self {
        case .screenViewed(let screen): return ["screen": screen]
        case .loginSucceeded(let method): return ["method": method]
        case .loginFailed(let reason): return ["reason": reason]
        case .biometricUnlock(let success): return ["success": String(success)]
        case .planUpgradeStarted(let from): return ["from_plan": from]
        case .planUpgradeQuoted(let target): return ["target_plan": target]
        case .planUpgradeSubmitted(let target, let timing): return ["target_plan": target, "timing": timing]
        case .paymentSubmitted(let amount, let currency): return ["amount_minor": String(amount), "currency": currency]
        case .paymentFailed(let code): return ["code": code]
        case .autopayToggled(let enabled): return ["enabled": String(enabled)]
        case .wifiUpdated(let changed): return ["changed_passphrase": String(changed)]
        case .deviceBlocked(let blocked): return ["blocked": String(blocked)]
        case .speedTestCompleted(let mbps, let verdict): return ["download_mbps": String(mbps), "verdict": verdict]
        case .ticketCreated(let category): return ["category": category]
        case .appointmentBooked(let type): return ["type": type]
        case .pushOpened(let category): return ["category": category]
        case .loginStarted, .logout, .routerRebooted, .chatStarted, .appointmentCancelled: return [:]
        }
    }
}

public protocol AnalyticsTracking: Sendable {
    func track(_ event: AnalyticsEvent)
    func identify(userId: String?)
}

/// Fans events out to every registered provider (e.g. product analytics
/// plus the observability RUM agent) and honours the user's opt-out.
public final class AnalyticsService: AnalyticsTracking, @unchecked Sendable {
    private let providers: [AnalyticsTracking]
    private let lock = NSLock()
    private var isEnabled: Bool

    public init(providers: [AnalyticsTracking], enabled: Bool = true) {
        self.providers = providers
        self.isEnabled = enabled
    }

    public func setEnabled(_ enabled: Bool) {
        lock.lock(); isEnabled = enabled; lock.unlock()
        if !enabled { providers.forEach { $0.identify(userId: nil) } }
    }

    public var enabled: Bool {
        lock.lock(); defer { lock.unlock() }
        return isEnabled
    }

    public func track(_ event: AnalyticsEvent) {
        guard enabled else { return }
        providers.forEach { $0.track(event) }
    }

    public func identify(userId: String?) {
        guard enabled else { return }
        providers.forEach { $0.identify(userId: userId) }
    }
}

/// Development provider that writes events to the structured log.
public struct LogAnalyticsProvider: AnalyticsTracking {
    private let logger: AppLogger

    public init(logger: AppLogger = .shared) { self.logger = logger }

    public func track(_ event: AnalyticsEvent) {
        logger.debug("analytics.\(event.name)", event.properties)
    }

    public func identify(userId: String?) {
        logger.debug("analytics.identify", ["identified": String(userId != nil)])
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Support/AppLogger.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Support/AppLogger.swift`.

```swift
import Foundation
#if canImport(os)
import os
#endif

public enum LogLevel: Int, Comparable, Sendable {
    case debug = 0, info, warning, error

    public var label: String {
        switch self {
        case .debug: return "debug"
        case .info: return "info"
        case .warning: return "warning"
        case .error: return "error"
        }
    }

    public static func < (lhs: LogLevel, rhs: LogLevel) -> Bool { lhs.rawValue < rhs.rawValue }
}

/// Where formatted log lines go. The default sink writes to unified logging.
public protocol LogSink: Sendable {
    func write(level: LogLevel, line: String)
}

#if canImport(os)
public struct OSLogSink: LogSink {
    private let logger: os.Logger

    public init(subsystem: String = "com.gokinetic.consumer", category: String = "app") {
        logger = os.Logger(subsystem: subsystem, category: category)
    }

    public func write(level: LogLevel, line: String) {
        switch level {
        case .debug: logger.debug("\(line, privacy: .public)")
        case .info: logger.info("\(line, privacy: .public)")
        case .warning: logger.warning("\(line, privacy: .public)")
        case .error: logger.error("\(line, privacy: .public)")
        }
    }
}
#endif

/// Structured JSON logger. Each line is one JSON object with a fixed set of
/// keys plus event-specific fields. Values for keys that look sensitive are
/// redacted before formatting so tokens never reach device logs.
public final class AppLogger: @unchecked Sendable {
    public static let shared: AppLogger = {
        #if canImport(os)
        return AppLogger(sink: OSLogSink())
        #else
        return AppLogger(sink: nil)
        #endif
    }()

    private static let sensitiveKeys: Set<String> = [
        "authorization", "access_token", "refresh_token", "id_token", "token",
        "password", "passphrase", "code_verifier", "code", "email", "phone"
    ]

    private let sink: LogSink?
    private let lock = NSLock()
    private var minimumLevel: LogLevel
    private let now: @Sendable () -> Date

    public init(sink: LogSink?, minimumLevel: LogLevel = .info, now: @escaping @Sendable () -> Date = Date.init) {
        self.sink = sink
        self.minimumLevel = minimumLevel
        self.now = now
    }

    public func setMinimumLevel(_ level: LogLevel) {
        lock.lock(); defer { lock.unlock() }
        minimumLevel = level
    }

    public func debug(_ event: String, _ fields: [String: String] = [:]) { log(.debug, event, fields) }
    public func info(_ event: String, _ fields: [String: String] = [:]) { log(.info, event, fields) }
    public func warning(_ event: String, _ fields: [String: String] = [:]) { log(.warning, event, fields) }
    public func error(_ event: String, _ fields: [String: String] = [:]) { log(.error, event, fields) }

    public func log(_ level: LogLevel, _ event: String, _ fields: [String: String]) {
        lock.lock()
        let threshold = minimumLevel
        lock.unlock()
        guard level >= threshold, let sink else { return }
        sink.write(level: level, line: format(level: level, event: event, fields: fields))
    }

    public func format(level: LogLevel, event: String, fields: [String: String]) -> String {
        var payload: [String: String] = [:]
        for (key, value) in fields {
            payload[key] = AppLogger.sensitiveKeys.contains(key.lowercased()) ? "[REDACTED]" : value
        }
        payload["ts"] = ISO8601.string(from: now())
        payload["level"] = level.label
        payload["event"] = event
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
              let line = String(data: data, encoding: .utf8) else {
            return "{\"event\":\"\(event)\",\"level\":\"\(level.label)\"}"
        }
        return line
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Support/Formatters.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Support/Formatters.swift`.

```swift
import Foundation

/// Locale-aware money formatting from integer minor units via `Decimal`.
public struct MoneyFormatter: Sendable {
    public let locale: Locale

    public init(locale: Locale = .current) {
        self.locale = locale
    }

    private func makeFormatter(currency: String, fractionDigits: Int) -> NumberFormatter {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = locale
        formatter.currencyCode = currency
        formatter.minimumFractionDigits = fractionDigits
        formatter.maximumFractionDigits = fractionDigits
        formatter.generatesDecimalNumbers = true
        return formatter
    }

    /// "$45.10". Negative values (credits) render with a leading minus.
    public func string(from money: Money) -> String {
        let formatter = makeFormatter(currency: money.currency, fractionDigits: money.exponent)
        return formatter.string(from: money.decimalValue as NSDecimalNumber)
            ?? "\(money.currency) \(money.decimalValue)"
    }

    /// Drops ".00" for whole amounts: "$80/mo" style price tags.
    public func compactString(from money: Money) -> String {
        let divisor = Int64(pow(10, Double(money.exponent)))
        let isWhole = divisor == 0 || money.minorUnits % divisor == 0
        let formatter = makeFormatter(currency: money.currency, fractionDigits: isWhole ? 0 : money.exponent)
        return formatter.string(from: money.decimalValue as NSDecimalNumber)
            ?? string(from: money)
    }

    /// Balances shown on the dashboard: credits read "$12.00 credit".
    public func balanceString(from money: Money, creditSuffix: String) -> String {
        money.isNegative ? "\(string(from: money.absolute)) \(creditSuffix)" : string(from: money)
    }

    /// Plain decimal text suitable for pre-filling an amount field ("45.10").
    public func editableString(from money: Money) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = locale
        formatter.usesGroupingSeparator = false
        formatter.minimumFractionDigits = money.exponent
        formatter.maximumFractionDigits = money.exponent
        return formatter.string(from: money.decimalValue as NSDecimalNumber) ?? "\(money.decimalValue)"
    }
}

/// Byte counts in decimal units ("12.4 GB"), matching ISP billing.
public enum DataSizeFormatter {
    private static let units = ["B", "KB", "MB", "GB", "TB", "PB"]

    public static func string(fromBytes bytes: Int64, fractionDigits: Int = 1) -> String {
        guard bytes > 0 else { return "0 B" }
        var value = Double(bytes)
        var unitIndex = 0
        while value >= 1000, unitIndex < units.count - 1 {
            value /= 1000
            unitIndex += 1
        }
        if unitIndex == 0 { return "\(bytes) B" }
        let rounded = (value * pow(10, Double(fractionDigits))).rounded() / pow(10, Double(fractionDigits))
        let digits = rounded == rounded.rounded() ? 0 : fractionDigits
        return String(format: "%.\(digits)f %@", rounded, units[unitIndex])
    }

    public static func gigabytes(fromBytes bytes: Int64) -> Double {
        Double(bytes) / 1_000_000_000
    }
}

public enum SpeedFormatter {
    /// "943 Mbps" or "1.2 Gbps" for a measured throughput.
    public static func string(mbps: Double) -> String {
        guard mbps.isFinite, mbps >= 0 else { return "—" }
        if mbps >= 1000 {
            return String(format: "%.1f Gbps", mbps / 1000)
        }
        if mbps >= 100 { return String(format: "%.0f Mbps", mbps) }
        return String(format: "%.1f Mbps", mbps)
    }

    public static func latency(ms: Double) -> String {
        guard ms.isFinite, ms >= 0 else { return "—" }
        return String(format: "%.0f ms", ms)
    }
}

public enum DurationFormatter {
    /// "3d 4h", "5h 12m", "42m" for router uptime and ETAs.
    public static func compact(seconds: Int) -> String {
        let s = max(0, seconds)
        let days = s / 86_400
        let hours = (s % 86_400) / 3_600
        let minutes = (s % 3_600) / 60
        if days > 0 { return hours > 0 ? "\(days)d \(hours)h" : "\(days)d" }
        if hours > 0 { return minutes > 0 ? "\(hours)h \(minutes)m" : "\(hours)h" }
        return "\(max(minutes, s > 0 ? 1 : 0))m"
    }
}

/// Date presentation helpers. All wire dates are UTC; display converts to
/// the user's time zone.
public struct DisplayDateFormatter: Sendable {
    public let locale: Locale
    public let timeZone: TimeZone

    public init(locale: Locale = .current, timeZone: TimeZone = .current) {
        self.locale = locale
        self.timeZone = timeZone
    }

    private func formatter(_ template: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter
    }

    public func shortDate(_ date: Date) -> String { formatter("MMMd").string(from: date) }
    public func longDate(_ date: Date) -> String { formatter("yMMMMd").string(from: date) }
    public func time(_ date: Date) -> String { formatter("jmm").string(from: date) }
    public func monthYear(_ date: Date) -> String { formatter("yMMMM").string(from: date) }

    /// "Mar 3 – Apr 2" billing period label.
    public func period(from start: Date, to end: Date) -> String {
        "\(shortDate(start)) – \(shortDate(end))"
    }

    /// "Tue, Mar 4 · 8:00 AM – 12:00 PM" appointment window.
    public func slotWindow(_ slot: TimeSlot) -> String {
        let day = formatter("EEEMMMd").string(from: slot.start)
        return "\(day) · \(time(slot.start)) – \(time(slot.end))"
    }

    public func relative(_ date: Date, to reference: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: reference)
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Support/TTLCache.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Support/TTLCache.swift`.

```swift
import Foundation

/// Injectable clock so cache expiry and time-based rules are testable.
public protocol Clock: Sendable {
    func now() -> Date
}

public struct SystemClock: Clock {
    public init() {}
    public func now() -> Date { Date() }
}

/// In-memory cache with per-entry time-to-live and in-flight request
/// coalescing: concurrent `value(for:loader:)` calls for the same key share
/// a single network load instead of fanning out.
public actor TTLCache<Key: Hashable & Sendable, Value: Sendable> {
    private struct Entry {
        let value: Value
        let storedAt: Date
    }

    private var entries: [Key: Entry] = [:]
    private var inFlight: [Key: Task<Value, Error>] = [:]
    private var accessOrder: [Key] = []
    private let ttl: TimeInterval
    private let maxEntries: Int
    private let clock: Clock

    public init(ttl: TimeInterval, maxEntries: Int = 64, clock: Clock = SystemClock()) {
        self.ttl = ttl
        self.maxEntries = max(1, maxEntries)
        self.clock = clock
    }

    /// Returns the cached value if still fresh.
    public func cachedValue(for key: Key) -> Value? {
        guard let entry = entries[key] else { return nil }
        guard clock.now().timeIntervalSince(entry.storedAt) < ttl else {
            entries[key] = nil
            accessOrder.removeAll { $0 == key }
            return nil
        }
        touch(key)
        return entry.value
    }

    /// Returns the cached value even if expired — for offline fallback.
    public func staleValue(for key: Key) -> Value? {
        entries[key]?.value
    }

    public func store(_ value: Value, for key: Key) {
        entries[key] = Entry(value: value, storedAt: clock.now())
        touch(key)
        evictIfNeeded()
    }

    public func invalidate(_ key: Key) {
        entries[key] = nil
        inFlight[key]?.cancel()
        inFlight[key] = nil
        accessOrder.removeAll { $0 == key }
    }

    public func invalidateAll() {
        entries.removeAll()
        inFlight.values.forEach { $0.cancel() }
        inFlight.removeAll()
        accessOrder.removeAll()
    }

    /// Fresh cached value, or the result of `loader` (coalesced per key).
    /// When `forceRefresh` is set the cache is bypassed but concurrent
    /// loads are still shared.
    public func value(for key: Key, forceRefresh: Bool = false, loader: @escaping @Sendable () async throws -> Value) async throws -> Value {
        if !forceRefresh, let cached = cachedValue(for: key) {
            return cached
        }
        if let pending = inFlight[key] {
            return try await pending.value
        }
        let task = Task { try await loader() }
        inFlight[key] = task
        do {
            let value = try await task.value
            inFlight[key] = nil
            store(value, for: key)
            return value
        } catch {
            inFlight[key] = nil
            throw error
        }
    }

    public var count: Int { entries.count }

    private func touch(_ key: Key) {
        accessOrder.removeAll { $0 == key }
        accessOrder.append(key)
    }

    private func evictIfNeeded() {
        while entries.count > maxEntries, let oldest = accessOrder.first {
            accessOrder.removeFirst()
            entries[oldest] = nil
        }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Support/Validators.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Support/Validators.swift`.

```swift
import Foundation

/// A single failed rule, expressed as a localization key so view models can
/// show messages without hard-coding copy.
public struct ValidationIssue: Equatable, Hashable, Sendable {
    public let field: String
    public let messageKey: String

    public init(field: String, messageKey: String) {
        self.field = field
        self.messageKey = messageKey
    }
}

public struct ValidationResult: Equatable, Sendable {
    public let issues: [ValidationIssue]

    public init(_ issues: [ValidationIssue] = []) { self.issues = issues }

    public var isValid: Bool { issues.isEmpty }

    public func message(for field: String) -> String? {
        issues.first { $0.field == field }?.messageKey
    }

    public static let valid = ValidationResult()
}

/// Rules for changing the home Wi-Fi network name and passphrase. Mirrors
/// IEEE 802.11 limits plus the router firmware's character restrictions.
public enum WiFiCredentialsValidator {
    public static let ssidMaxBytes = 32
    public static let passphraseMinLength = 8
    public static let passphraseMaxLength = 63
    /// Characters the router firmware rejects in SSIDs.
    private static let forbiddenSSIDCharacters: Set<Character> = ["\"", "\\", "$", "`", "?", "["]

    public static func validate(ssid: String, passphrase: String?, confirmation: String?) -> ValidationResult {
        var issues: [ValidationIssue] = []
        issues.append(contentsOf: validateSSID(ssid))
        if let passphrase {
            issues.append(contentsOf: validatePassphrase(passphrase, ssid: ssid))
            if passphrase != confirmation {
                issues.append(ValidationIssue(field: "confirmation", messageKey: "wifi.validation.mismatch"))
            }
        }
        return ValidationResult(issues)
    }

    public static func validateSSID(_ ssid: String) -> [ValidationIssue] {
        let trimmed = ssid.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty {
            return [ValidationIssue(field: "ssid", messageKey: "wifi.validation.ssidRequired")]
        }
        if trimmed != ssid {
            return [ValidationIssue(field: "ssid", messageKey: "wifi.validation.ssidWhitespace")]
        }
        if ssid.utf8.count > ssidMaxBytes {
            return [ValidationIssue(field: "ssid", messageKey: "wifi.validation.ssidTooLong")]
        }
        if ssid.contains(where: { forbiddenSSIDCharacters.contains($0) || $0.isNewline }) {
            return [ValidationIssue(field: "ssid", messageKey: "wifi.validation.ssidCharacters")]
        }
        return []
    }

    public static func validatePassphrase(_ passphrase: String, ssid: String) -> [ValidationIssue] {
        if passphrase.count < passphraseMinLength {
            return [ValidationIssue(field: "passphrase", messageKey: "wifi.validation.passTooShort")]
        }
        if passphrase.count > passphraseMaxLength {
            return [ValidationIssue(field: "passphrase", messageKey: "wifi.validation.passTooLong")]
        }
        guard passphrase.unicodeScalars.allSatisfy({ $0.isASCII && $0.value >= 32 && $0.value < 127 }) else {
            return [ValidationIssue(field: "passphrase", messageKey: "wifi.validation.passCharacters")]
        }
        if passphrase.lowercased() == ssid.lowercased() {
            return [ValidationIssue(field: "passphrase", messageKey: "wifi.validation.passEqualsSSID")]
        }
        if passphraseStrength(passphrase) == .weak {
            return [ValidationIssue(field: "passphrase", messageKey: "wifi.validation.passWeak")]
        }
        return []
    }

    public enum Strength: Int, Comparable, Sendable {
        case weak = 0, fair, strong

        public static func < (lhs: Strength, rhs: Strength) -> Bool { lhs.rawValue < rhs.rawValue }
    }

    /// Scores character-class diversity and length; repeated single
    /// characters ("aaaaaaaa") are always weak.
    public static func passphraseStrength(_ passphrase: String) -> Strength {
        guard Set(passphrase).count > 2 else { return .weak }
        var classes = 0
        if passphrase.contains(where: \.isLowercase) { classes += 1 }
        if passphrase.contains(where: \.isUppercase) { classes += 1 }
        if passphrase.contains(where: \.isNumber) { classes += 1 }
        if passphrase.contains(where: { !$0.isLetter && !$0.isNumber }) { classes += 1 }
        switch (passphrase.count, classes) {
        case (16..., 2...), (12..., 3...): return .strong
        case (10..., 2...), (_, 3...): return .fair
        default: return .weak
        }
    }
}

public enum TicketValidator {
    public static let subjectRange = 5...120
    public static let descriptionRange = 20...4000

    public static func validate(subject: String, description: String) -> ValidationResult {
        var issues: [ValidationIssue] = []
        let s = subject.trimmingCharacters(in: .whitespacesAndNewlines)
        let d = description.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty {
            issues.append(ValidationIssue(field: "subject", messageKey: "ticket.validation.subjectRequired"))
        } else if !subjectRange.contains(s.count) {
            issues.append(ValidationIssue(field: "subject", messageKey: "ticket.validation.subjectLength"))
        }
        if d.isEmpty {
            issues.append(ValidationIssue(field: "description", messageKey: "ticket.validation.descriptionRequired"))
        } else if !descriptionRange.contains(d.count) {
            issues.append(ValidationIssue(field: "description", messageKey: "ticket.validation.descriptionLength"))
        }
        return ValidationResult(issues)
    }

    public static func validateComment(_ body: String) -> ValidationResult {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return ValidationResult([ValidationIssue(field: "comment", messageKey: "ticket.validation.commentRequired")])
        }
        if trimmed.count > descriptionRange.upperBound {
            return ValidationResult([ValidationIssue(field: "comment", messageKey: "ticket.validation.commentLength")])
        }
        return .valid
    }
}

public enum PaymentAmountValidator {
    /// Smallest one-off payment accepted (1.00 in major units).
    public static let minimumMinorUnits: Int64 = 100

    /// Validates a customer-entered amount against the outstanding balance.
    /// Overpayment up to the balance plus one month's charge is allowed and
    /// sits on the account as credit.
    public static func validate(amount: Money?, balance: Money, maxOverpayment: Money? = nil) -> ValidationResult {
        guard let amount else {
            return ValidationResult([ValidationIssue(field: "amount", messageKey: "payment.validation.amountInvalid")])
        }
        guard amount.currency == balance.currency else {
            return ValidationResult([ValidationIssue(field: "amount", messageKey: "payment.validation.currency")])
        }
        if amount.minorUnits < minimumMinorUnits {
            return ValidationResult([ValidationIssue(field: "amount", messageKey: "payment.validation.belowMinimum")])
        }
        let ceiling = balance.minorUnits + (maxOverpayment?.minorUnits ?? 0)
        if balance.isPositive, amount.minorUnits > ceiling {
            return ValidationResult([ValidationIssue(field: "amount", messageKey: "payment.validation.aboveBalance")])
        }
        return .valid
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/App/AppRoute.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/App/AppRoute.swift`.

```swift
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
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/App/AppViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/App/AppViewModel.swift`.

```swift
import Foundation
import GoKineticCore

/// Root coordinator: mirrors the auth state, owns tab selection and
/// routes deep links / push notifications once the user is signed in.
@MainActor
public final class AppViewModel: ObservableObject {
    public enum Phase: Equatable {
        case launching
        case signedOut
        case locked
        case signedIn(SessionUser)
    }

    @Published public private(set) var phase: Phase = .launching
    @Published public var selectedTab: AppTab = .home
    /// Destination the active tab should push once it appears.
    @Published public var activeLink: DeepLink?

    private let container: DependencyContainer
    /// Link received while signed out/locked, replayed after unlock.
    private(set) var pendingLink: DeepLink?
    private var observeTask: Task<Void, Never>?

    public init(container: DependencyContainer) {
        self.container = container
    }

    deinit {
        observeTask?.cancel()
    }

    public var dependencies: DependencyContainer { container }

    public func start() {
        guard observeTask == nil else { return }
        let session = container.authSession
        observeTask = Task { [weak self] in
            await session.restore()
            for await state in await session.stateUpdates() {
                await self?.apply(state)
            }
        }
    }

    func apply(_ state: AuthState) async {
        let previous = phase
        switch state {
        case .unknown:
            phase = .launching
        case .signedOut:
            phase = .signedOut
            selectedTab = .home
            activeLink = nil
            if case .signedIn = previous {
                await container.resetForSignOut()
            }
        case .locked:
            phase = .locked
        case .signedIn(let user):
            phase = .signedIn(user)
            container.analytics.identify(userId: user.subject)
            if let link = pendingLink {
                pendingLink = nil
                route(to: link)
            }
        }
    }

    // MARK: Deep links

    public func handle(url: URL) {
        guard let link = DeepLink(url: url) else {
            container.logger.warning("deeplink.unrecognised", ["scheme": url.scheme ?? ""])
            return
        }
        open(link)
    }

    public func open(_ link: DeepLink) {
        guard case .signedIn = phase else {
            pendingLink = link
            return
        }
        route(to: link)
    }

    private func route(to link: DeepLink) {
        selectedTab = link.tab
        activeLink = link == .dashboard ? nil : link
    }

    /// Called by the tab once it has pushed the destination.
    public func consumeActiveLink() {
        activeLink = nil
    }

    // MARK: Push notifications

    public func handleNotificationResponse(userInfo: [AnyHashable: Any]) {
        guard let push = PushNotification(userInfo: userInfo) else { return }
        container.analytics.track(.pushOpened(category: push.category.rawValue))
        open(push.link)
    }

    public func registerPushToken(_ deviceToken: Data, appVersion: String) async {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        guard case .signedIn = phase, container.preferences.lastPushToken != token else { return }
        do {
            try await container.notifications.register(
                DeviceRegistration(token: token, appVersion: appVersion, locale: Locale.current.identifier)
            )
            container.preferences.lastPushToken = token
        } catch {
            container.logger.warning("push.register_failed", ["error": String(describing: error)])
        }
    }

    // MARK: Lifecycle

    public func sceneDidEnterBackground() {
        Task { await container.authSession.appDidEnterBackground() }
    }

    public func sceneWillEnterForeground() {
        Task { await container.authSession.appWillEnterForeground() }
    }

    public func signOut() async {
        if let token = container.preferences.lastPushToken {
            try? await container.notifications.unregister(token: token)
            container.preferences.lastPushToken = nil
        }
        container.analytics.track(.logout)
        await container.authSession.signOut()
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/App/RootView.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/App/RootView.swift`.

```swift
import SwiftUI
import GoKineticCore
import GoKineticUI

/// Builds every screen's view model from the composition root so views
/// never reach into the container themselves.
@MainActor
public struct FeatureFactory {
    public let container: DependencyContainer
    public let serviceId: String
    public let appVersion: String
    public let signOut: () async -> Void

    public init(container: DependencyContainer, serviceId: String, appVersion: String, signOut: @escaping () async -> Void) {
        self.container = container
        self.serviceId = serviceId
        self.appVersion = appVersion
        self.signOut = signOut
    }

    @ViewBuilder
    public func destination(for route: AppRoute) -> some View {
        let c = container
        switch route {
        case .link(.dashboard), .link(.bills):
            BillingView(viewModel: BillingViewModel(accounts: c.accounts, billing: c.billing, analytics: c.analytics, clock: c.clock))
        case .link(.invoice(let id)):
            InvoiceDetailView(viewModel: InvoiceDetailViewModel(invoiceId: id, billing: c.billing, clock: c.clock))
        case .link(.payBill(let invoiceId)):
            PayBillView(viewModel: PayBillViewModel(invoiceId: invoiceId, accounts: c.accounts, billing: c.billing,
                                                    analytics: c.analytics, clock: c.clock))
        case .link(.plan), .link(.upgrade):
            planView
        case .link(.usage):
            UsageView(viewModel: UsageViewModel(serviceId: serviceId, usage: c.usage, preferences: c.preferences, clock: c.clock))
        case .link(.wifi), .link(.devices):
            wifiView
        case .link(.speedTest):
            SpeedTestView(viewModel: SpeedTestViewModel(speedTest: c.speedTest, plan: nil, analytics: c.analytics))
        case .link(.outages):
            OutagesView(viewModel: OutagesViewModel(serviceId: serviceId, outages: c.outages, router: c.router, clock: c.clock))
        case .link(.tickets):
            supportView
        case .link(.ticket(let id)):
            TicketDetailView(viewModel: TicketDetailViewModel(ticketId: id, support: c.support, analytics: c.analytics, clock: c.clock))
        case .link(.appointments), .link(.appointment):
            AppointmentsView(viewModel: AppointmentsViewModel(appointments: c.appointments, analytics: c.analytics, clock: c.clock,
                                                              supportPhone: c.environment.supportPhone))
        case .link(.settings):
            SettingsView(viewModel: SettingsViewModel(
                notifications: c.notifications, biometricUnlock: c.authSession, biometrics: biometrics,
                analytics: c.analytics, preferences: c.preferences, appVersion: appVersion, signOut: signOut))
        case .bookAppointment(let type, let ticketId):
            AppointmentBookingView(viewModel: AppointmentBookingViewModel(
                mode: .book(ticketId: ticketId), type: type, appointments: c.appointments, analytics: c.analytics, clock: c.clock))
        case .rescheduleAppointment(let appointment):
            AppointmentBookingView(viewModel: AppointmentBookingViewModel(
                mode: .reschedule(appointment), type: nil, appointments: c.appointments, analytics: c.analytics, clock: c.clock))
        case .editWiFi(let routerId, let network):
            WiFiSettingsView(viewModel: WiFiSettingsViewModel(routerId: routerId, network: network, router: c.router, analytics: c.analytics))
        case .troubleshoot:
            TroubleshootView(viewModel: TroubleshootViewModel(serviceId: serviceId, outages: c.outages, router: c.router, clock: c.clock),
                             makeTicketForm: { draft in
                                 NewTicketViewModel(serviceId: serviceId, support: c.support, analytics: c.analytics, prefill: draft)
                             })
        case .profile:
            ProfileView(viewModel: ProfileViewModel(accounts: c.accounts))
        }
    }

    /// Biometric availability is a device property; the session owns the flag.
    private var biometrics: BiometricAuthenticating {
        #if canImport(LocalAuthentication)
        return LocalBiometricAuthenticator()
        #else
        return UnavailableBiometrics()
        #endif
    }

    var planView: some View {
        let c = container, serviceId = self.serviceId
        return PlanView(viewModel: PlanViewModel(serviceId: serviceId, plans: c.plans, clock: c.clock)) { current, options in
            UpgradeFlowViewModel(serviceId: serviceId, currentPlan: current.plan, options: options, plans: c.plans,
                                 analytics: c.analytics, clock: c.clock)
        }
    }

    var wifiView: some View {
        WiFiView(viewModel: WiFiViewModel(serviceId: serviceId, router: container.router, analytics: container.analytics, clock: container.clock))
    }

    var supportView: some View {
        let c = container, serviceId = self.serviceId
        return TicketsView(viewModel: TicketsViewModel(support: c.support)) { onCreated in
            NewTicketViewModel(serviceId: serviceId, support: c.support, analytics: c.analytics, onCreated: onCreated)
        }
    }
}

private struct UnavailableBiometrics: BiometricAuthenticating {
    func availableBiometry() -> BiometryKind { .none }
    func authenticate(reason: String) async throws -> Bool { false }
}

/// Signed-in shell: one navigation stack per tab, all sharing the
/// `AppRoute` destination table, with deep links pushed onto the active tab.
public struct MainTabView: View {
    @ObservedObject private var app: AppViewModel
    private let factory: FeatureFactory
    @State private var paths: [AppTab: NavigationPath] = [:]

    public init(app: AppViewModel, factory: FeatureFactory) {
        self.app = app
        self.factory = factory
    }

    public var body: some View {
        TabView(selection: $app.selectedTab) {
            tab(.home, L10n.Tabs.home, "house") {
                DashboardView(viewModel: DashboardViewModel(
                    accounts: factory.container.accounts, router: factory.container.router, outages: factory.container.outages,
                    appointments: factory.container.appointments, clock: factory.container.clock)) { link in app.open(link) }
            }
            tab(.billing, L10n.Tabs.billing, "creditcard") { factory.destination(for: .link(.bills)) }
            tab(.plan, L10n.Tabs.plan, "speedometer") { factory.planView }
            tab(.wifi, L10n.Tabs.wifi, "wifi") { factory.wifiView }
            tab(.support, L10n.Tabs.support, "questionmark.bubble") { factory.supportView }
        }
        .onChange(of: app.activeLink) { link in
            guard let link else { return }
            if Self.rootLinks.contains(link) == false {
                paths[link.tab, default: NavigationPath()].append(link.route)
            }
            app.consumeActiveLink()
        }
    }

    /// Links that are a tab's root screen select the tab without pushing.
    private static let rootLinks: Set<DeepLink> = [.dashboard, .bills, .plan, .wifi, .tickets]

    private func tab<Content: View>(_ tab: AppTab, _ title: String, _ symbol: String,
                                    @ViewBuilder root: () -> Content) -> some View {
        NavigationStack(path: Binding(get: { paths[tab] ?? NavigationPath() }, set: { paths[tab] = $0 })) {
            root().navigationDestination(for: AppRoute.self) { factory.destination(for: $0) }
        }
        .tabItem { Label(title, systemImage: symbol) }
        .tag(tab)
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/App/WebAuthenticator.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/App/WebAuthenticator.swift`.

```swift
#if canImport(AuthenticationServices) && os(iOS)
import AuthenticationServices
import UIKit
import GoKineticCore

/// Presents the hosted login in `ASWebAuthenticationSession`, which shares
/// Safari's cookie jar for SSO and keeps credentials out of the app.
@MainActor
public final class SystemWebAuthenticator: NSObject, WebAuthenticating, ASWebAuthenticationPresentationContextProviding {
    private var activeSession: ASWebAuthenticationSession?

    public override init() {}

    nonisolated public func authenticate(url: URL, callbackScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            Task { @MainActor in
                let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { [weak self] callback, error in
                    self?.activeSession = nil
                    if let callback {
                        continuation.resume(returning: callback)
                    } else if let authError = error as? ASWebAuthenticationSessionError, authError.code == .canceledLogin {
                        continuation.resume(throwing: AuthError.userCancelled)
                    } else {
                        continuation.resume(throwing: AuthError.invalidCallback)
                    }
                }
                session.presentationContextProvider = self
                // Ephemeral sessions would defeat SSO with the web portals.
                session.prefersEphemeralWebBrowserSession = false
                self.activeSession = session
                if !session.start() {
                    self.activeSession = nil
                    continuation.resume(throwing: AuthError.configuration)
                }
            }
        }
    }

    nonisolated public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
        }
    }
}
#endif
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Appointments/AppointmentBookingViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Appointments/AppointmentBookingViewModel.swift`.

```swift
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
```
