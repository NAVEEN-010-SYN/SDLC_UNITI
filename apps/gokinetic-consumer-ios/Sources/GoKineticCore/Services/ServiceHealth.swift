import Foundation

public enum HealthIssue: Equatable, Hashable, Sendable {
    case routerOffline
    case routerDegraded
    case routerBusy(RouterState)
    case areaDegraded(outageId: String)
    case slowSpeed(measuredMbps: Int, planMbps: Int)

    public var messageKey: String {
        switch self {
        case .routerOffline: return "health.issue.routerOffline"
        case .routerDegraded: return "health.issue.routerDegraded"
        case .routerBusy(let state): return "health.issue.router.\(state.rawValue.lowercased())"
        case .areaDegraded: return "health.issue.areaDegraded"
        case .slowSpeed: return "health.issue.slowSpeed"
        }
    }
}

/// One-glance answer to "is my broadband OK?", combining network outages,
/// router telemetry and the customer's latest speed test.
public enum ServiceHealth: Equatable, Sendable {
    case operational
    /// Planned work affecting the customer, with nothing else wrong.
    case maintenance(Outage)
    case degraded([HealthIssue])
    case outage(Outage)
    case unknown

    public var headlineKey: String {
        switch self {
        case .operational: return "health.operational"
        case .maintenance: return "health.maintenance"
        case .degraded: return "health.degraded"
        case .outage: return "health.outage"
        case .unknown: return "health.unknown"
        }
    }

    /// Troubleshooting is pointless while a known outage explains the problem.
    public var suggestsTroubleshooting: Bool {
        switch self {
        case .degraded, .unknown: return true
        case .operational, .maintenance, .outage: return false
        }
    }
}

public enum ServiceHealthEvaluator {
    /// Speed tests older than this no longer describe the current line.
    public static let speedTestFreshness: TimeInterval = 24 * 3600

    public static func evaluate(outages: [Outage]?, router: RouterStatus?, latestSpeedTest: SpeedTestResult?,
                                plan: Plan?, now: Date) -> ServiceHealth {
        guard outages != nil || router != nil else { return .unknown }
        let affecting = (outages ?? []).filter { $0.isActive && $0.affectsMyService }

        if let major = affecting.filter({ $0.severity == .major }).max(by: { $0.startedAt < $1.startedAt }) {
            return .outage(major)
        }

        var issues: [HealthIssue] = affecting
            .filter { $0.severity == .degraded }
            .sorted { $0.startedAt < $1.startedAt }
            .map { .areaDegraded(outageId: $0.id) }

        if let router {
            switch router.state {
            case .offline: issues.append(.routerOffline)
            case .degraded: issues.append(.routerDegraded)
            case .rebooting, .updating: issues.append(.routerBusy(router.state))
            case .online: break
            }
        }

        if let test = latestSpeedTest, let plan, now.timeIntervalSince(test.measuredAt) <= speedTestFreshness,
           test.verdict(against: plan) == .belowExpected {
            issues.append(.slowSpeed(measuredMbps: Int(test.downloadMbps.rounded()), planMbps: plan.downloadMbps))
        }

        if !issues.isEmpty { return .degraded(issues) }
        if let planned = affecting.first(where: { $0.severity == .info }) { return .maintenance(planned) }
        return .operational
    }
}
