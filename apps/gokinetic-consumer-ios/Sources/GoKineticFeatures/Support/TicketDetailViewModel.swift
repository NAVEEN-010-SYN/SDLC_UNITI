import Foundation
import GoKineticCore
import GoKineticUI

/// Ticket conversation: read the thread, reply, or escalate to live chat.
@MainActor
public final class TicketDetailViewModel: ObservableObject {
    public enum ChatState: Equatable {
        case idle
        case connecting
        case connected(ChatSession)
        case unavailable
        case failed(UserFacingError)
    }

    @Published public private(set) var state: ViewState<Ticket> = .idle
    @Published public var replyText = ""
    @Published public private(set) var isSending = false
    /// Local echo of the reply while it is being sent.
    @Published public private(set) var pendingComment: TicketComment?
    @Published public private(set) var replyError: UserFacingError?
    @Published public private(set) var chat: ChatState = .idle

    public let ticketId: String
    private let support: SupportRepository
    private let analytics: AnalyticsTracking
    private let clock: Clock
    private let onChange: (Ticket) -> Void

    public init(ticketId: String, support: SupportRepository, analytics: AnalyticsTracking, clock: Clock,
                onChange: @escaping (Ticket) -> Void = { _ in }) {
        self.ticketId = ticketId
        self.support = support
        self.analytics = analytics
        self.clock = clock
        self.onChange = onChange
    }

    public func load() async {
        state = state.reloading()
        do {
            state = .loaded(try await support.ticket(id: ticketId))
        } catch {
            state = state.failing(error)
        }
    }

    public var canReply: Bool {
        guard let ticket = state.value, ticket.status.acceptsComments, !isSending else { return false }
        return TicketValidator.validateComment(replyText).isValid
    }

    /// Replying reopens a resolved ticket and hands a pending-customer
    /// ticket back to the agent; the local copy mirrors the server rule.
    static func status(afterCustomerReplyTo status: TicketStatus) -> TicketStatus {
        switch status {
        case .pendingCustomer: return .inProgress
        case .resolved: return .open
        case .open, .inProgress, .closed: return status
        }
    }

    public func sendReply() async {
        guard canReply, let ticket = state.value else { return }
        let body = replyText.trimmingCharacters(in: .whitespacesAndNewlines)
        isSending = true
        replyError = nil
        pendingComment = TicketComment(id: "pending-\(UUID().uuidString)", author: "", isFromCustomer: true,
                                       body: body, createdAt: clock.now())
        replyText = ""
        defer {
            isSending = false
            pendingComment = nil
        }
        do {
            let saved = try await support.addComment(ticketId: ticket.id, body: body)
            let updated = ticket.appending(saved, status: Self.status(afterCustomerReplyTo: ticket.status))
            state = .loaded(updated)
            onChange(updated)
        } catch {
            // Give the text back so nothing the customer typed is lost.
            if replyText.isEmpty { replyText = body }
            replyError = UserFacingError(error)
        }
    }

    public var visibleComments: [TicketComment] {
        (state.value?.comments ?? []) + [pendingComment].compactMap { $0 }
    }

    public func startChat() async {
        guard let ticket = state.value, chat != .connecting else { return }
        chat = .connecting
        do {
            let session = try await support.startChat(topic: ticket.category, ticketId: ticket.id)
            chat = session.agentsAvailable ? .connected(session) : .unavailable
            if session.agentsAvailable { analytics.track(.chatStarted) }
        } catch {
            chat = .failed(UserFacingError(error))
        }
    }

    public func dismissChat() {
        chat = .idle
    }

    /// Visit type to offer when the ticket implies an engineer is needed.
    public var suggestedAppointmentType: AppointmentType? {
        guard let ticket = state.value, !ticket.status.isClosed else { return nil }
        return AppointmentPolicy.suggestedType(for: ticket.category)
    }
}
