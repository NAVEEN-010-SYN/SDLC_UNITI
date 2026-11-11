import Foundation

extension Result where Failure == Error {
    /// Async counterpart of `Result(catching:)`, used to run independent
    /// loads in parallel with `async let` without one failure cancelling
    /// the others.
    static func capturing(_ body: () async throws -> Success) async -> Result<Success, Error> {
        do {
            return .success(try await body())
        } catch {
            return .failure(error)
        }
    }
}
