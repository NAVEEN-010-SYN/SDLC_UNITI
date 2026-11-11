import SwiftUI
import GoKineticCore
import GoKineticUI

public struct OutagesView: View {
    @StateObject private var viewModel: OutagesViewModel
    private let dateFormatter = DisplayDateFormatter()

    public init(viewModel: @autoclosure @escaping () -> OutagesViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        List {
            AsyncContentView(state: viewModel.state, emptyTitle: L10n.string("health.unknown"),
                             retry: { Task { await viewModel.load() } }) { content in
                Section {
                    healthHeader(content.health)
                }
                Section(L10n.string("outages.active")) {
                    if content.active.isEmpty {
                        Text(L10n.string("outages.noneActive")).foregroundStyle(.secondary)
                    }
                    ForEach(content.active) { outage in outageRow(viewModel.row(for: outage)) }
                }
                if !content.resolved.isEmpty {
                    Section(L10n.string("outages.recentlyResolved")) {
                        ForEach(content.resolved) { outage in outageRow(viewModel.row(for: outage)) }
                    }
                }
            }
            if let updated = viewModel.lastUpdated {
                Text(L10n.string("outages.lastUpdated", dateFormatter.time(updated)))
                    .font(.caption).foregroundStyle(.secondary)
                    .listRowBackground(Color.clear)
            }
        }
        .refreshable { await viewModel.load() }
        .navigationTitle(L10n.string("outages.title"))
        .onAppear { viewModel.startAutoRefresh() }
        .onDisappear { viewModel.stopAutoRefresh() }
    }

    private func healthHeader(_ health: ServiceHealth) -> some View {
        let tone = viewModel.healthTone(health)
        return VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Label(L10n.string(health.headlineKey), systemImage: tone.symbol)
                .font(Theme.Typography.headline)
                .foregroundStyle(tone.color)
            if case .degraded(let issues) = health {
                ForEach(issues, id: \.self) { issue in
                    Text("\u{2022} " + L10n.string(issue.messageKey)).font(.subheadline)
                }
            }
            if health.suggestsTroubleshooting {
                NavigationLink(value: AppRoute.troubleshoot) {
                    Text(L10n.string("outages.troubleshoot"))
                }
            }
        }
        .padding(.vertical, Theme.Spacing.xs)
    }

    private func outageRow(_ row: OutagesViewModel.OutageRow) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                Text(row.outage.title).font(Theme.Typography.headline)
                Spacer()
                StatusBadge(L10n.string("outage.severity.\(row.outage.severity.rawValue.lowercased())"), tone: row.outage.severity.tone)
            }
            Text(row.outage.detail).font(.subheadline).foregroundStyle(.secondary)
            HStack(spacing: Theme.Spacing.s) {
                if row.outage.affectsMyService && row.outage.isActive {
                    StatusBadge(L10n.string("outage.affectsYou"), tone: .warning)
                }
                Text(row.timingText).font(.caption)
                    .foregroundStyle(row.isDelayed ? Theme.Palette.warning : .secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
