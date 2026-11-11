import Foundation
import GoKineticCore
import GoKineticUI

/// "My plan": current tier, contract status, pending change and the list
/// of faster tiers available at the service address.
@MainActor
public final class PlanViewModel: ObservableObject {
    public struct Content: Equatable {
        public let current: CurrentPlan
        public let upgrades: [UpgradeOption]
        public let contractMonthsRemaining: Int
    }

    public struct UpgradeOption: Equatable, Identifiable {
        public let plan: Plan
        public let priceText: String
        public let deltaText: String
        public let speedMultiplierText: String?
        public let isRecommended: Bool
        public var id: String { plan.id }
    }

    @Published public private(set) var state: ViewState<Content> = .idle

    public let serviceId: String
    private let plans: PlanRepository
    private let clock: Clock
    private let formatter: MoneyFormatter

    public init(serviceId: String, plans: PlanRepository, clock: Clock, formatter: MoneyFormatter = MoneyFormatter()) {
        self.serviceId = serviceId
        self.plans = plans
        self.clock = clock
        self.formatter = formatter
    }

    public func load() async {
        state = state.reloading()
        do {
            async let currentTask = plans.currentPlan(serviceId: serviceId)
            async let catalogTask = plans.availablePlans(serviceId: serviceId)
            let (current, catalog) = try await (currentTask, catalogTask)
            state = .loaded(Content(
                current: current,
                upgrades: makeOptions(current: current.plan, catalog: catalog),
                contractMonthsRemaining: current.monthsRemaining(asOf: clock.now())
            ))
        } catch {
            state = state.failing(error)
        }
    }

    /// Only genuine upgrades, priced against the current plan. The cheapest
    /// option at least twice as fast is flagged as recommended.
    func makeOptions(current: Plan, catalog: [Plan]) -> [UpgradeOption] {
        let upgrades = catalog
            .filter { $0.id != current.id && $0.isUpgrade(from: current) && $0.monthlyPrice.currency == current.monthlyPrice.currency }
            .sorted { $0.downloadMbps < $1.downloadMbps }
        let recommendedId = upgrades
            .filter { $0.downloadMbps >= current.downloadMbps * 2 }
            .min { $0.monthlyPrice < $1.monthlyPrice }?.id

        return upgrades.map { plan in
            let delta = (try? plan.monthlyPrice.subtracting(current.monthlyPrice)) ?? .zero(plan.monthlyPrice.currency)
            let deltaText: String
            if delta.isPositive {
                deltaText = L10n.string("plan.deltaMore", formatter.compactString(from: delta))
            } else if delta.isNegative {
                deltaText = L10n.string("plan.deltaLess", formatter.compactString(from: delta.absolute))
            } else {
                deltaText = L10n.string("plan.deltaSame")
            }
            let multiplier = current.downloadMbps > 0 ? Double(plan.downloadMbps) / Double(current.downloadMbps) : 0
            let multiplierText = multiplier >= 1.5 ? String(format: "%.0f×", multiplier.rounded()) : nil
            return UpgradeOption(plan: plan,
                                 priceText: formatter.compactString(from: plan.monthlyPrice) + L10n.Common.perMonth,
                                 deltaText: deltaText,
                                 speedMultiplierText: multiplierText,
                                 isRecommended: plan.id == recommendedId)
        }
    }

    /// Upgrades are blocked while another plan change is in flight.
    public var canStartUpgrade: Bool {
        guard let content = state.value else { return false }
        if let pending = content.current.pendingChange, !pending.status.isTerminal { return false }
        return !content.upgrades.isEmpty
    }
}
