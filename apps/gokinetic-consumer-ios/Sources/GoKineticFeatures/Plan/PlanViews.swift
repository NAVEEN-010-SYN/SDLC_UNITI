import SwiftUI
import GoKineticCore
import GoKineticUI

public struct PlanView: View {
    @StateObject private var viewModel: PlanViewModel
    private let makeUpgradeFlow: (CurrentPlan, [Plan]) -> UpgradeFlowViewModel
    @State private var showingUpgrade = false
    private let dateFormatter = DisplayDateFormatter()

    public init(viewModel: @autoclosure @escaping () -> PlanViewModel,
                makeUpgradeFlow: @escaping (CurrentPlan, [Plan]) -> UpgradeFlowViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
        self.makeUpgradeFlow = makeUpgradeFlow
    }

    public var body: some View {
        ScrollView {
            AsyncContentView(state: viewModel.state, emptyTitle: L10n.string("plan.none"),
                             retry: { Task { await viewModel.load() } }) { content in
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    currentPlanCard(content)
                    if let pending = content.current.pendingChange {
                        Banner(title: L10n.string("plan.pendingChange", pending.targetPlanName),
                               message: L10n.string("order.status.\(pending.status.rawValue.lowercased())"),
                               tone: pending.status.tone)
                    }
                    if !content.upgrades.isEmpty {
                        Text(L10n.string("plan.upgrades")).font(Theme.Typography.headline)
                        ForEach(content.upgrades) { option in upgradeRow(option) }
                        PrimaryButton(L10n.string("plan.startUpgrade"), isEnabled: viewModel.canStartUpgrade) {
                            showingUpgrade = true
                        }
                    }
                }
                .sheet(isPresented: $showingUpgrade) {
                    NavigationStack {
                        UpgradeFlowView(viewModel: makeUpgradeFlow(content.current, content.upgrades.map(\.plan)))
                    }
                }
            }
            .padding(Theme.Spacing.l)
        }
        .refreshable { await viewModel.load() }
        .navigationTitle(L10n.Tabs.plan)
    }

    private func currentPlanCard(_ content: PlanViewModel.Content) -> some View {
        let plan = content.current.plan
        return Card(title: L10n.string("plan.current")) {
            Text(plan.name).font(Theme.Typography.title)
            HStack(spacing: Theme.Spacing.m) {
                StatTile(value: Plan.speedLabel(mbps: plan.downloadMbps), caption: L10n.string("plan.download"), symbol: "arrow.down")
                StatTile(value: Plan.speedLabel(mbps: plan.uploadMbps), caption: L10n.string("plan.upload"), symbol: "arrow.up")
            }
            Text(MoneyFormatter().compactString(from: plan.monthlyPrice) + L10n.Common.perMonth)
                .font(Theme.Typography.headline)
            if let end = content.current.contractEndDate, content.contractMonthsRemaining > 0 {
                Text(L10n.string("plan.contractEnds", dateFormatter.longDate(end), content.contractMonthsRemaining))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            ForEach(plan.features, id: \.self) { feature in
                Label(feature, systemImage: "checkmark").font(.subheadline)
            }
        }
    }

    private func upgradeRow(_ option: PlanViewModel.UpgradeOption) -> some View {
        Card {
            HStack {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    HStack {
                        Text(option.plan.name).font(Theme.Typography.headline)
                        if option.isRecommended { StatusBadge(L10n.string("plan.recommended"), tone: .success) }
                    }
                    Text(option.plan.speedLabel + (option.speedMultiplierText.map { " \u{00B7} \($0)" } ?? ""))
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing) {
                    Text(option.priceText).font(Theme.Typography.headline)
                    Text(option.deltaText).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
}

public struct UpgradeFlowView: View {
    @StateObject private var viewModel: UpgradeFlowViewModel
    @Environment(\.dismiss) private var dismiss

    public init(viewModel: @autoclosure @escaping () -> UpgradeFlowViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        Group {
            switch viewModel.step {
            case .selectPlan:
                selection
            case .quoting:
                ProgressView(L10n.string("upgrade.quoting"))
            case .review(let quote), .submitting(let quote):
                review(quote)
            case .submitted(let order):
                submitted(order)
            case .failed(let error, _):
                ErrorStateView(error: error) { viewModel.recover() }
            }
        }
        .padding(Theme.Spacing.l)
        .navigationTitle(L10n.string("upgrade.title"))
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L10n.Common.cancel) { dismiss() }
            }
        }
        .onDisappear { viewModel.stopPolling() }
    }

    private var selection: some View {
        Form {
            Picker(L10n.string("upgrade.choosePlan"), selection: $viewModel.selectedPlanId) {
                Text(L10n.string("upgrade.choosePlan")).tag(String?.none)
                ForEach(viewModel.options) { plan in
                    Text("\(plan.name) \u{00B7} \(plan.speedLabel)").tag(Optional(plan.id))
                }
            }
            Picker(L10n.string("upgrade.timing"), selection: $viewModel.timing) {
                Text(L10n.string("upgrade.timing.immediate")).tag(UpgradeTiming.immediate)
                Text(L10n.string("upgrade.timing.nextCycle")).tag(UpgradeTiming.nextBillingCycle)
            }
            .pickerStyle(.segmented)
            PrimaryButton(L10n.Common.continueAction, isEnabled: viewModel.canRequestQuote) {
                Task { await viewModel.requestQuote() }
            }
        }
    }

    private func review(_ quote: UpgradeQuote) -> some View {
        let isSubmitting: Bool = { if case .submitting = viewModel.step { return true }; return false }()
        return VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            Card(title: L10n.string("upgrade.review")) {
                ForEach(Array(viewModel.reviewLines(for: quote).enumerated()), id: \.offset) { _, line in
                    HStack {
                        Text(line.label).foregroundStyle(.secondary)
                        Spacer()
                        Text(line.value).monospacedDigit()
                    }
                }
            }
            Text(L10n.string("upgrade.quoteExpires", viewModel.secondsUntilQuoteExpires(quote) / 60))
                .font(.footnote).foregroundStyle(.secondary)
            Toggle(L10n.string("upgrade.acceptTerms"), isOn: $viewModel.acceptedTerms)
            Spacer()
            PrimaryButton(L10n.string("upgrade.confirm"), isLoading: isSubmitting, isEnabled: viewModel.canSubmit) {
                Task { await viewModel.submit() }
            }
            SecondaryButton(L10n.string("upgrade.changePlan")) { viewModel.backToSelection() }
        }
    }

    private func submitted(_ order: Order) -> some View {
        VStack(spacing: Theme.Spacing.l) {
            Image(systemName: order.status == .failed ? "xmark.circle" : "checkmark.seal.fill")
                .font(.system(size: 56))
                .foregroundStyle(order.status.tone.color)
            Text(L10n.string("upgrade.submitted")).font(Theme.Typography.title)
            OrderProgressView(status: order.status)
            Text(L10n.string("upgrade.orderReference", order.id)).font(.footnote).foregroundStyle(.secondary)
            PrimaryButton(L10n.Common.done) { dismiss() }
        }
    }
}

/// Horizontal tracker along DRAFT -> SUBMITTED -> VALIDATED -> PROVISIONING -> ACTIVE.
struct OrderProgressView: View {
    let status: OrderStatus

    var body: some View {
        HStack(spacing: Theme.Spacing.xs) {
            ForEach(Array(OrderStatus.happyPath.dropFirst().enumerated()), id: \.offset) { _, step in
                let reached = (status.progressIndex ?? -1) >= (step.progressIndex ?? 0)
                VStack(spacing: Theme.Spacing.xs) {
                    Capsule()
                        .fill(reached ? status.tone.color : Theme.Palette.separator)
                        .frame(height: 6)
                    Text(L10n.string("order.status.\(step.rawValue.lowercased())"))
                        .font(.caption2)
                        .foregroundStyle(reached ? .primary : .secondary)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.string("order.status.\(status.rawValue.lowercased())"))
    }
}
