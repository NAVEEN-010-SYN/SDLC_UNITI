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
