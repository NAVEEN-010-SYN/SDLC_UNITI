import Foundation
import GoKineticCore
import GoKineticUI

/// Data usage for the primary service with a chart, cap tracking and a
/// remembered period choice.
@MainActor
public final class UsageViewModel: ObservableObject {
    public struct Content: Equatable {
        public let report: UsageReport
        public let insights: UsageInsights
        public let points: [UsageChartPoint]
        public let averageGB: Double?
        public let peakHour: Int?
    }

    public struct CapSummary: Equatable {
        public let fraction: Double
        public let titleKey: String
        public let detail: String
        public let tone: Tone
    }

    @Published public private(set) var state: ViewState<Content> = .idle
    @Published public private(set) var period: UsagePeriod
    @Published public var selectedDate: Date?

    public let serviceId: String
    private let usage: UsageRepository
    private let preferences: PreferencesStore
    private let clock: Clock
    private let calendar: Calendar
    private let dateFormatter: DisplayDateFormatter
    private var loadGeneration = 0

    public init(serviceId: String, usage: UsageRepository, preferences: PreferencesStore, clock: Clock,
                calendar: Calendar = .current, dateFormatter: DisplayDateFormatter = DisplayDateFormatter()) {
        self.serviceId = serviceId
        self.usage = usage
        self.preferences = preferences
        self.clock = clock
        self.calendar = calendar
        self.dateFormatter = dateFormatter
        self.period = preferences.preferredUsagePeriod
    }

    public func load(forceRefresh: Bool = false) async {
        loadGeneration += 1
        let generation = loadGeneration
        let requested = period
        state = state.reloading()
        do {
            let report = try await usage.usage(serviceId: serviceId, period: requested, forceRefresh: forceRefresh)
            // A quicker response for a newer period choice may already be on screen.
            guard generation == loadGeneration else { return }
            state = report.samples.isEmpty ? .empty : .loaded(makeContent(report))
            selectedDate = nil
        } catch {
            guard generation == loadGeneration else { return }
            state = state.failing(error)
        }
    }

    public func select(period newPeriod: UsagePeriod) async {
        guard newPeriod != period else { return }
        period = newPeriod
        preferences.preferredUsagePeriod = newPeriod
        await load()
    }

    func makeContent(_ report: UsageReport) -> Content {
        let unit = report.period.chartUnit
        let buckets = UsageInsights.rebucket(report.samples, to: unit, calendar: calendar)
        let insights = UsageInsights(report: report, now: clock.now(), calendar: calendar)
        let average = buckets.isEmpty ? nil
            : DataSizeFormatter.gigabytes(fromBytes: buckets.reduce(0) { $0 + $1.totalBytes }) / Double(buckets.count)
        return Content(report: report, insights: insights,
                       points: UsageChartPoint.points(from: buckets),
                       averageGB: buckets.count > 1 ? average : nil,
                       peakHour: report.period == .day ? nil : UsageInsights.peakHour(report.samples, calendar: calendar))
    }

    public var capSummary: CapSummary? {
        guard let content = state.value, let cap = content.report.dataCapBytes, cap > 0 else { return nil }
        let insights = content.insights
        let fraction = Double(insights.total) / Double(cap)
        let capText = DataSizeFormatter.string(fromBytes: cap)
        switch insights.capStatus {
        case .unlimited:
            return nil
        case .withinCap:
            return CapSummary(fraction: fraction, titleKey: "usage.cap.ok",
                              detail: L10n.string("usage.cap.usedOf", DataSizeFormatter.string(fromBytes: insights.total), capText),
                              tone: .info)
        case .approaching:
            return CapSummary(fraction: fraction, titleKey: "usage.cap.approaching",
                              detail: budgetText(insights) ?? capText, tone: .warning)
        case .projectedToExceed(let projected):
            return CapSummary(fraction: fraction, titleKey: "usage.cap.projected",
                              detail: L10n.string("usage.cap.projectedDetail", DataSizeFormatter.string(fromBytes: projected), capText),
                              tone: .warning)
        case .exceeded(let overage):
            return CapSummary(fraction: fraction, titleKey: "usage.cap.exceeded",
                              detail: L10n.string("usage.cap.overBy", DataSizeFormatter.string(fromBytes: overage)),
                              tone: .danger)
        }
    }

    private func budgetText(_ insights: UsageInsights) -> String? {
        guard let budget = insights.dailyBudget, insights.daysLeftInCycle > 0 else { return nil }
        return L10n.string("usage.cap.dailyBudget", DataSizeFormatter.string(fromBytes: budget), insights.daysLeftInCycle)
    }

    /// Totals for the bar under the finger, or the whole period otherwise.
    public var selectionSummary: (title: String, download: String, upload: String)? {
        guard let content = state.value else { return nil }
        let unit = content.report.period.chartUnit
        let matching = content.points.filter { point in
            selectedDate.map { calendar.isDate(point.date, equalTo: $0, toGranularity: unit) } ?? true
        }
        guard !matching.isEmpty else { return nil }
        func total(_ series: UsageChartPoint.Series) -> String {
            let gb = matching.filter { $0.series == series }.reduce(0) { $0 + $1.gigabytes }
            return DataSizeFormatter.string(fromBytes: Int64((gb * 1_000_000_000).rounded()))
        }
        let title: String
        if let date = selectedDate {
            title = unit == .hour ? dateFormatter.time(date) : dateFormatter.shortDate(date)
        } else {
            title = dateFormatter.period(from: content.report.cycleStart, to: content.report.cycleEnd)
        }
        return (title, total(.download), total(.upload))
    }
}
