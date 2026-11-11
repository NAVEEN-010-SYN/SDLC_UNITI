# Go Kinetic Consumer mobile app (B2C): apps/gokinetic-consumer-ios/Tests (part 7 of 7)

- **Application:** Go Kinetic Consumer mobile app (B2C)
- **Tech stack:** Swift / SwiftUI
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 5

## Files

- `apps/gokinetic-consumer-ios/Tests/GoKineticFeaturesTests/ServiceViewModelTests.swift` (223 lines)
- `apps/gokinetic-consumer-ios/Tests/GoKineticFeaturesTests/SupportViewModelTests.swift` (139 lines)
- `apps/gokinetic-consumer-ios/Tests/GoKineticTestSupport/Fixtures.swift` (105 lines)
- `apps/gokinetic-consumer-ios/Tests/GoKineticTestSupport/MockRepositories.swift` (169 lines)
- `apps/gokinetic-consumer-ios/Tests/GoKineticTestSupport/TestDoubles.swift` (101 lines)

## apps/gokinetic-consumer-ios/Tests/GoKineticFeaturesTests/ServiceViewModelTests.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Tests/GoKineticFeaturesTests/ServiceViewModelTests.swift`.

```swift
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
```

## apps/gokinetic-consumer-ios/Tests/GoKineticFeaturesTests/SupportViewModelTests.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Tests/GoKineticFeaturesTests/SupportViewModelTests.swift`.

```swift
import XCTest
@testable import GoKineticFeatures
import GoKineticCore
import GoKineticTestSupport

@MainActor
final class TicketDetailViewModelTests: XCTestCase {
    private let reply = TicketComment(id: "C-1", author: "Jo", isFromCustomer: true,
                                      body: "Still dropping every evening", createdAt: Fixtures.date("2025-03-10T12:00:00Z"))

    func testReplyMovesPendingCustomerTicketBackToAgent() async {
        let support = MockSupportRepository()
        support.ticketStub.returns(Fixtures.ticket(status: .pendingCustomer))
        support.commentStub.returns(reply)
        var propagated: Ticket?
        let viewModel = TicketDetailViewModel(ticketId: "T-1", support: support, analytics: RecordingAnalytics(),
                                              clock: FixedClock(), onChange: { propagated = $0 })
        await viewModel.load()
        viewModel.replyText = "  Still dropping every evening  "
        await viewModel.sendReply()

        XCTAssertEqual(viewModel.state.value?.status, .inProgress)
        XCTAssertEqual(viewModel.state.value?.comments.last, reply)
        XCTAssertEqual(propagated?.status, .inProgress)
        XCTAssertEqual(viewModel.replyText, "")
        XCTAssertNil(viewModel.pendingComment)
    }

    func testFailedReplyRestoresText() async {
        let support = MockSupportRepository()
        support.ticketStub.returns(Fixtures.ticket())
        support.commentStub.fails(APIError.offline)
        let viewModel = TicketDetailViewModel(ticketId: "T-1", support: support, analytics: RecordingAnalytics(), clock: FixedClock())
        await viewModel.load()
        viewModel.replyText = "Router lights are red"
        await viewModel.sendReply()

        XCTAssertEqual(viewModel.replyText, "Router lights are red")
        XCTAssertEqual(viewModel.replyError?.kind, .offline)
        XCTAssertTrue(viewModel.visibleComments.isEmpty)
    }

    func testStatusRules() {
        XCTAssertEqual(TicketDetailViewModel.status(afterCustomerReplyTo: .resolved), .open)
        XCTAssertEqual(TicketDetailViewModel.status(afterCustomerReplyTo: .inProgress), .inProgress)
    }

    func testChatWithoutAgentsIsUnavailable() async {
        let support = MockSupportRepository()
        let analytics = RecordingAnalytics()
        support.ticketStub.returns(Fixtures.ticket())
        support.chatStub.returns(ChatSession(sessionId: "S", websocketURL: URL(string: "wss://chat.example")!,
                                             estimatedWaitSeconds: nil, agentsAvailable: false))
        let viewModel = TicketDetailViewModel(ticketId: "T-1", support: support, analytics: analytics, clock: FixedClock())
        await viewModel.load()
        await viewModel.startChat()
        XCTAssertEqual(viewModel.chat, .unavailable)
        XCTAssertTrue(analytics.events.calls.isEmpty)
    }
}

@MainActor
final class NewTicketViewModelTests: XCTestCase {
    func testPriorityFollowsCategoryUntilUserChooses() {
        let viewModel = NewTicketViewModel(serviceId: "SVC-1", support: MockSupportRepository(), analytics: RecordingAnalytics())
        XCTAssertEqual(viewModel.priority, .p2)
        viewModel.category = .billing
        XCTAssertEqual(viewModel.priority, .p4)
        viewModel.choosePriority(.p3)
        viewModel.category = .equipment
        XCTAssertEqual(viewModel.priority, .p3)
    }

    func testP1IsOnlyForConnectivity() {
        let viewModel = NewTicketViewModel(serviceId: nil, support: MockSupportRepository(), analytics: RecordingAnalytics())
        viewModel.choosePriority(.p1)
        XCTAssertEqual(viewModel.priority, .p1)
        viewModel.category = .billing
        XCTAssertEqual(viewModel.priority, .p4)
        viewModel.choosePriority(.p1)
        XCTAssertEqual(viewModel.priority, .p4)
    }

    func testInvalidFormDoesNotSubmit() async {
        let support = MockSupportRepository()
        let viewModel = NewTicketViewModel(serviceId: nil, support: support, analytics: RecordingAnalytics())
        viewModel.subject = "Hi"
        await viewModel.submit()
        XCTAssertTrue(support.created.calls.isEmpty)
        XCTAssertNotNil(viewModel.message(for: "subject"))
    }

    func testRetryAfterFailureReusesIdempotencyKey() async {
        let support = MockSupportRepository()
        support.createStub.enqueue(.failure(APIError.timedOut))
        support.createStub.enqueue(.success(Fixtures.ticket(id: "T-9")))
        var created: Ticket?
        let viewModel = NewTicketViewModel(serviceId: "SVC-1", support: support, analytics: RecordingAnalytics(),
                                           idempotencyKey: "KEY", onCreated: { created = $0 })
        viewModel.subject = "No internet since morning"
        viewModel.details = "All lights are off on the router since 8am today."

        await viewModel.submit()
        XCTAssertNotNil(viewModel.submitError)
        await viewModel.submit()

        XCTAssertEqual(support.created.calls.map(\.key), ["KEY", "KEY"])
        XCTAssertEqual(created?.id, "T-9")
        XCTAssertEqual(support.created.last?.request.serviceId, "SVC-1")
    }
}

@MainActor
final class TicketsViewModelTests: XCTestCase {
    func testSectionsPutAwaitingReplyFirstAndOrderOpenByPriority() async {
        let support = MockSupportRepository()
        support.ticketsStub.returns(Fixtures.page([
            Fixtures.ticket(id: "low", status: .open, priority: .p4),
            Fixtures.ticket(id: "closed", status: .closed),
            Fixtures.ticket(id: "urgent", status: .inProgress, priority: .p2),
            Fixtures.ticket(id: "reply", status: .pendingCustomer)
        ]))
        let viewModel = TicketsViewModel(support: support)
        await viewModel.load()

        XCTAssertEqual(viewModel.sections.map(\.kind), [.needsReply, .open, .closed])
        XCTAssertEqual(viewModel.sections[1].tickets.map(\.id), ["urgent", "low"])
    }

    func testTogglingClosedRefetchesWithFilter() async {
        let support = MockSupportRepository()
        support.ticketsStub.returns(Fixtures.page([Fixtures.ticket()]))
        let viewModel = TicketsViewModel(support: support)
        await viewModel.load()
        await viewModel.setIncludeClosed(true)
        XCTAssertEqual(support.ticketQueries.calls.map(\.includeClosed), [false, true])
    }
}
```

## apps/gokinetic-consumer-ios/Tests/GoKineticTestSupport/Fixtures.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Tests/GoKineticTestSupport/Fixtures.swift`.

```swift
import Foundation
import GoKineticCore

/// Builders for domain values with sensible defaults; tests override only
/// the fields that matter to them.
public enum Fixtures {
    public static func date(_ iso: String) -> Date {
        guard let date = ISO8601.date(from: iso) else { preconditionFailure("Bad fixture date \(iso)") }
        return date
    }

    public static func usd(_ minorUnits: Int64) -> Money { Money(minorUnits: minorUnits, currency: "USD") }

    public static let address = PostalAddress(line1: "1 Fibre Way", city: "Springfield", region: "IL", postalCode: "62701", country: "US")

    public static func summary(balance: Int64 = 8_499, nextBillDate: Date? = date("2025-03-20T00:00:00Z"),
                               autopay: Bool = false) -> AccountSummary {
        AccountSummary(accountId: AccountID(rawValue: "ACC-12345678")!, holderName: "Jo Doe", balance: usd(balance),
                       nextBillDate: nextBillDate, autopayEnabled: autopay,
                       services: [Service(id: "SVC-1", productName: "Fibre 500", planId: "PLN-500", status: .active,
                                          address: address, activatedAt: nil)])
    }

    public static func profile(email: String = "jo@example.com", phone: String? = "+15551234567") -> UserProfile {
        UserProfile(id: "U-1", firstName: "Jo", lastName: "Doe", email: email, phone: phone,
                    roles: ["CONSUMER"], accountId: AccountID(rawValue: "ACC-12345678")!)
    }

    public static func invoice(id: String = "INV-1", total: Int64 = 8_499, paid: Int64 = 0,
                               status: InvoiceStatus = .open, due: Date = date("2025-03-20T00:00:00Z"),
                               lineItems: [LineItem]? = nil) -> Invoice {
        Invoice(id: id, number: "N-\(id)", issuedAt: due.addingTimeInterval(-14 * 86_400), dueAt: due,
                periodStart: due.addingTimeInterval(-30 * 86_400), periodEnd: due,
                total: usd(total), amountPaid: usd(paid), status: status,
                lineItems: lineItems ?? [LineItem(id: "L-\(id)", description: "Fibre 500", amount: usd(total), category: .recurring)])
    }

    public static func method(id: String = "PM-1", isDefault: Bool = true, expiryYear: Int? = 2030) -> PaymentMethod {
        PaymentMethod(id: id, kind: .card, brand: "Visa", last4: "4242", expiryMonth: 12, expiryYear: expiryYear, isDefault: isDefault)
    }

    public static func payment(amount: Int64 = 8_499, status: PaymentStatus = .succeeded, failureReason: String? = nil) -> Payment {
        Payment(id: "PAY-1", amount: usd(amount), createdAt: date("2025-03-10T12:00:00Z"), status: status,
                methodDisplay: "Visa •••• 4242", invoiceId: nil, failureReason: failureReason)
    }

    public static func page<T>(_ items: [T], page: Int = 1, pageSize: Int = 20, total: Int? = nil) -> Page<T> {
        Page(items: items, page: page, pageSize: pageSize, total: total ?? items.count)
    }

    public static func plan(mbps: Int = 500) -> Plan {
        Plan(id: "PLN-\(mbps)", name: "Fibre \(mbps)", downloadMbps: mbps, uploadMbps: mbps,
             monthlyPrice: usd(6_000), contractMonths: 12, features: [])
    }

    public static func network(id: String = "NET-1", ssid: String = "HomeFibre", bands: [WiFiBand] = [.ghz2_4, .ghz5]) -> WiFiNetwork {
        WiFiNetwork(id: id, ssid: ssid, bands: bands, security: .wpa2wpa3, isGuest: false, enabled: true)
    }

    public static func router(state: RouterState = .online) -> RouterStatus {
        RouterStatus(routerId: "RTR-1", model: "GK-X6", firmwareVersion: "6.2.1", state: state, uptimeSeconds: 3_600,
                     lastSeen: date("2025-03-10T11:59:00Z"), networks: [network()])
    }

    public static func device(id: String = "D-1", name: String = "Laptop", band: WiFiBand? = .ghz5, signal: Int? = -50,
                              wired: Bool = false, blocked: Bool = false,
                              lastActive: Date = date("2025-03-10T11:58:00Z")) -> ConnectedDevice {
        ConnectedDevice(id: id, name: name, macAddress: "AA:BB:CC:DD:EE:0\(id.suffix(1))", ipAddress: "192.168.1.10",
                        band: band, isWired: wired, signalDBm: signal, isBlocked: blocked, lastActive: lastActive)
    }

    public static func outage(id: String = "OUT-1", severity: OutageSeverity = .major, affectsMe: Bool = true,
                              started: Date = date("2025-03-10T10:00:00Z"), eta: Date? = nil, resolved: Date? = nil) -> Outage {
        Outage(id: id, title: "Fibre cut", detail: "Crews on site", severity: severity, startedAt: started,
               estimatedResolution: eta, resolvedAt: resolved, affectsMyService: affectsMe)
    }

    public static func ticket(id: String = "T-1", status: TicketStatus = .open, priority: TicketPriority = .p3,
                              category: TicketCategory = .connectivity,
                              updated: Date = date("2025-03-09T12:00:00Z")) -> Ticket {
        Ticket(id: id, reference: "REF-\(id)", subject: "Slow speeds", category: category, priority: priority, status: status,
               createdAt: date("2025-03-01T12:00:00Z"), updatedAt: updated, comments: [])
    }

    public static func slot(id: String, start: String, hours: Double = 4, available: Bool = true) -> TimeSlot {
        let begin = date(start)
        return TimeSlot(id: id, start: begin, end: begin.addingTimeInterval(hours * 3600), available: available)
    }

    public static func appointment(id: String = "APT-1", status: AppointmentStatus = .scheduled,
                                   slot: TimeSlot = Fixtures.slot(id: "S-0", start: "2025-03-14T08:00:00Z")) -> Appointment {
        Appointment(id: id, type: .repair, status: status, slot: slot, technicianName: nil, notes: nil, ticketId: nil)
    }

    public static func speedTest(download: Double, measuredAt: Date = date("2025-03-10T11:00:00Z")) -> SpeedTestResult {
        SpeedTestResult(id: "ST-1", measuredAt: measuredAt, downloadMbps: download, uploadMbps: download,
                        latencyMs: 8, jitterMs: 1, server: "Springfield")
    }

    public static func validationProblem(code: String, field: String? = nil, message: String = "Rejected") -> APIError {
        .validation(ProblemDetails(type: "https://errors.uniti.example/payments/\(code)", title: "Rejected",
                                   errors: field.map { [$0: [message]] }))
    }
}
```

## apps/gokinetic-consumer-ios/Tests/GoKineticTestSupport/MockRepositories.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Tests/GoKineticTestSupport/MockRepositories.swift`.

```swift
import Foundation
import GoKineticCore

public final class MockAccountRepository: AccountRepository, @unchecked Sendable {
    public let profileStub = Stub<UserProfile>()
    public let summaryStub = Stub<AccountSummary>()
    public let updateStub = Stub<UserProfile>()
    public let updates = Recorder<(email: String?, phone: String?)>()

    public init() {}

    public func profile(forceRefresh: Bool) async throws -> UserProfile { try profileStub.next() }
    public func summary(forceRefresh: Bool) async throws -> AccountSummary { try summaryStub.next() }
    public func updateContact(email: String?, phone: String?) async throws -> UserProfile {
        updates.record((email, phone))
        return try updateStub.next()
    }
    public func clearCache() async {}
}

public final class MockBillingRepository: BillingRepository, @unchecked Sendable {
    public let invoicesStub = Stub<Page<Invoice>>()
    public let invoiceStub = Stub<Invoice>()
    public let pdfStub = Stub<URL>()
    public let methodsStub = Stub<[PaymentMethod]>()
    public let paymentsStub = Stub<Page<Payment>>()
    public let payStub = Stub<Payment>()
    public let autopayStub = Stub<AutopaySettings>()
    public let setAutopayStub = Stub<AutopaySettings>()
    public let payRequests = Recorder<PaymentRequest>()
    public let autopayRequests = Recorder<AutopaySettings>()
    public let invoicePages = Recorder<Int>()

    public init() {}

    public func invoices(page: Int, pageSize: Int) async throws -> Page<Invoice> {
        invoicePages.record(page)
        return try invoicesStub.next()
    }
    public func invoice(id: String) async throws -> Invoice { try invoiceStub.next() }
    public func invoicePDF(id: String) async throws -> URL { try pdfStub.next() }
    public func paymentMethods() async throws -> [PaymentMethod] { try methodsStub.next() }
    public func payments(page: Int, pageSize: Int) async throws -> Page<Payment> { try paymentsStub.next() }
    public func pay(_ request: PaymentRequest) async throws -> Payment {
        payRequests.record(request)
        return try payStub.next()
    }
    public func autopay() async throws -> AutopaySettings { try autopayStub.next() }
    public func setAutopay(_ settings: AutopaySettings) async throws -> AutopaySettings {
        autopayRequests.record(settings)
        return try setAutopayStub.next()
    }
    public func invalidate() async {}
}

public final class MockUsageRepository: UsageRepository, @unchecked Sendable {
    public let usageStub = Stub<UsageReport>()
    public let periods = Recorder<UsagePeriod>()
    public init() {}
    public func usage(serviceId: String, period: UsagePeriod, forceRefresh: Bool) async throws -> UsageReport {
        periods.record(period)
        return try usageStub.next()
    }
}

public final class MockRouterRepository: RouterRepository, @unchecked Sendable {
    public let statusStub = Stub<RouterStatus>()
    public let rebootStub = Stub<Void>([.success(())])
    public let wifiStub = Stub<WiFiNetwork>()
    public let devicesStub = Stub<[ConnectedDevice]>()
    public let deviceUpdateStub = Stub<ConnectedDevice>()
    public let reboots = Recorder<String>()
    public let wifiRequests = Recorder<WiFiUpdateRequest>()

    public init() {}

    public func status(serviceId: String) async throws -> RouterStatus { try statusStub.next() }
    public func reboot(routerId: String) async throws {
        reboots.record(routerId)
        try rebootStub.next()
    }
    public func updateWiFi(routerId: String, _ request: WiFiUpdateRequest) async throws -> WiFiNetwork {
        wifiRequests.record(request)
        return try wifiStub.next()
    }
    public func connectedDevices(routerId: String) async throws -> [ConnectedDevice] { try devicesStub.next() }
    public func setDeviceBlocked(routerId: String, deviceId: String, blocked: Bool) async throws -> ConnectedDevice {
        try deviceUpdateStub.next()
    }
    public func renameDevice(routerId: String, deviceId: String, name: String) async throws -> ConnectedDevice {
        try deviceUpdateStub.next()
    }
}

public final class MockOutageRepository: OutageRepository, @unchecked Sendable {
    public let outagesStub = Stub<[Outage]>([.success([])])
    public init() {}
    public func outages(serviceId: String) async throws -> [Outage] { try outagesStub.next() }
}

public final class MockSupportRepository: SupportRepository, @unchecked Sendable {
    public let ticketsStub = Stub<Page<Ticket>>()
    public let ticketStub = Stub<Ticket>()
    public let createStub = Stub<Ticket>()
    public let commentStub = Stub<TicketComment>()
    public let chatStub = Stub<ChatSession>()
    public let created = Recorder<(request: NewTicketRequest, key: String)>()
    public let ticketQueries = Recorder<(page: Int, includeClosed: Bool)>()

    public init() {}

    public func tickets(page: Int, pageSize: Int, includeClosed: Bool) async throws -> Page<Ticket> {
        ticketQueries.record((page, includeClosed))
        return try ticketsStub.next()
    }
    public func ticket(id: String) async throws -> Ticket { try ticketStub.next() }
    public func createTicket(_ request: NewTicketRequest, idempotencyKey: String) async throws -> Ticket {
        created.record((request, idempotencyKey))
        return try createStub.next()
    }
    public func addComment(ticketId: String, body: String) async throws -> TicketComment { try commentStub.next() }
    public func startChat(topic: TicketCategory, ticketId: String?) async throws -> ChatSession { try chatStub.next() }
}

public final class MockAppointmentRepository: AppointmentRepository, @unchecked Sendable {
    public let listStub = Stub<[Appointment]>()
    public let slotsStub = Stub<[TimeSlot]>()
    public let bookStub = Stub<Appointment>()
    public let rescheduleStub = Stub<Appointment>()
    public let cancelStub = Stub<Void>([.success(())])
    public let bookings = Recorder<(request: BookAppointmentRequest, key: String)>()
    public let cancellations = Recorder<(id: String, reason: String?)>()

    public init() {}

    public func appointments() async throws -> [Appointment] { try listStub.next() }
    public func availableSlots(type: AppointmentType, from: Date, days: Int) async throws -> [TimeSlot] { try slotsStub.next() }
    public func book(_ request: BookAppointmentRequest, idempotencyKey: String) async throws -> Appointment {
        bookings.record((request, idempotencyKey))
        return try bookStub.next()
    }
    public func reschedule(appointmentId: String, slotId: String) async throws -> Appointment { try rescheduleStub.next() }
    public func cancel(appointmentId: String, reason: String?) async throws {
        cancellations.record((appointmentId, reason))
        try cancelStub.next()
    }
}

public final class MockNotificationRepository: NotificationRepository, @unchecked Sendable {
    public let preferencesStub = Stub<NotificationPreferences>()
    public let updates = Recorder<NotificationPreferences>()
    /// When set, updates fail with this error; otherwise the server echoes the request.
    public var updateError: Error?
    /// Invoked during each update, letting tests flip toggles mid-save.
    public var onUpdate: (@Sendable () async -> Void)?

    public init() {}

    public func register(_ registration: DeviceRegistration) async throws {}
    public func unregister(token: String) async throws {}
    public func preferences() async throws -> NotificationPreferences { try preferencesStub.next() }
    public func updatePreferences(_ preferences: NotificationPreferences) async throws -> NotificationPreferences {
        updates.record(preferences)
        await onUpdate?()
        if let updateError { throw updateError }
        return preferences
    }
}
```

## apps/gokinetic-consumer-ios/Tests/GoKineticTestSupport/TestDoubles.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Tests/GoKineticTestSupport/TestDoubles.swift`.

```swift
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
```
