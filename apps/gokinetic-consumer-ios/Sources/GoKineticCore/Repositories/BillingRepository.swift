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
