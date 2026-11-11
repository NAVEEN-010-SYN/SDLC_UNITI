import Foundation
import GoKineticCore
import GoKineticUI

/// Guided "my internet isn't working" flow: rule out a known outage, check
/// and optionally restart the router, inspect devices, then either advise
/// or escalate with a pre-filled ticket carrying everything learned.
@MainActor
public final class TroubleshootViewModel: ObservableObject {
    public enum Step: Equatable {
        case start
        case checking
        case knownOutage(Outage)
        case offerReboot(RouterStatus)
        case rebooting(RouterState)
        case advice([Recommendation])
        case resolved
        case failed(UserFacingError)
    }

    @Published public private(set) var step: Step = .start
    @Published public private(set) var report: DiagnosticReport

    public let serviceId: String
    private let outages: OutageRepository
    private let router: RouterRepository
    private let monitor: RouterRecoveryMonitor
    private let clock: Clock

    public init(serviceId: String, outages: OutageRepository, router: RouterRepository, clock: Clock,
                sleeper: Sleeper = TaskSleeper()) {
        self.serviceId = serviceId
        self.outages = outages
        self.router = router
        self.monitor = RouterRecoveryMonitor(router: router, sleeper: sleeper)
        self.clock = clock
        self.report = DiagnosticReport(startedAt: clock.now())
    }

    public func begin() async {
        guard step == .start || isFailed else { return }
        report = DiagnosticReport(startedAt: clock.now())
        step = .checking

        async let outageList = Result.capturing { try await outages.outages(serviceId: serviceId) }
        async let routerStatus = Result.capturing { try await router.status(serviceId: serviceId) }
        let (outageResult, routerResult) = await (outageList, routerStatus)

        report.outage = (try? outageResult.get())?.first { $0.isActive && $0.affectsMyService }
        if let outage = report.outage {
            step = .knownOutage(outage)
            return
        }
        switch routerResult {
        case .success(let status):
            report.routerBefore = status
            // An offline router can't be restarted remotely; the advice step
            // tells the customer to check power and cables instead.
            if status.state == .degraded {
                step = .offerReboot(status)
            } else {
                await collectDevicesAndAdvise(routerId: status.routerId)
            }
        case .failure(let error):
            step = .failed(UserFacingError(error))
        }
    }

    private var isFailed: Bool {
        if case .failed = step { return true }
        return false
    }

    /// Restarting is also offered for a healthy-looking router: it is the
    /// single most effective fix, but the customer decides.
    public func offerRebootAnyway() {
        guard case .advice = step, let status = report.currentRouter, status.canReboot, !report.rebootAttempted else { return }
        step = .offerReboot(status)
    }

    public func reboot() async {
        guard case .offerReboot(let status) = step else { return }
        step = .rebooting(.rebooting)
        report.rebootAttempted = true
        do {
            let recovered = try await monitor.rebootAndWait(routerId: status.routerId, serviceId: serviceId) { [weak self] state in
                await self?.showRebootProgress(state)
            }
            report.routerAfter = recovered
            await collectDevicesAndAdvise(routerId: recovered.routerId)
        } catch RouterRecoveryMonitor.RecoveryError.didNotRecover(let lastKnown) {
            report.routerAfter = report.routerBefore.map {
                RouterStatus(routerId: $0.routerId, model: $0.model, firmwareVersion: $0.firmwareVersion,
                             state: lastKnown ?? .offline, uptimeSeconds: 0, lastSeen: $0.lastSeen, networks: $0.networks)
            }
            step = .advice(report.recommendations(at: clock.now()))
        } catch {
            step = .failed(UserFacingError(error))
        }
    }

    private func showRebootProgress(_ state: RouterState) {
        if case .rebooting = step { step = .rebooting(state) }
    }

    public func skipReboot() async {
        guard case .offerReboot(let status) = step else { return }
        await collectDevicesAndAdvise(routerId: status.routerId)
    }

    private func collectDevicesAndAdvise(routerId: String) async {
        step = .checking
        report.devices = (try? await router.connectedDevices(routerId: routerId)) ?? []
        step = .advice(report.recommendations(at: clock.now()))
    }

    /// Attaches a speed test run elsewhere so advice can account for it.
    public func attach(speedTest: SpeedTestResult, plan: Plan?) {
        report.speedTest = speedTest
        report.plan = plan
        if case .advice = step { step = .advice(report.recommendations(at: clock.now())) }
    }

    public func markResolved() {
        step = .resolved
    }

    public func ticketDraft(customerNotes: String = "") -> NewTicketRequest {
        report.ticketRequest(serviceId: serviceId, customerNotes: customerNotes)
    }

    public func restart() {
        step = .start
    }
}
