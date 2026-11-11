import Foundation
import GoKineticCore
import GoKineticUI

/// Multi-step plan upgrade: choose tier → choose timing → review quote →
/// submit → track order. Modelled as an explicit state machine so illegal
/// transitions (e.g. submitting an expired quote) are impossible.
@MainActor
public final class UpgradeFlowViewModel: ObservableObject {
    public enum Step: Equatable {
        case selectPlan
        case quoting
        case review(UpgradeQuote)
        case submitting(UpgradeQuote)
        case submitted(Order)
        case failed(UserFacingError, recoverTo: RecoveryPoint)
    }

    public enum RecoveryPoint: Equatable {
        case selectPlan
        case review(UpgradeQuote)
    }

    @Published public private(set) var step: Step = .selectPlan
    @Published public var selectedPlanId: String?
    @Published public var timing: UpgradeTiming = .nextBillingCycle
    @Published public var acceptedTerms = false

    public let currentPlan: Plan
    public let options: [Plan]
    private let serviceId: String
    private let plans: PlanRepository
    private let analytics: AnalyticsTracking
    private let clock: Clock
    private let formatter: MoneyFormatter
    private let sleeper: Sleeper
    /// One key per review so a double-tap or network retry can't create two orders.
    private var submissionKey = UUID().uuidString
    private var pollTask: Task<Void, Never>?

    public init(serviceId: String, currentPlan: Plan, options: [Plan], plans: PlanRepository,
                analytics: AnalyticsTracking, clock: Clock, formatter: MoneyFormatter = MoneyFormatter(),
                sleeper: Sleeper = TaskSleeper()) {
        self.serviceId = serviceId
        self.currentPlan = currentPlan
        self.options = options
        self.plans = plans
        self.analytics = analytics
        self.clock = clock
        self.formatter = formatter
        self.sleeper = sleeper
        analytics.track(.planUpgradeStarted(fromPlanId: currentPlan.id))
    }

    deinit { pollTask?.cancel() }

    public var selectedPlan: Plan? {
        options.first { $0.id == selectedPlanId }
    }

    public var canRequestQuote: Bool {
        if case .selectPlan = step { return selectedPlan != nil }
        return false
    }

    public var canSubmit: Bool {
        guard case .review(let quote) = step else { return false }
        return acceptedTerms && !quote.isExpired(at: clock.now())
    }

    public func requestQuote() async {
        guard canRequestQuote, let plan = selectedPlan else { return }
        step = .quoting
        do {
            let quote = try await plans.quoteUpgrade(UpgradeQuoteRequest(serviceId: serviceId, targetPlanId: plan.id, timing: timing))
            guard quote.targetPlan.id == plan.id else {
                throw APIError.conflict(ProblemDetails(detail: "Quote does not match the selected plan"))
            }
            submissionKey = UUID().uuidString
            acceptedTerms = false
            step = .review(quote)
            analytics.track(.planUpgradeQuoted(targetPlanId: plan.id))
        } catch {
            step = .failed(UserFacingError(error), recoverTo: .selectPlan)
        }
    }

    public func submit() async {
        guard case .review(let quote) = step else { return }
        guard !quote.isExpired(at: clock.now()) else {
            // Re-quote rather than submitting a price the server will reject.
            step = .selectPlan
            await requestQuote()
            return
        }
        guard acceptedTerms else { return }
        step = .submitting(quote)
        do {
            let order = try await plans.submitUpgrade(quoteId: quote.quoteId, idempotencyKey: submissionKey)
            step = .submitted(order)
            analytics.track(.planUpgradeSubmitted(targetPlanId: quote.targetPlan.id, timing: timing.rawValue))
            startPolling(orderId: order.id)
        } catch APIError.conflict(let problem) where problem?.code == "quote-expired" {
            step = .selectPlan
            await requestQuote()
        } catch {
            step = .failed(UserFacingError(error), recoverTo: .review(quote))
        }
    }

    public func recover() {
        guard case .failed(_, let point) = step else { return }
        switch point {
        case .selectPlan: step = .selectPlan
        case .review(let quote): step = .review(quote)
        }
    }

    public func backToSelection() {
        switch step {
        case .review, .failed: step = .selectPlan
        default: break
        }
    }

    /// Polls the order until it reaches a terminal state, backing off from
    /// 3s to 30s. Stops when the view goes away.
    func startPolling(orderId: String, maxPolls: Int = 20) {
        pollTask?.cancel()
        let sleeper = self.sleeper
        pollTask = Task { [weak self] in
            var delay: TimeInterval = 3
            for _ in 0..<maxPolls {
                do { try await sleeper.sleep(seconds: delay) } catch { return }
                guard let self, !Task.isCancelled else { return }
                guard let order = try? await self.plans.order(id: orderId) else { continue }
                self.step = .submitted(order)
                if order.status.isTerminal { return }
                delay = min(delay * 2, 30)
            }
        }
    }

    public func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    // MARK: Presentation helpers

    public func reviewLines(for quote: UpgradeQuote) -> [(label: String, value: String)] {
        var lines: [(String, String)] = [
            (L10n.string("upgrade.newPlan"), "\(quote.targetPlan.name) · \(quote.targetPlan.speedLabel)"),
            (L10n.string("upgrade.newMonthly"), formatter.string(from: quote.newMonthlyPrice)),
            (L10n.string("upgrade.prorated"), formatter.string(from: quote.proratedCharge))
        ]
        lines += quote.oneTimeFees.map { ($0.description, formatter.string(from: $0.amount)) }
        if let due = try? quote.dueToday() {
            lines.append((L10n.string("upgrade.nextBillImpact"), formatter.string(from: due)))
        }
        return lines
    }

    public func secondsUntilQuoteExpires(_ quote: UpgradeQuote) -> Int {
        max(0, Int(quote.expiresAt.timeIntervalSince(clock.now())))
    }
}
