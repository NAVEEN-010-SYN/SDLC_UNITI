import Foundation
import GoKineticCore
import GoKineticUI

/// Support tickets list, grouped so cases waiting on the customer surface
/// first.
@MainActor
public final class TicketsViewModel: ObservableObject {
    public struct Section: Equatable, Identifiable {
        public enum Kind: String {
            case needsReply, open, closed
        }

        public let kind: Kind
        public let tickets: [Ticket]
        public var id: String { kind.rawValue }
        public var titleKey: String { "tickets.section.\(kind.rawValue)" }
    }

    @Published public private(set) var state: ViewState<[Ticket]> = .idle
    @Published public private(set) var isLoadingMore = false
    @Published public private(set) var includeClosed = false
    @Published public var inlineError: UserFacingError?

    private let support: SupportRepository
    private var loader: PagedLoader<Ticket>
    private let pageSize: Int

    public init(support: SupportRepository, pageSize: Int = 20) {
        self.support = support
        self.pageSize = pageSize
        self.loader = TicketsViewModel.makeLoader(support: support, pageSize: pageSize, includeClosed: false)
    }

    private static func makeLoader(support: SupportRepository, pageSize: Int, includeClosed: Bool) -> PagedLoader<Ticket> {
        PagedLoader(pageSize: pageSize) { page, size in
            try await support.tickets(page: page, pageSize: size, includeClosed: includeClosed)
        }
    }

    public func load() async {
        state = state.reloading()
        state = await loader.refresh(current: state)
    }

    public func setIncludeClosed(_ include: Bool) async {
        guard include != includeClosed else { return }
        includeClosed = include
        loader = TicketsViewModel.makeLoader(support: support, pageSize: pageSize, includeClosed: include)
        state = .loading(previous: nil)
        state = await loader.refresh(current: state)
    }

    public func loadMoreIfNeeded(current ticket: Ticket) async {
        guard ticket.id == loader.collection.items.last?.id, loader.collection.hasMore else { return }
        isLoadingMore = true
        inlineError = await loader.loadMore()
        isLoadingMore = false
        state = loader.state
    }

    /// Inserts a just-created ticket without refetching.
    public func didCreate(_ ticket: Ticket) {
        loader.update { $0.prepend(ticket) }
        state = loader.state
    }

    /// Reflects changes made on the detail screen (new comment, reopen).
    public func didUpdate(_ ticket: Ticket) {
        loader.update { $0.replace(ticket) }
        state = loader.state
    }

    public var sections: [Section] {
        guard let tickets = state.value else { return [] }
        let byRecency: (Ticket, Ticket) -> Bool = { $0.updatedAt > $1.updatedAt }
        let needsReply = tickets.filter { $0.status.awaitsCustomer }.sorted(by: byRecency)
        let open = tickets.filter { !$0.status.awaitsCustomer && !$0.status.isClosed }
            .sorted { ($0.priority, $1.updatedAt) < ($1.priority, $0.updatedAt) }
        let closed = tickets.filter { $0.status.isClosed }.sorted(by: byRecency)
        return [Section(kind: .needsReply, tickets: needsReply),
                Section(kind: .open, tickets: open),
                Section(kind: .closed, tickets: closed)]
            .filter { !$0.tickets.isEmpty }
    }
}
