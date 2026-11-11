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
