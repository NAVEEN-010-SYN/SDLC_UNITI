import Foundation

/// Typed analytics events. Keeping events as an enum prevents typos in
/// event names and keeps the property set reviewable for privacy.
public enum AnalyticsEvent: Equatable, Sendable {
    case screenViewed(String)
    case loginStarted
    case loginSucceeded(method: String)
    case loginFailed(reason: String)
    case logout
    case biometricUnlock(success: Bool)
    case planUpgradeStarted(fromPlanId: String)
    case planUpgradeQuoted(targetPlanId: String)
    case planUpgradeSubmitted(targetPlanId: String, timing: String)
    case paymentSubmitted(amountMinor: Int64, currency: String)
    case paymentFailed(code: String)
    case autopayToggled(enabled: Bool)
    case routerRebooted
    case wifiUpdated(changedPassphrase: Bool)
    case deviceBlocked(blocked: Bool)
    case speedTestCompleted(downloadMbps: Int, verdict: String)
    case ticketCreated(category: String)
    case chatStarted
    case appointmentBooked(type: String)
    case appointmentCancelled
    case pushOpened(category: String)

    public var name: String {
        switch self {
        case .screenViewed: return "screen_viewed"
        case .loginStarted: return "login_started"
        case .loginSucceeded: return "login_succeeded"
        case .loginFailed: return "login_failed"
        case .logout: return "logout"
        case .biometricUnlock: return "biometric_unlock"
        case .planUpgradeStarted: return "plan_upgrade_started"
        case .planUpgradeQuoted: return "plan_upgrade_quoted"
        case .planUpgradeSubmitted: return "plan_upgrade_submitted"
        case .paymentSubmitted: return "payment_submitted"
        case .paymentFailed: return "payment_failed"
        case .autopayToggled: return "autopay_toggled"
        case .routerRebooted: return "router_rebooted"
        case .wifiUpdated: return "wifi_updated"
        case .deviceBlocked: return "device_blocked"
        case .speedTestCompleted: return "speed_test_completed"
        case .ticketCreated: return "ticket_created"
        case .chatStarted: return "chat_started"
        case .appointmentBooked: return "appointment_booked"
        case .appointmentCancelled: return "appointment_cancelled"
        case .pushOpened: return "push_opened"
        }
    }

    public var properties: [String: String] {
        switch self {
        case .screenViewed(let screen): return ["screen": screen]
        case .loginSucceeded(let method): return ["method": method]
        case .loginFailed(let reason): return ["reason": reason]
        case .biometricUnlock(let success): return ["success": String(success)]
        case .planUpgradeStarted(let from): return ["from_plan": from]
        case .planUpgradeQuoted(let target): return ["target_plan": target]
        case .planUpgradeSubmitted(let target, let timing): return ["target_plan": target, "timing": timing]
        case .paymentSubmitted(let amount, let currency): return ["amount_minor": String(amount), "currency": currency]
        case .paymentFailed(let code): return ["code": code]
        case .autopayToggled(let enabled): return ["enabled": String(enabled)]
        case .wifiUpdated(let changed): return ["changed_passphrase": String(changed)]
        case .deviceBlocked(let blocked): return ["blocked": String(blocked)]
        case .speedTestCompleted(let mbps, let verdict): return ["download_mbps": String(mbps), "verdict": verdict]
        case .ticketCreated(let category): return ["category": category]
        case .appointmentBooked(let type): return ["type": type]
        case .pushOpened(let category): return ["category": category]
        case .loginStarted, .logout, .routerRebooted, .chatStarted, .appointmentCancelled: return [:]
        }
    }
}

public protocol AnalyticsTracking: Sendable {
    func track(_ event: AnalyticsEvent)
    func identify(userId: String?)
}

/// Fans events out to every registered provider (e.g. product analytics
/// plus the observability RUM agent) and honours the user's opt-out.
public final class AnalyticsService: AnalyticsTracking, @unchecked Sendable {
    private let providers: [AnalyticsTracking]
    private let lock = NSLock()
    private var isEnabled: Bool

    public init(providers: [AnalyticsTracking], enabled: Bool = true) {
        self.providers = providers
        self.isEnabled = enabled
    }

    public func setEnabled(_ enabled: Bool) {
        lock.lock(); isEnabled = enabled; lock.unlock()
        if !enabled { providers.forEach { $0.identify(userId: nil) } }
    }

    public var enabled: Bool {
        lock.lock(); defer { lock.unlock() }
        return isEnabled
    }

    public func track(_ event: AnalyticsEvent) {
        guard enabled else { return }
        providers.forEach { $0.track(event) }
    }

    public func identify(userId: String?) {
        guard enabled else { return }
        providers.forEach { $0.identify(userId: userId) }
    }
}

/// Development provider that writes events to the structured log.
public struct LogAnalyticsProvider: AnalyticsTracking {
    private let logger: AppLogger

    public init(logger: AppLogger = .shared) { self.logger = logger }

    public func track(_ event: AnalyticsEvent) {
        logger.debug("analytics.\(event.name)", event.properties)
    }

    public func identify(userId: String?) {
        logger.debug("analytics.identify", ["identified": String(userId != nil)])
    }
}
