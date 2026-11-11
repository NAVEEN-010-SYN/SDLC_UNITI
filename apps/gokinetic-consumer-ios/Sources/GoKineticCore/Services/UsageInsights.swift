import Foundation

public enum DataCapStatus: Equatable, Sendable {
    case unlimited
    case withinCap(fraction: Double)
    /// At or above the warning threshold but on track to stay under the cap.
    case approaching(fraction: Double)
    case projectedToExceed(projectedBytes: Int64)
    case exceeded(overageBytes: Int64)

    public static let warningThreshold = 0.8

    public var needsAttention: Bool {
        switch self {
        case .unlimited, .withinCap: return false
        case .approaching, .projectedToExceed, .exceeded: return true
        }
    }
}

public struct DailyUsage: Equatable, Hashable, Sendable, Identifiable {
    public let day: Date
    public let downloadBytes: Int64
    public let uploadBytes: Int64

    public init(day: Date, downloadBytes: Int64, uploadBytes: Int64) {
        self.day = day
        self.downloadBytes = downloadBytes
        self.uploadBytes = uploadBytes
    }

    public var id: Date { day }
    public var totalBytes: Int64 { downloadBytes + uploadBytes }
}

/// Derived figures for the usage screen: per-day totals, cap position,
/// projection and a daily budget for the rest of the billing cycle.
public struct UsageInsights: Equatable, Sendable {
    public let total: Int64
    public let days: [DailyUsage]
    public let averagePerDay: Int64
    public let busiestDay: DailyUsage?
    public let projectedCycleTotal: Int64
    public let daysLeftInCycle: Int
    public let capStatus: DataCapStatus
    /// Bytes per day that keep the customer under the cap; nil when unlimited.
    public let dailyBudget: Int64?
    /// Share of traffic that is download, 0...1.
    public let downloadShare: Double

    public init(report: UsageReport, now: Date, calendar: Calendar = .gregorianUTC) {
        let days = UsageInsights.dailyTotals(report.samples, calendar: calendar)
        let total = report.total
        let projected = report.projectedCycleTotal(at: now)
        let daysLeft = UsageInsights.daysRemaining(in: report, now: now, calendar: calendar)

        self.total = total
        self.days = days
        self.averagePerDay = days.isEmpty ? 0 : total / Int64(days.count)
        self.busiestDay = days.max { $0.totalBytes < $1.totalBytes }
        self.projectedCycleTotal = projected
        self.daysLeftInCycle = daysLeft
        self.downloadShare = total > 0 ? Double(report.totalDownload) / Double(total) : 0
        self.capStatus = UsageInsights.capStatus(total: total, projected: projected, cap: report.dataCapBytes)
        if let cap = report.dataCapBytes {
            let remaining = max(cap - total, 0)
            self.dailyBudget = remaining / Int64(max(daysLeft, 1))
        } else {
            self.dailyBudget = nil
        }
    }

    static func capStatus(total: Int64, projected: Int64, cap: Int64?) -> DataCapStatus {
        guard let cap, cap > 0 else { return .unlimited }
        if total >= cap { return .exceeded(overageBytes: total - cap) }
        if projected > cap { return .projectedToExceed(projectedBytes: projected) }
        let fraction = Double(total) / Double(cap)
        return fraction >= DataCapStatus.warningThreshold ? .approaching(fraction: fraction) : .withinCap(fraction: fraction)
    }

    /// Whole days from today until the cycle ends, counting today.
    static func daysRemaining(in report: UsageReport, now: Date, calendar: Calendar) -> Int {
        guard now < report.cycleEnd else { return 0 }
        let start = calendar.startOfDay(for: max(now, report.cycleStart))
        let end = calendar.startOfDay(for: report.cycleEnd)
        let whole = calendar.dateComponents([.day], from: start, to: end).day ?? 0
        return max(whole, 0) + (report.cycleEnd > end ? 1 : 0)
    }

    /// Collapses (typically hourly) samples into one entry per calendar day.
    public static func dailyTotals(_ samples: [UsageSample], calendar: Calendar = .gregorianUTC) -> [DailyUsage] {
        rebucket(samples, to: .day, calendar: calendar).map {
            DailyUsage(day: $0.timestamp, downloadBytes: $0.downloadBytes, uploadBytes: $0.uploadBytes)
        }
    }

    /// Re-aggregates samples into buckets of `component` (hour, day, week,
    /// month), each stamped with the bucket's start. Output is chronological.
    public static func rebucket(_ samples: [UsageSample], to component: Calendar.Component, calendar: Calendar = .gregorianUTC) -> [UsageSample] {
        var download: [Date: Int64] = [:]
        var upload: [Date: Int64] = [:]
        for sample in samples {
            let bucket = calendar.dateInterval(of: component, for: sample.timestamp)?.start ?? sample.timestamp
            download[bucket, default: 0] += sample.downloadBytes
            upload[bucket, default: 0] += sample.uploadBytes
        }
        return download.keys.sorted().map {
            UsageSample(timestamp: $0, downloadBytes: download[$0] ?? 0, uploadBytes: upload[$0] ?? 0)
        }
    }

    /// Hour of day (0–23) with the most traffic across the samples, used for
    /// the "your busiest time is 9 PM" hint. Nil without data.
    public static func peakHour(_ samples: [UsageSample], calendar: Calendar) -> Int? {
        var perHour: [Int: Int64] = [:]
        for sample in samples where sample.totalBytes > 0 {
            perHour[calendar.component(.hour, from: sample.timestamp), default: 0] += sample.totalBytes
        }
        return perHour.max { lhs, rhs in
            lhs.value == rhs.value ? lhs.key > rhs.key : lhs.value < rhs.value
        }?.key
    }
}

public extension UsagePeriod {
    /// Chart bucket granularity appropriate for the period.
    var chartUnit: Calendar.Component {
        switch self {
        case .day: return .hour
        case .week, .month: return .day
        }
    }
}
