import Foundation
import GoKineticCore
import GoKineticUI

/// Service status: overall health verdict plus the outage list, refreshed
/// periodically while the screen is visible.
@MainActor
public final class OutagesViewModel: ObservableObject {
    public struct Content: Equatable {
        public let health: ServiceHealth
        public let active: [Outage]
        public let resolved: [Outage]
    }

    public struct OutageRow: Equatable, Identifiable {
        public let outage: Outage
        public let timingText: String
        public let isDelayed: Bool
        public var id: String { outage.id }
    }

    /// Resolved incidents older than this are not interesting to customers.
    static let resolvedLookback: TimeInterval = 72 * 3600

    @Published public private(set) var state: ViewState<Content> = .idle
    @Published public private(set) var lastUpdated: Date?

    public let serviceId: String
    private let outages: OutageRepository
    private let router: RouterRepository
    private let clock: Clock
    private let sleeper: Sleeper
    private let refreshInterval: TimeInterval
    private let dateFormatter: DisplayDateFormatter
    private var refreshTask: Task<Void, Never>?

    public init(serviceId: String, outages: OutageRepository, router: RouterRepository, clock: Clock,
                sleeper: Sleeper = TaskSleeper(), refreshInterval: TimeInterval = 120,
                dateFormatter: DisplayDateFormatter = DisplayDateFormatter()) {
        self.serviceId = serviceId
        self.outages = outages
        self.router = router
        self.clock = clock
        self.sleeper = sleeper
        self.refreshInterval = refreshInterval
        self.dateFormatter = dateFormatter
    }

    deinit { refreshTask?.cancel() }

    /// Outages are required; router telemetry only sharpens the verdict, so
    /// its failure is tolerated.
    public func load() async {
        state = state.reloading()
        async let routerStatus = Result.capturing { try await router.status(serviceId: serviceId) }
        do {
            let list = try await outages.outages(serviceId: serviceId)
            let status = try? await routerStatus.get()
            state = .loaded(makeContent(outages: list, router: status))
            lastUpdated = clock.now()
        } catch {
            _ = await routerStatus
            state = state.failing(error)
        }
    }

    func makeContent(outages list: [Outage], router status: RouterStatus?) -> Content {
        let now = clock.now()
        let active = list.filter(\.isActive)
        let resolved = list
            .filter { outage in outage.resolvedAt.map { now.timeIntervalSince($0) <= Self.resolvedLookback } ?? false }
            .sorted { ($0.resolvedAt ?? .distantPast) > ($1.resolvedAt ?? .distantPast) }
        let health = ServiceHealthEvaluator.evaluate(outages: list, router: status, latestSpeedTest: nil, plan: nil, now: now)
        return Content(health: health, active: active, resolved: resolved)
    }

    public func row(for outage: Outage) -> OutageRow {
        let now = clock.now()
        let timing: String
        if let resolvedAt = outage.resolvedAt {
            timing = L10n.string("outage.resolvedAt", dateFormatter.relative(resolvedAt, to: now))
        } else if outage.isPastEstimate(at: now) {
            timing = L10n.string("outage.delayed")
        } else if let eta = outage.estimatedResolution {
            timing = L10n.string("outage.eta", dateFormatter.time(eta))
        } else {
            timing = L10n.string("outage.started", dateFormatter.relative(outage.startedAt, to: now))
        }
        return OutageRow(outage: outage, timingText: timing, isDelayed: outage.isPastEstimate(at: now))
    }

    public func healthTone(_ health: ServiceHealth) -> Tone {
        switch health {
        case .operational: return .success
        case .maintenance: return .info
        case .degraded: return .warning
        case .outage: return .danger
        case .unknown: return .neutral
        }
    }

    public func startAutoRefresh() {
        guard refreshTask == nil else { return }
        let sleeper = self.sleeper, interval = refreshInterval
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                do { try await sleeper.sleep(seconds: interval) } catch { return }
                guard let self else { return }
                await self.load()
            }
        }
    }

    public func stopAutoRefresh() {
        refreshTask?.cancel()
        refreshTask = nil
    }
}
