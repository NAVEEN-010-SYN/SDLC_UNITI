import SwiftUI
import Charts
import GoKineticCore

/// Chart-ready point. Values are in GB so axis labels stay readable.
public struct UsageChartPoint: Identifiable, Equatable {
    public enum Series: String, CaseIterable {
        case download = "Download"
        case upload = "Upload"
    }

    public let id: String
    public let date: Date
    public let series: Series
    public let gigabytes: Double

    public init(date: Date, series: Series, gigabytes: Double) {
        self.id = "\(date.timeIntervalSince1970)-\(series.rawValue)"
        self.date = date
        self.series = series
        self.gigabytes = gigabytes
    }

    /// Splits each sample into stacked download/upload bars.
    public static func points(from samples: [UsageSample]) -> [UsageChartPoint] {
        samples.flatMap { sample in
            [UsageChartPoint(date: sample.timestamp, series: .download, gigabytes: DataSizeFormatter.gigabytes(fromBytes: sample.downloadBytes)),
             UsageChartPoint(date: sample.timestamp, series: .upload, gigabytes: DataSizeFormatter.gigabytes(fromBytes: sample.uploadBytes))]
        }
    }
}

/// Stacked bar chart of usage with an optional average rule line and
/// tap-to-inspect selection.
public struct UsageChart: View {
    private let points: [UsageChartPoint]
    private let unit: Calendar.Component
    private let averageGB: Double?
    @Binding private var selectedDate: Date?

    public init(points: [UsageChartPoint], unit: Calendar.Component, averageGB: Double?, selectedDate: Binding<Date?>) {
        self.points = points
        self.unit = unit
        self.averageGB = averageGB
        self._selectedDate = selectedDate
    }

    public var body: some View {
        Chart {
            ForEach(points) { point in
                BarMark(
                    x: .value("Date", point.date, unit: unit),
                    y: .value("GB", point.gigabytes)
                )
                .foregroundStyle(by: .value("Direction", point.series.rawValue))
                .opacity(isHighlighted(point) ? 1 : 0.35)
            }
            if let averageGB {
                RuleMark(y: .value("Average", averageGB))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    .foregroundStyle(.secondary)
                    .annotation(position: .top, alignment: .trailing) {
                        Text(String(format: "avg %.1f GB", averageGB))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
            }
        }
        .chartForegroundStyleScale([
            UsageChartPoint.Series.download.rawValue: Theme.Palette.brand,
            UsageChartPoint.Series.upload.rawValue: Theme.Palette.accent
        ])
        .chartYAxisLabel("GB")
        .chartOverlay { proxy in
            GeometryReader { geometry in
                Rectangle().fill(.clear).contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                let origin = geometry[proxy.plotAreaFrame].origin
                                let x = value.location.x - origin.x
                                selectedDate = proxy.value(atX: x, as: Date.self)
                            }
                            .onEnded { _ in }
                    )
            }
        }
        .frame(height: 220)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilitySummary)
    }

    private func isHighlighted(_ point: UsageChartPoint) -> Bool {
        guard let selectedDate else { return true }
        return Calendar.current.isDate(point.date, equalTo: selectedDate, toGranularity: unit)
    }

    private var accessibilitySummary: String {
        let total = points.reduce(0) { $0 + $1.gigabytes }
        return String(format: "Usage chart, %d periods, %.1f gigabytes total", Set(points.map(\.date)).count, total)
    }
}

/// Radial gauge for the live speed test.
public struct SpeedGauge: View {
    private let mbps: Double
    private let maxMbps: Double
    private let label: String

    public init(mbps: Double, maxMbps: Double, label: String) {
        self.mbps = mbps
        self.maxMbps = max(maxMbps, 1)
        self.label = label
    }

    public var body: some View {
        let fraction = min(mbps / maxMbps, 1)
        ZStack {
            Circle()
                .trim(from: 0, to: 0.75)
                .stroke(Theme.Palette.separator, style: StrokeStyle(lineWidth: 16, lineCap: .round))
                .rotationEffect(.degrees(135))
            Circle()
                .trim(from: 0, to: 0.75 * fraction)
                .stroke(Theme.Palette.brand, style: StrokeStyle(lineWidth: 16, lineCap: .round))
                .rotationEffect(.degrees(135))
                .animation(.easeOut(duration: 0.3), value: fraction)
            VStack(spacing: Theme.Spacing.xs) {
                Text(SpeedFormatter.string(mbps: mbps))
                    .font(Theme.Typography.metric)
                Text(label)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 220, height: 220)
        .accessibilityElement(children: .combine)
    }
}
