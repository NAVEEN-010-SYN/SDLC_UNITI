import Foundation
import GoKineticCore
import GoKineticUI

/// Runs a speed test, shows live progress, and judges the result against
/// the customer's plan.
@MainActor
public final class SpeedTestViewModel: ObservableObject {
    public enum Phase: Equatable {
        case ready
        case running(SpeedTestPhase)
        case finished(SpeedTestResult, SpeedTestResult.Verdict?)
        case failed(UserFacingError)
    }

    @Published public private(set) var phase: Phase = .ready
    @Published public private(set) var history: [SpeedTestResult] = []

    private let speedTest: SpeedTestRunning
    private let plan: Plan?
    private let analytics: AnalyticsTracking
    private let onResult: (SpeedTestResult) -> Void
    private var runTask: Task<Void, Never>?

    public init(speedTest: SpeedTestRunning, plan: Plan?, analytics: AnalyticsTracking,
                onResult: @escaping (SpeedTestResult) -> Void = { _ in }) {
        self.speedTest = speedTest
        self.plan = plan
        self.analytics = analytics
        self.onResult = onResult
    }

    deinit { runTask?.cancel() }

    public var isRunning: Bool {
        if case .running = phase { return true }
        return false
    }

    /// Gauge ceiling: the plan's tier, so a full dial means "as sold".
    public var gaugeMaxMbps: Double { Double(plan?.downloadMbps ?? 1000) }

    public func loadHistory() async {
        history = (try? await speedTest.history()) ?? []
    }

    public func start() {
        guard !isRunning else { return }
        phase = .running(.selectingServer)
        runTask = Task { [weak self] in await self?.consume() }
    }

    public func cancel() {
        runTask?.cancel()
        runTask = nil
        if isRunning { phase = .ready }
    }

    private func consume() async {
        do {
            for try await update in speedTest.run() {
                if case .finished(let result) = update {
                    complete(with: result)
                } else {
                    phase = .running(update)
                }
            }
        } catch is CancellationError {
            phase = .ready
        } catch {
            phase = .failed(UserFacingError(error))
        }
    }

    func complete(with result: SpeedTestResult) {
        let verdict = plan.map { result.verdict(against: $0) }
        phase = .finished(result, verdict)
        history = [result] + history.filter { $0.id != result.id }
        analytics.track(.speedTestCompleted(downloadMbps: Int(result.downloadMbps.rounded()), verdict: verdict?.rawValue ?? "unknown"))
        onResult(result)
    }

    /// Live reading for the gauge while running.
    public var currentMbps: Double {
        switch phase {
        case .running(.download(let mbps, _)), .running(.upload(let mbps, _)): return mbps
        case .finished(let result, _): return result.downloadMbps
        default: return 0
        }
    }

    public var phaseLabelKey: String {
        switch phase {
        case .ready: return "speedtest.ready"
        case .running(.selectingServer): return "speedtest.server"
        case .running(.latency): return "speedtest.latency"
        case .running(.download): return "speedtest.download"
        case .running(.upload): return "speedtest.upload"
        case .running(.finished), .finished: return "speedtest.done"
        case .failed: return "speedtest.failed"
        }
    }
}
