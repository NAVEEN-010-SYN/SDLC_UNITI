import XCTest
@testable import GoKineticCore
import GoKineticTestSupport

final class ConnectionDiagnosticsTests: XCTestCase {
    private let now = Fixtures.date("2025-03-10T12:00:00Z")

    func testKnownOutageShortCircuitsAdvice() {
        var report = DiagnosticReport(startedAt: now)
        let eta = Fixtures.date("2025-03-10T18:00:00Z")
        report.outage = Fixtures.outage(eta: eta)
        report.routerBefore = Fixtures.router(state: .offline)
        XCTAssertEqual(report.recommendations(at: now), [.waitForOutage(estimatedResolution: eta)])
    }

    func testOfflineRouterAdviceDependsOnRebootAttempt() {
        var report = DiagnosticReport(startedAt: now)
        report.routerBefore = Fixtures.router(state: .offline)
        XCTAssertEqual(report.recommendations(at: now), [.checkPowerAndCables, .restartRouter])
        report.rebootAttempted = true
        XCTAssertEqual(report.recommendations(at: now), [.checkPowerAndCables, .contactSupport])
    }

    func testDeviceSignalAdvice() {
        var report = DiagnosticReport(startedAt: now)
        report.routerBefore = Fixtures.router()
        report.devices = [
            Fixtures.device(id: "D-1", name: "Tablet", band: .ghz5, signal: -82),
            Fixtures.device(id: "D-2", name: "TV", band: .ghz2_4, signal: -60),
            Fixtures.device(id: "D-3", name: "Old phone", band: .ghz2_4, signal: -50,
                            lastActive: Fixtures.date("2025-03-09T12:00:00Z")),
            Fixtures.device(id: "D-4", name: "Desktop", band: nil, signal: nil, wired: true)
        ]
        XCTAssertEqual(report.recommendations(at: now), [.moveCloser(deviceNames: ["Tablet"]), .switchTo5GHz(deviceNames: ["TV"])])
    }

    func testSlowSpeedSuggestsRestartThenWiredTest() {
        var report = DiagnosticReport(startedAt: now)
        report.routerBefore = Fixtures.router()
        report.speedTest = Fixtures.speedTest(download: 100)
        report.plan = Fixtures.plan(mbps: 1000)
        XCTAssertEqual(report.recommendations(at: now), [.restartRouter, .testOverEthernet])
    }

    func testEscalationTicketCarriesDiagnosticsAndPriority() {
        var report = DiagnosticReport(startedAt: now)
        report.routerBefore = Fixtures.router(state: .offline)
        report.rebootAttempted = true
        let request = report.ticketRequest(serviceId: "SVC-1", customerNotes: "  No lights on the box ")

        XCTAssertEqual(request.priority, .p1)
        XCTAssertEqual(request.category, .connectivity)
        XCTAssertTrue(request.description.contains("Customer notes: No lights on the box"))
        XCTAssertTrue(request.description.contains("Reboot attempted: yes"))
        XCTAssertTrue(TicketValidator.validate(subject: request.subject, description: request.description).isValid)
    }

    func testRecoveryMonitorPollsUntilOnline() async throws {
        let router = MockRouterRepository()
        router.statusStub.enqueue(.failure(APIError.server(status: 503, problem: nil)))
        router.statusStub.enqueue(.success(Fixtures.router(state: .rebooting)))
        router.statusStub.enqueue(.success(Fixtures.router(state: .online)))
        let sleeper = ImmediateSleeper()
        let monitor = RouterRecoveryMonitor(router: router, sleeper: sleeper, initialDelay: 30, pollInterval: 15, maxPolls: 5)
        let observed = Recorder<RouterState>()

        let status = try await monitor.rebootAndWait(routerId: "RTR-1", serviceId: "SVC-1") { observed.record($0) }

        XCTAssertEqual(status.state, .online)
        XCTAssertEqual(router.reboots.calls, ["RTR-1"])
        XCTAssertEqual(observed.calls, [.rebooting, .rebooting, .online])
        XCTAssertEqual(sleeper.delays.calls, [30, 15, 15])
    }

    func testRecoveryMonitorGivesUpAfterMaxPolls() async {
        let router = MockRouterRepository()
        router.statusStub.returns(Fixtures.router(state: .offline))
        let monitor = RouterRecoveryMonitor(router: router, sleeper: ImmediateSleeper(), maxPolls: 3)
        do {
            _ = try await monitor.rebootAndWait(routerId: "RTR-1", serviceId: "SVC-1")
            XCTFail("Expected failure")
        } catch {
            XCTAssertEqual(error as? RouterRecoveryMonitor.RecoveryError, .didNotRecover(lastKnown: .offline))
        }
        XCTAssertEqual(router.statusStub.callCount, 3)
    }
}
