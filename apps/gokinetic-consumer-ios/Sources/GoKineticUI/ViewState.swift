import Foundation
import GoKineticCore

/// Uniform load state for screens. View models expose one of these per
/// asynchronously-loaded section so every screen handles loading, empty
/// and error states the same way.
public enum ViewState<Value> {
    case idle
    case loading(previous: Value?)
    case loaded(Value)
    case empty
    case failed(UserFacingError, previous: Value?)

    public var value: Value? {
        switch self {
        case .loaded(let value): return value
        case .loading(let previous), .failed(_, let previous): return previous
        case .idle, .empty: return nil
        }
    }

    public var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }

    public var error: UserFacingError? {
        if case .failed(let error, _) = self { return error }
        return nil
    }

    /// Moves to loading while keeping whatever is on screen (pull to refresh).
    public func reloading() -> ViewState<Value> {
        .loading(previous: value)
    }

    /// Moves to failed while keeping stale content visible.
    public func failing(_ error: Error) -> ViewState<Value> {
        .failed(UserFacingError(error), previous: value)
    }
}

extension ViewState: Equatable where Value: Equatable {
    public static func == (lhs: ViewState<Value>, rhs: ViewState<Value>) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle), (.empty, .empty): return true
        case let (.loading(a), .loading(b)): return a == b
        case let (.loaded(a), .loaded(b)): return a == b
        case let (.failed(e1, a), .failed(e2, b)): return e1 == e2 && a == b
        default: return false
        }
    }
}

public extension ViewState where Value: Collection {
    /// Maps an empty collection to `.empty` so screens show their empty state.
    static func from(_ collection: Value) -> ViewState<Value> {
        collection.isEmpty ? .empty : .loaded(collection)
    }
}
