import Foundation

/// Advice produced by the Wi-Fi troubleshooting flow, most useful first.
public enum Recommendation: Equatable, Hashable, Sendable {
    case waitForOutage(estimatedResolution: Date?)
    case checkPowerAndCables
    case restartRouter
    case moveCloser(deviceNames: [String])
    case switchTo5GHz(deviceNames: [String])
    case reduceActiveDevices(count: Int)
    case testOverEthernet
    case contactSupport

    public var messageKey: String {
        switch self {
        case .waitForOutage: return "troubleshoot.rec.waitForOutage"
        case .checkPowerAndCables: return "troubleshoot.rec.checkPower"
        case .restartRouter: return "troubleshoot.rec.restartRouter"
        case .moveCloser: return "troubleshoot.rec.moveCloser"
        case .switchTo5GHz: return "troubleshoot.rec.switch5GHz"
        case .reduceActiveDevices: return "troubleshoot.rec.reduceDevices"
        case .testOverEthernet: return "troubleshoot.rec.testWired"
        case .contactSupport: return "troubleshoot.rec.contactSupport"
        }
    }
}

/// Everything the troubleshooting flow learned. Turned into advice for the
/// customer and, on escalation, into a support ticket so the agent does not
/// have to ask the same questions again.
public struct DiagnosticReport: Equatable, Sendable {
    public static let busyDeviceThreshold = 25

    public let startedAt: Date
    public var outage: Outage?
    public var routerBefore: RouterStatus?
    public var rebootAttempted = false
    public var routerAfter: RouterStatus?
    public var devices: [ConnectedDevice] = []
    public var speedTest: SpeedTestResult?
    public var plan: Plan?

    public init(startedAt: Date) {
        self.startedAt = startedAt
    }

    public var currentRouter: RouterStatus? { routerAfter ?? routerBefore }

    public var routerUnreachable: Bool {
        currentRouter?.state == .offline
    }

    public func onlineWirelessDevices(at date: Date) -> [ConnectedDevice] {
        devices.filter { !$0.isWired && $0.isOnline(at: date) }
    }

    public func recommendations(at date: Date) -> [Recommendation] {
        if let outage, outage.isActive, outage.affectsMyService {
            return [.waitForOutage(estimatedResolution: outage.estimatedResolution)]
        }
        if routerUnreachable {
            return rebootAttempted ? [.checkPowerAndCables, .contactSupport] : [.checkPowerAndCables, .restartRouter]
        }

        var result: [Recommendation] = []
        let wireless = onlineWirelessDevices(at: date)
        let weak = wireless.filter { $0.signalQuality == .poor }.map(\.name).sorted()
        if !weak.isEmpty { result.append(.moveCloser(deviceNames: weak)) }

        let dualBandCapableOn24 = wireless
            .filter { $0.band == .ghz2_4 && ($0.signalQuality == .excellent || $0.signalQuality == .good) }
            .map(\.name).sorted()
        let routerHas5GHz = currentRouter?.networks.contains { $0.enabled && $0.bands.contains(.ghz5) } ?? false
        if routerHas5GHz && !dualBandCapableOn24.isEmpty { result.append(.switchTo5GHz(deviceNames: dualBandCapableOn24)) }

        if wireless.count >= Self.busyDeviceThreshold { result.append(.reduceActiveDevices(count: wireless.count)) }

        if let speedTest, let plan, speedTest.verdict(against: plan) == .belowExpected {
            if !rebootAttempted { result.append(.restartRouter) }
            result.append(.testOverEthernet)
        }
        if result.isEmpty && currentRouter?.state == .degraded && !rebootAttempted {
            result.append(.restartRouter)
        }
        return result
    }

    /// Ticket raised when the customer says the flow did not fix things.
    /// Total loss of service after a reboot is triaged one level higher.
    public func ticketRequest(serviceId: String?, customerNotes: String) -> NewTicketRequest {
        let priority: TicketPriority = routerUnreachable && rebootAttempted ? .p1 : TicketCategory.connectivity.suggestedPriority
        let subject = routerUnreachable ? "Router offline after troubleshooting" : "Wi-Fi problem not resolved by troubleshooting"
        return NewTicketRequest(subject: subject, description: summary(customerNotes: customerNotes),
                                category: .connectivity, priority: priority, serviceId: serviceId)
    }

    /// Agent-facing plain-text summary (not localized: read by support staff).
    public func summary(customerNotes: String) -> String {
        var lines: [String] = []
        let notes = customerNotes.trimmingCharacters(in: .whitespacesAndNewlines)
        if !notes.isEmpty { lines.append("Customer notes: \(notes)") }
        lines.append("Troubleshooting started: \(ISO8601.string(from: startedAt))")
        if let outage {
            lines.append("Known outage: \(outage.id) (\(outage.severity.rawValue), active: \(outage.isActive))")
        } else {
            lines.append("No outage affecting this service.")
        }
        if let before = routerBefore {
            lines.append("Router \(before.routerId) \(before.model) fw \(before.firmwareVersion): \(before.state.rawValue), uptime \(before.uptimeSeconds)s")
        }
        lines.append("Reboot attempted: \(rebootAttempted ? "yes" : "no")")
        if let after = routerAfter { lines.append("Router state after reboot: \(after.state.rawValue)") }
        if !devices.isEmpty {
            let poor = devices.filter { $0.signalQuality == .poor }.count
            lines.append("Devices: \(devices.count) known, \(poor) with poor signal")
        }
        if let test = speedTest {
            var line = String(format: "Speed test: %.0f/%.0f Mbps, %.0f ms latency", test.downloadMbps, test.uploadMbps, test.latencyMs)
            if let plan { line += " (plan \(plan.downloadMbps)/\(plan.uploadMbps) Mbps)" }
            lines.append(line)
        }
        return lines.joined(separator: "\n")
    }
}

/// Reboots a router and waits for it to come back, tolerating the errors
/// expected while it is unreachable.
public struct RouterRecoveryMonitor: Sendable {
    public enum RecoveryError: Error, Equatable {
        case didNotRecover(lastKnown: RouterState?)
    }

    private let router: RouterRepository
    private let sleeper: Sleeper
    public let initialDelay: TimeInterval
    public let pollInterval: TimeInterval
    public let maxPolls: Int

    public init(router: RouterRepository, sleeper: Sleeper, initialDelay: TimeInterval = 30, pollInterval: TimeInterval = 15, maxPolls: Int = 16) {
        self.router = router
        self.sleeper = sleeper
        self.initialDelay = initialDelay
        self.pollInterval = pollInterval
        self.maxPolls = max(1, maxPolls)
    }

    /// Issues the reboot, then polls until the router reports online or
    /// degraded. `onState` receives each observed state for progress UI.
    public func rebootAndWait(routerId: String, serviceId: String,
                              onState: @Sendable (RouterState) async -> Void = { _ in }) async throws -> RouterStatus {
        try await router.reboot(routerId: routerId)
        await onState(.rebooting)
        try await sleeper.sleep(seconds: initialDelay)

        var lastKnown: RouterState?
        for poll in 0..<maxPolls {
            try Task.checkCancellation()
            if let status = try? await router.status(serviceId: serviceId) {
                lastKnown = status.state
                await onState(status.state)
                if status.state == .online || status.state == .degraded { return status }
            }
            if poll < maxPolls - 1 { try await sleeper.sleep(seconds: pollInterval) }
        }
        throw RecoveryError.didNotRecover(lastKnown: lastKnown)
    }
}
