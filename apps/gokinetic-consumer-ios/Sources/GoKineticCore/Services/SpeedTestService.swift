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
