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
