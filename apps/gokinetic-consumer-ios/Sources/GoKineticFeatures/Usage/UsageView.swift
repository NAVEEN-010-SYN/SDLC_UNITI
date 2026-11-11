import SwiftUI
import GoKineticCore
import GoKineticUI

public struct UsageView: View {
    @StateObject private var viewModel: UsageViewModel

    public init(viewModel: @autoclosure @escaping () -> UsageViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                Picker(L10n.string("usage.period"), selection: Binding(
                    get: { viewModel.period },
                    set: { period in Task { await viewModel.select(period: period) } }
                )) {
                    ForEach(UsagePeriod.allCases) { period in
                        Text(L10n.string("usage.period.\(period.rawValue.lowercased())")).tag(period)
                    }
                }
                .pickerStyle(.segmented)

                AsyncContentView(state: viewModel.state, emptyTitle: L10n.string("usage.empty"), emptySymbol: "chart.bar",
                                 retry: { Task { await viewModel.load(forceRefresh: true) } }) { content in
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        if let cap = viewModel.capSummary { capCard(cap) }
                        chartCard(content)
                        statsGrid(content)
                    }
                }
            }
            .padding(Theme.Spacing.l)
        }
        .refreshable { await viewModel.load(forceRefresh: true) }
        .navigationTitle(L10n.string("usage.title"))
    }

    private func capCard(_ cap: UsageViewModel.CapSummary) -> some View {
        Card(title: L10n.string(cap.titleKey)) {
            Meter(fraction: cap.fraction, tone: cap.tone)
            Text(cap.detail).font(.footnote).foregroundStyle(.secondary)
        }
    }

    private func chartCard(_ content: UsageViewModel.Content) -> some View {
        Card {
            if let summary = viewModel.selectionSummary {
                HStack {
                    Text(summary.title).font(Theme.Typography.headline)
                    Spacer()
                    Label(summary.download, systemImage: "arrow.down").font(.subheadline)
                    Label(summary.upload, systemImage: "arrow.up").font(.subheadline)
                }
                .monospacedDigit()
            }
            UsageChart(points: content.points, unit: content.report.period.chartUnit,
                       averageGB: content.averageGB, selectedDate: $viewModel.selectedDate)
            if viewModel.selectedDate != nil {
                Button(L10n.string("usage.clearSelection")) { viewModel.selectedDate = nil }
                    .font(.footnote)
            }
        }
    }

    private func statsGrid(_ content: UsageViewModel.Content) -> some View {
        let insights = content.insights
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Theme.Spacing.m) {
            StatTile(value: DataSizeFormatter.string(fromBytes: insights.total), caption: L10n.string("usage.total"), symbol: "sum")
            StatTile(value: DataSizeFormatter.string(fromBytes: insights.averagePerDay), caption: L10n.string("usage.dailyAverage"),
                     symbol: "calendar")
            StatTile(value: DataSizeFormatter.string(fromBytes: insights.projectedCycleTotal), caption: L10n.string("usage.projected"),
                     symbol: "chart.line.uptrend.xyaxis")
            StatTile(value: "\(Int((insights.downloadShare * 100).rounded()))%", caption: L10n.string("usage.downloadShare"),
                     symbol: "arrow.down.circle")
            if let peak = content.peakHour {
                StatTile(value: L10n.string("usage.hourLabel", peak), caption: L10n.string("usage.peakHour"), symbol: "clock")
            }
            StatTile(value: "\(insights.daysLeftInCycle)", caption: L10n.string("usage.daysLeft"), symbol: "hourglass")
        }
    }
}
