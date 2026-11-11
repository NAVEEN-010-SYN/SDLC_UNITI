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
