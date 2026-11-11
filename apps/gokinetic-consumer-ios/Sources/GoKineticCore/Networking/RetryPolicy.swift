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
