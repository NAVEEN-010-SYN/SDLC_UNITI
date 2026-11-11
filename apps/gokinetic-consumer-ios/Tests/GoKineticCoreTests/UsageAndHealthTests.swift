import XCTest
@testable import GoKineticCore
import GoKineticTestSupport

final class UsageInsightsTests: XCTestCase {
    private let gb: Int64 = 1_000_000_000

    private func report(samples: [UsageSample], cap: Int64?) -> UsageReport {
        UsageReport(serviceId: "SVC-1", period: .month, samples: samples, dataCapBytes: cap,
                    cycleStart: Fixtures.date("2025-03-01T00:00:00Z"), cycleEnd: Fixtures.date("2025-03-31T00:00:00Z"))
    }

    private func sample(_ iso: String, down: Int64, up: Int64 = 0) -> UsageSample {
        UsageSample(timestamp: Fixtures.date(iso), downloadBytes: down, uploadBytes: up)
    }

    func testDailyTotalsCollapseHourlySamples() {
        let samples = [sample("2025-03-01T01:00:00Z", down: 2 * gb), sample("2025-03-01T20:00:00Z", down: gb, up: gb),
                       sample("2025-03-02T09:00:00Z", down: 5 * gb)]
        let days = UsageInsights.dailyTotals(samples)
        XCTAssertEqual(days.map(\.totalBytes), [4 * gb, 5 * gb])
        XCTAssertEqual(days.first?.day, Fixtures.date("2025-03-01T00:00:00Z"))
    }

    func testUnlimitedPlanHasNoBudget() {
        let insights = UsageInsights(report: report(samples: [sample("2025-03-02T00:00:00Z", down: gb)], cap: nil),
                                     now: Fixtures.date("2025-03-10T12:00:00Z"))
        XCTAssertEqual(insights.capStatus, .unlimited)
        XCTAssertNil(insights.dailyBudget)
    }

    func testProjectionOverCapIsFlaggedBeforeCapIsReached() {
        // 400 GB in the first third of the cycle projects to ~1.2 TB against a 1 TB cap.
        let insights = UsageInsights(report: report(samples: [sample("2025-03-05T00:00:00Z", down: 400 * gb)], cap: 1_000 * gb),
                                     now: Fixtures.date("2025-03-11T00:00:00Z"))
        guard case .projectedToExceed(let projected) = insights.capStatus else {
            return XCTFail("Expected projection warning, got \(insights.capStatus)")
        }
        XCTAssertGreaterThan(projected, 1_000 * gb)
        XCTAssertEqual(insights.daysLeftInCycle, 20)
        XCTAssertEqual(insights.dailyBudget, 600 * gb / 20)
    }

    func testExceededReportsOverage() {
        let insights = UsageInsights(report: report(samples: [sample("2025-03-05T00:00:00Z", down: 1_100 * gb)], cap: 1_000 * gb),
                                     now: Fixtures.date("2025-03-30T00:00:00Z"))
        XCTAssertEqual(insights.capStatus, .exceeded(overageBytes: 100 * gb))
        XCTAssertEqual(insights.dailyBudget, 0)
    }

    func testPeakHourPrefersBusiestHourAcrossDays() {
        let samples = [sample("2025-03-01T21:00:00Z", down: 3 * gb), sample("2025-03-02T21:00:00Z", down: 3 * gb),
                       sample("2025-03-02T08:00:00Z", down: 5 * gb)]
        XCTAssertEqual(UsageInsights.peakHour(samples, calendar: .gregorianUTC), 21)
        XCTAssertNil(UsageInsights.peakHour([], calendar: .gregorianUTC))
    }
}

final class ServiceHealthTests: XCTestCase {
    private let now = Fixtures.date("2025-03-10T12:00:00Z")

    func testMajorOutageOnMyServiceWins() {
        let outage = Fixtures.outage(severity: .major)
        let health = ServiceHealthEvaluator.evaluate(outages: [outage], router: Fixtures.router(state: .offline),
                                                     latestSpeedTest: nil, plan: nil, now: now)
        XCTAssertEqual(health, .outage(outage))
        XCTAssertFalse(health.suggestsTroubleshooting)
    }

    func testOutagesElsewhereAreIgnored() {
        let health = ServiceHealthEvaluator.evaluate(outages: [Fixtures.outage(affectsMe: false)], router: Fixtures.router(),
                                                     latestSpeedTest: nil, plan: nil, now: now)
        XCTAssertEqual(health, .operational)
    }

    func testRouterAndSlowSpeedCombineIntoDegraded() {
        let health = ServiceHealthEvaluator.evaluate(outages: [], router: Fixtures.router(state: .degraded),
                                                     latestSpeedTest: Fixtures.speedTest(download: 120), plan: Fixtures.plan(mbps: 500), now: now)
        XCTAssertEqual(health, .degraded([.routerDegraded, .slowSpeed(measuredMbps: 120, planMbps: 500)]))
    }

    func testStaleSpeedTestIsDisregarded() {
        let old = Fixtures.speedTest(download: 50, measuredAt: Fixtures.date("2025-03-08T12:00:00Z"))
        let health = ServiceHealthEvaluator.evaluate(outages: [], router: Fixtures.router(), latestSpeedTest: old,
                                                     plan: Fixtures.plan(), now: now)
        XCTAssertEqual(health, .operational)
    }

    func testPlannedWorkWithoutOtherIssuesIsMaintenance() {
        let planned = Fixtures.outage(severity: .info)
        XCTAssertEqual(ServiceHealthEvaluator.evaluate(outages: [planned], router: nil, latestSpeedTest: nil, plan: nil, now: now),
                       .maintenance(planned))
        XCTAssertEqual(ServiceHealthEvaluator.evaluate(outages: nil, router: nil, latestSpeedTest: nil, plan: nil, now: now), .unknown)
    }
}

final class AppointmentPolicyTests: XCTestCase {
    private let now = Fixtures.date("2025-03-10T12:00:00Z")

    func testEligibilityHonoursCutoffAndStatus() {
        let farOff = Fixtures.appointment(slot: Fixtures.slot(id: "A", start: "2025-03-14T08:00:00Z"))
        let tomorrowMorning = Fixtures.appointment(slot: Fixtures.slot(id: "B", start: "2025-03-11T08:00:00Z"))
        let enRoute = Fixtures.appointment(status: .enRoute)
        XCTAssertEqual(AppointmentPolicy.eligibility(for: farOff, at: now), .allowed)
        XCTAssertEqual(AppointmentPolicy.eligibility(for: tomorrowMorning, at: now), .tooLate)
        XCTAssertEqual(AppointmentPolicy.eligibility(for: enRoute, at: now), .notChangeable)
    }

    func testGroupingByLocalDayUsesCalendarTimeZone() {
        var newYork = Calendar(identifier: .gregorian)
        newYork.timeZone = TimeZone(identifier: "America/New_York")!
        // 02:00 UTC on the 13th is still the evening of the 12th in New York.
        let slots = [Fixtures.slot(id: "late", start: "2025-03-13T02:00:00Z", hours: 2),
                     Fixtures.slot(id: "morning", start: "2025-03-12T13:00:00Z")]
        let days = AppointmentPolicy.groupByDay(slots, calendar: newYork)
        XCTAssertEqual(days.count, 1)
        XCTAssertEqual(days.first?.slots.map(\.id), ["morning", "late"])
    }

    func testReschedulingExcludesCurrentAndTooSoonSlots() {
        let current = Fixtures.slot(id: "S-0", start: "2025-03-14T08:00:00Z")
        let appointment = Fixtures.appointment(slot: current)
        let slots = [current,
                     Fixtures.slot(id: "same-time", start: "2025-03-14T08:00:00Z"),
                     Fixtures.slot(id: "too-soon", start: "2025-03-11T06:00:00Z"),
                     Fixtures.slot(id: "ok", start: "2025-03-15T08:00:00Z")]
        XCTAssertEqual(AppointmentPolicy.reschedulingOptions(slots, for: appointment, at: now).map(\.id), ["ok"])
    }

    func testNotesLimit() {
        XCTAssertTrue(AppointmentPolicy.validateNotes(String(repeating: "a", count: 500)).isValid)
        XCTAssertFalse(AppointmentPolicy.validateNotes(String(repeating: "a", count: 501)).isValid)
    }
}
