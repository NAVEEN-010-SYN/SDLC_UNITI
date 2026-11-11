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
