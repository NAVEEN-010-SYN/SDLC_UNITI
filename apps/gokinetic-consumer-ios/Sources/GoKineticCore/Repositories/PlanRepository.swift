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

    /// Plans offered at the service address, sorted slowest -> fastest so the
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
