import Foundation
import GoKineticCore

/// Thread-safe scripted responses for one mocked method. Queued results
/// are consumed in order; the last one repeats so a test only scripts what
/// it cares about.
public final class Stub<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var results: [Result<Value, Error>]
    public private(set) var callCount = 0

    public init(_ results: [Result<Value, Error>] = []) {
        self.results = results
    }

    public func returns(_ values: Value...) {
        lock.lock(); defer { lock.unlock() }
        results = values.map { .success($0) }
    }

    public func fails(_ error: Error) {
        lock.lock(); defer { lock.unlock() }
        results = [.failure(error)]
    }

    public func enqueue(_ result: Result<Value, Error>) {
        lock.lock(); defer { lock.unlock() }
        results.append(result)
    }

    public func next() throws -> Value {
        lock.lock()
        callCount += 1
        guard let first = results.first else {
            lock.unlock()
            throw StubError.notConfigured(String(describing: Value.self))
        }
        if results.count > 1 { results.removeFirst() }
        lock.unlock()
        return try first.get()
    }
}

public enum StubError: Error, Equatable {
    case notConfigured(String)
}

/// Records arguments passed to a mocked method.
public final class Recorder<Argument>: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [Argument] = []

    public init() {}

    public func record(_ argument: Argument) {
        lock.lock(); storage.append(argument); lock.unlock()
    }

    public var calls: [Argument] {
        lock.lock(); defer { lock.unlock() }
        return storage
    }

    public var last: Argument? { calls.last }
}

public final class FixedClock: Clock, @unchecked Sendable {
    private let lock = NSLock()
    private var current: Date

    public init(_ date: Date = Fixtures.date("2025-03-10T12:00:00Z")) {
        self.current = date
    }

    public func now() -> Date {
        lock.lock(); defer { lock.unlock() }
        return current
    }

    public func advance(by interval: TimeInterval) {
        lock.lock(); current = current.addingTimeInterval(interval); lock.unlock()
    }
}

/// Never actually waits; records requested delays.
public final class ImmediateSleeper: Sleeper, @unchecked Sendable {
    public let delays = Recorder<TimeInterval>()
    public init() {}
    public func sleep(seconds: TimeInterval) async throws {
        delays.record(seconds)
        try Task.checkCancellation()
    }
}

public final class RecordingAnalytics: AnalyticsTracking, @unchecked Sendable {
    public let events = Recorder<AnalyticsEvent>()
    public init() {}
    public func track(_ event: AnalyticsEvent) { events.record(event) }
    public func identify(userId: String?) {}
}
