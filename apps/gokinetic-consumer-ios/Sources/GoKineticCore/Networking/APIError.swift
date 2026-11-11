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
