import Foundation
#if canImport(os)
import os
#endif

public enum LogLevel: Int, Comparable, Sendable {
    case debug = 0, info, warning, error

    public var label: String {
        switch self {
        case .debug: return "debug"
        case .info: return "info"
        case .warning: return "warning"
        case .error: return "error"
        }
    }

    public static func < (lhs: LogLevel, rhs: LogLevel) -> Bool { lhs.rawValue < rhs.rawValue }
}

/// Where formatted log lines go. The default sink writes to unified logging.
public protocol LogSink: Sendable {
    func write(level: LogLevel, line: String)
}

#if canImport(os)
public struct OSLogSink: LogSink {
    private let logger: os.Logger

    public init(subsystem: String = "com.gokinetic.consumer", category: String = "app") {
        logger = os.Logger(subsystem: subsystem, category: category)
    }

    public func write(level: LogLevel, line: String) {
        switch level {
        case .debug: logger.debug("\(line, privacy: .public)")
        case .info: logger.info("\(line, privacy: .public)")
        case .warning: logger.warning("\(line, privacy: .public)")
        case .error: logger.error("\(line, privacy: .public)")
        }
    }
}
#endif

/// Structured JSON logger. Each line is one JSON object with a fixed set of
/// keys plus event-specific fields. Values for keys that look sensitive are
/// redacted before formatting so tokens never reach device logs.
public final class AppLogger: @unchecked Sendable {
    public static let shared: AppLogger = {
        #if canImport(os)
        return AppLogger(sink: OSLogSink())
        #else
        return AppLogger(sink: nil)
        #endif
    }()

    private static let sensitiveKeys: Set<String> = [
        "authorization", "access_token", "refresh_token", "id_token", "token",
        "password", "passphrase", "code_verifier", "code", "email", "phone"
    ]

    private let sink: LogSink?
    private let lock = NSLock()
    private var minimumLevel: LogLevel
    private let now: @Sendable () -> Date

    public init(sink: LogSink?, minimumLevel: LogLevel = .info, now: @escaping @Sendable () -> Date = Date.init) {
        self.sink = sink
        self.minimumLevel = minimumLevel
        self.now = now
    }

    public func setMinimumLevel(_ level: LogLevel) {
        lock.lock(); defer { lock.unlock() }
        minimumLevel = level
    }

    public func debug(_ event: String, _ fields: [String: String] = [:]) { log(.debug, event, fields) }
    public func info(_ event: String, _ fields: [String: String] = [:]) { log(.info, event, fields) }
    public func warning(_ event: String, _ fields: [String: String] = [:]) { log(.warning, event, fields) }
    public func error(_ event: String, _ fields: [String: String] = [:]) { log(.error, event, fields) }

    public func log(_ level: LogLevel, _ event: String, _ fields: [String: String]) {
        lock.lock()
        let threshold = minimumLevel
        lock.unlock()
        guard level >= threshold, let sink else { return }
        sink.write(level: level, line: format(level: level, event: event, fields: fields))
    }

    public func format(level: LogLevel, event: String, fields: [String: String]) -> String {
        var payload: [String: String] = [:]
        for (key, value) in fields {
            payload[key] = AppLogger.sensitiveKeys.contains(key.lowercased()) ? "[REDACTED]" : value
        }
        payload["ts"] = ISO8601.string(from: now())
        payload["level"] = level.label
        payload["event"] = event
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
              let line = String(data: data, encoding: .utf8) else {
            return "{\"event\":\"\(event)\",\"level\":\"\(level.label)\"}"
        }
        return line
    }
}
