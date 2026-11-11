import Foundation
import GoKineticCore
import GoKineticUI

/// Accumulates `{ items, page, pageSize, total }` pages for infinite lists.
/// Items are de-duplicated by id because a record created between two page
/// fetches shifts later pages by one and would otherwise appear twice.
struct PagedCollection<Item: Identifiable & Codable & Sendable> {
    let pageSize: Int
    private(set) var items: [Item] = []
    private(set) var nextPage: Int? = 1
    private(set) var total = 0

    init(pageSize: Int) {
        self.pageSize = pageSize
    }

    var hasMore: Bool { nextPage != nil }

    mutating func reset() {
        items = []
        nextPage = 1
        total = 0
    }

    mutating func append(_ page: Page<Item>) {
        if page.page <= 1 { items = [] }
        var seen = Set(items.map(\.id))
        for item in page.items where seen.insert(item.id).inserted {
            items.append(item)
        }
        total = page.total
        nextPage = page.nextPage
    }

    mutating func replace(_ item: Item) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        items[index] = item
    }

    mutating func prepend(_ item: Item) {
        items.removeAll { $0.id == item.id }
        items.insert(item, at: 0)
        total += 1
    }
}

/// Drives a paged list's `ViewState` through first load, refresh and
/// load-more without duplicating that bookkeeping in every view model.
@MainActor
final class PagedLoader<Item: Identifiable & Codable & Sendable> {
    private(set) var collection: PagedCollection<Item>
    private(set) var isLoadingMore = false
    private let fetch: (Int, Int) async throws -> Page<Item>

    init(pageSize: Int, fetch: @escaping (Int, Int) async throws -> Page<Item>) {
        self.collection = PagedCollection(pageSize: pageSize)
        self.fetch = fetch
    }

    /// Reloads page 1. Callers move their state to `.reloading()` first so
    /// current rows stay visible; on failure those rows are kept as stale.
    func refresh(current: ViewState<[Item]>) async -> ViewState<[Item]> {
        do {
            let page = try await fetch(1, collection.pageSize)
            collection.append(page)
            return state
        } catch {
            return current.failing(error)
        }
    }

    /// Current rows as a view state (`.empty` when there are none).
    var state: ViewState<[Item]> { .from(collection.items) }

    /// Fetches the next page; failures leave the loaded rows untouched and
    /// are returned for a non-blocking inline message.
    func loadMore() async -> UserFacingError? {
        guard let next = collection.nextPage, next > 1, !isLoadingMore else { return nil }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            collection.append(try await fetch(next, collection.pageSize))
            return nil
        } catch {
            return UserFacingError(error)
        }
    }

    func update(_ mutate: (inout PagedCollection<Item>) -> Void) {
        mutate(&collection)
    }
}
