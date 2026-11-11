import XCTest
@testable import GoKineticFeatures
import GoKineticCore
import GoKineticTestSupport

@MainActor
final class AppointmentBookingViewModelTests: XCTestCase {
    private let slots = [Fixtures.slot(id: "A", start: "2025-03-12T08:00:00Z"),
                         Fixtures.slot(id: "B", start: "2025-03-13T08:00:00Z")]

    func testTakenSlotReloadsAndClearsSelection() async {
        let repo = MockAppointmentRepository()
        repo.slotsStub.enqueue(.success(slots))
        repo.slotsStub.enqueue(.success([slots[1]]))
        repo.bookStub.fails(APIError.conflict(ProblemDetails(type: "https://errors.uniti.example/appointments/slot-unavailable")))
        let viewModel = AppointmentBookingViewModel(mode: .book(ticketId: "T-1"), type: .repair, appointments: repo,
                                                    analytics: RecordingAnalytics(), clock: FixedClock(), calendar: .gregorianUTC)
        await viewModel.loadSlots()
        viewModel.selectedSlotId = "A"
        await viewModel.confirm()

        XCTAssertTrue(viewModel.slotWasTaken)
        XCTAssertNil(viewModel.selectedSlotId)
        XCTAssertEqual(viewModel.days.value?.flatMap(\.slots).map(\.id), ["B"])
        XCTAssertEqual(repo.bookings.last?.request.ticketId, "T-1")
        XCTAssertFalse(viewModel.canChangeType)
    }

    func testBookingTrimsNotesAndTracks() async {
        let repo = MockAppointmentRepository()
        let analytics = RecordingAnalytics()
        repo.slotsStub.returns(slots)
        repo.bookStub.returns(Fixtures.appointment())
        let viewModel = AppointmentBookingViewModel(mode: .book(ticketId: nil), type: .installation, appointments: repo,
                                                    analytics: analytics, clock: FixedClock(), calendar: .gregorianUTC)
        await viewModel.loadSlots()
        viewModel.selectedSlotId = "B"
        viewModel.notes = "   "
        await viewModel.confirm()

        XCTAssertEqual(viewModel.phase, .confirmed(Fixtures.appointment()))
        XCTAssertNil(repo.bookings.last?.request.notes)
        XCTAssertEqual(analytics.events.calls, [.appointmentBooked(type: "INSTALLATION")])
    }

    func testCancelInsideCutoffPromptsForSupportCall() async {
        let repo = MockAppointmentRepository()
        let soon = Fixtures.appointment(slot: Fixtures.slot(id: "S", start: "2025-03-11T08:00:00Z"))
        let viewModel = AppointmentsViewModel(appointments: repo, analytics: RecordingAnalytics(), clock: FixedClock(),
                                              supportPhone: "+1 (555) 010-2000")
        await viewModel.cancel(soon, reason: "Away")

        XCTAssertTrue(repo.cancellations.calls.isEmpty)
        XCTAssertEqual(viewModel.callSupportPrompt, soon)
        XCTAssertEqual(viewModel.supportPhoneURL, URL(string: "tel:+15550102000"))
    }
}

@MainActor
final class SettingsViewModelTests: XCTestCase {
    private final class FakeUnlock: BiometricUnlockControlling, @unchecked Sendable {
        var enabled = false
        func isBiometricUnlockEnabled() async -> Bool { enabled }
        func setBiometricUnlock(enabled: Bool) async throws { self.enabled = enabled }
    }

    private struct FakeBiometrics: BiometricAuthenticating {
        let succeeds: Bool
        func availableBiometry() -> BiometryKind { .faceID }
        func authenticate(reason: String) async throws -> Bool { succeeds }
    }

    private func makeViewModel(repo: MockNotificationRepository, unlock: FakeUnlock, biometricsSucceed: Bool = true,
                               defaults: UserDefaults) -> SettingsViewModel {
        SettingsViewModel(notifications: repo, biometricUnlock: unlock, biometrics: FakeBiometrics(succeeds: biometricsSucceed),
                          analytics: AnalyticsService(providers: [], enabled: true), preferences: PreferencesStore(defaults: defaults),
                          appVersion: "1.0", signOut: {})
    }

    private func freshDefaults() -> UserDefaults {
        let name = "settings-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    func testFailedSaveRollsBackToConfirmedPreferences() async {
        let repo = MockNotificationRepository()
        repo.preferencesStub.returns(NotificationPreferences())
        repo.updateError = APIError.offline
        let viewModel = makeViewModel(repo: repo, unlock: FakeUnlock(), defaults: freshDefaults())
        await viewModel.load()

        await viewModel.setNotification(\.marketing, to: true)

        XCTAssertEqual(viewModel.notifications.value?.marketing, false)
        XCTAssertEqual(viewModel.error?.kind, .offline)
    }

    func testSuccessfulSavePersistsToggle() async {
        let repo = MockNotificationRepository()
        repo.preferencesStub.returns(NotificationPreferences())
        let viewModel = makeViewModel(repo: repo, unlock: FakeUnlock(), defaults: freshDefaults())
        await viewModel.load()

        await viewModel.setNotification(\.outages, to: false)

        XCTAssertEqual(repo.updates.calls.count, 1)
        XCTAssertEqual(viewModel.notifications.value?.outages, false)
        XCTAssertFalse(viewModel.isSavingNotifications)
    }

    func testBiometricUnlockRequiresSuccessfulCheck() async {
        let repo = MockNotificationRepository()
        repo.preferencesStub.returns(NotificationPreferences())
        let unlock = FakeUnlock()
        let rejected = makeViewModel(repo: repo, unlock: unlock, biometricsSucceed: false, defaults: freshDefaults())
        await rejected.setBiometricUnlock(true)
        XCTAssertFalse(unlock.enabled)

        let accepted = makeViewModel(repo: repo, unlock: unlock, defaults: freshDefaults())
        await accepted.setBiometricUnlock(true)
        XCTAssertTrue(unlock.enabled)
        XCTAssertTrue(accepted.biometricUnlockEnabled)
    }

    func testAnalyticsOptOutIsPersisted() {
        let defaults = freshDefaults()
        let viewModel = makeViewModel(repo: MockNotificationRepository(), unlock: FakeUnlock(), defaults: defaults)
        viewModel.setAnalyticsEnabled(false)
        XCTAssertEqual(PreferencesStore(defaults: defaults).analyticsOptIn, false)
        XCTAssertFalse(viewModel.analyticsEnabled)
    }
}

@MainActor
final class WiFiViewModelTests: XCTestCase {
    func testBlockingRevertsWhenServerFails() async {
        let router = MockRouterRepository()
        router.statusStub.returns(Fixtures.router())
        router.devicesStub.returns([Fixtures.device()])
        router.deviceUpdateStub.fails(APIError.server(status: 500, problem: nil))
        let viewModel = WiFiViewModel(serviceId: "SVC-1", router: router, analytics: RecordingAnalytics(),
                                      clock: FixedClock(), sleeper: ImmediateSleeper())
        await viewModel.load()
        await viewModel.setBlocked(Fixtures.device(), blocked: true)

        XCTAssertEqual(viewModel.devices.value?.first?.isBlocked, false)
        XCTAssertNotNil(viewModel.actionError)
        XCTAssertTrue(viewModel.busyDeviceIds.isEmpty)
    }

    func testRebootCompletesAndRefreshesDevices() async {
        let router = MockRouterRepository()
        router.statusStub.returns(Fixtures.router())
        router.devicesStub.returns([Fixtures.device()])
        let analytics = RecordingAnalytics()
        let viewModel = WiFiViewModel(serviceId: "SVC-1", router: router, analytics: analytics,
                                      clock: FixedClock(), sleeper: ImmediateSleeper())
        await viewModel.load()
        await viewModel.reboot()

        XCTAssertEqual(viewModel.rebootState, .completed)
        XCTAssertEqual(router.reboots.calls, ["RTR-1"])
        XCTAssertEqual(analytics.events.calls, [.routerRebooted])
        XCTAssertEqual(router.devicesStub.callCount, 2)
    }

    func testWiFiSettingsValidatesBeforeSaving() async {
        let router = MockRouterRepository()
        let viewModel = WiFiSettingsViewModel(routerId: "RTR-1", network: Fixtures.network(), router: router, analytics: RecordingAnalytics())
        viewModel.changePassphrase = true
        viewModel.passphrase = "Fibre-Home-2025"
        viewModel.confirmation = "Fibre-Home-2024"
        await viewModel.save()
        XCTAssertTrue(router.wifiRequests.calls.isEmpty)
        XCTAssertNotNil(viewModel.message(for: "confirmation"))
        XCTAssertTrue(viewModel.disconnectsDevices)
    }
}

@MainActor
final class TroubleshootViewModelTests: XCTestCase {
    func testKnownOutageEndsFlowEarly() async {
        let outages = MockOutageRepository()
        let outage = Fixtures.outage()
        outages.outagesStub.returns([outage])
        let router = MockRouterRepository()
        router.statusStub.returns(Fixtures.router(state: .offline))
        let viewModel = TroubleshootViewModel(serviceId: "SVC-1", outages: outages, router: router, clock: FixedClock(),
                                              sleeper: ImmediateSleeper())
        await viewModel.begin()
        XCTAssertEqual(viewModel.step, .knownOutage(outage))
    }

    func testDegradedRouterRebootFailureEscalatesAsP1() async {
        let router = MockRouterRepository()
        router.statusStub.enqueue(.success(Fixtures.router(state: .degraded)))
        router.statusStub.enqueue(.success(Fixtures.router(state: .offline)))
        let viewModel = TroubleshootViewModel(serviceId: "SVC-1", outages: MockOutageRepository(), router: router,
                                              clock: FixedClock(), sleeper: ImmediateSleeper())
        await viewModel.begin()
        guard case .offerReboot = viewModel.step else { return XCTFail("Expected reboot offer, got \(viewModel.step)") }

        await viewModel.reboot()

        XCTAssertEqual(viewModel.step, .advice([.checkPowerAndCables, .contactSupport]))
        let draft = viewModel.ticketDraft(customerNotes: "Nothing works")
        XCTAssertEqual(draft.priority, .p1)
        XCTAssertEqual(draft.serviceId, "SVC-1")
    }

    func testHealthyRouterGoesStraightToAdvice() async {
        let router = MockRouterRepository()
        router.statusStub.returns(Fixtures.router())
        router.devicesStub.returns([Fixtures.device(name: "Tablet", signal: -85)])
        let viewModel = TroubleshootViewModel(serviceId: "SVC-1", outages: MockOutageRepository(), router: router,
                                              clock: FixedClock(), sleeper: ImmediateSleeper())
        await viewModel.begin()
        XCTAssertEqual(viewModel.step, .advice([.moveCloser(deviceNames: ["Tablet"])]))
    }
}
