import Foundation

/// Locale-aware money formatting from integer minor units via `Decimal`.
public struct MoneyFormatter: Sendable {
    public let locale: Locale

    public init(locale: Locale = .current) {
        self.locale = locale
    }

    private func makeFormatter(currency: String, fractionDigits: Int) -> NumberFormatter {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = locale
        formatter.currencyCode = currency
        formatter.minimumFractionDigits = fractionDigits
        formatter.maximumFractionDigits = fractionDigits
        formatter.generatesDecimalNumbers = true
        return formatter
    }

    /// "$45.10". Negative values (credits) render with a leading minus.
    public func string(from money: Money) -> String {
        let formatter = makeFormatter(currency: money.currency, fractionDigits: money.exponent)
        return formatter.string(from: money.decimalValue as NSDecimalNumber)
            ?? "\(money.currency) \(money.decimalValue)"
    }

    /// Drops ".00" for whole amounts: "$80/mo" style price tags.
    public func compactString(from money: Money) -> String {
        let divisor = Int64(pow(10, Double(money.exponent)))
        let isWhole = divisor == 0 || money.minorUnits % divisor == 0
        let formatter = makeFormatter(currency: money.currency, fractionDigits: isWhole ? 0 : money.exponent)
        return formatter.string(from: money.decimalValue as NSDecimalNumber)
            ?? string(from: money)
    }

    /// Balances shown on the dashboard: credits read "$12.00 credit".
    public func balanceString(from money: Money, creditSuffix: String) -> String {
        money.isNegative ? "\(string(from: money.absolute)) \(creditSuffix)" : string(from: money)
    }

    /// Plain decimal text suitable for pre-filling an amount field ("45.10").
    public func editableString(from money: Money) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = locale
        formatter.usesGroupingSeparator = false
        formatter.minimumFractionDigits = money.exponent
        formatter.maximumFractionDigits = money.exponent
        return formatter.string(from: money.decimalValue as NSDecimalNumber) ?? "\(money.decimalValue)"
    }
}

/// Byte counts in decimal units ("12.4 GB"), matching ISP billing.
public enum DataSizeFormatter {
    private static let units = ["B", "KB", "MB", "GB", "TB", "PB"]

    public static func string(fromBytes bytes: Int64, fractionDigits: Int = 1) -> String {
        guard bytes > 0 else { return "0 B" }
        var value = Double(bytes)
        var unitIndex = 0
        while value >= 1000, unitIndex < units.count - 1 {
            value /= 1000
            unitIndex += 1
        }
        if unitIndex == 0 { return "\(bytes) B" }
        let rounded = (value * pow(10, Double(fractionDigits))).rounded() / pow(10, Double(fractionDigits))
        let digits = rounded == rounded.rounded() ? 0 : fractionDigits
        return String(format: "%.\(digits)f %@", rounded, units[unitIndex])
    }

    public static func gigabytes(fromBytes bytes: Int64) -> Double {
        Double(bytes) / 1_000_000_000
    }
}

public enum SpeedFormatter {
    /// "943 Mbps" or "1.2 Gbps" for a measured throughput.
    public static func string(mbps: Double) -> String {
        guard mbps.isFinite, mbps >= 0 else { return "—" }
        if mbps >= 1000 {
            return String(format: "%.1f Gbps", mbps / 1000)
        }
        if mbps >= 100 { return String(format: "%.0f Mbps", mbps) }
        return String(format: "%.1f Mbps", mbps)
    }

    public static func latency(ms: Double) -> String {
        guard ms.isFinite, ms >= 0 else { return "—" }
        return String(format: "%.0f ms", ms)
    }
}

public enum DurationFormatter {
    /// "3d 4h", "5h 12m", "42m" for router uptime and ETAs.
    public static func compact(seconds: Int) -> String {
        let s = max(0, seconds)
        let days = s / 86_400
        let hours = (s % 86_400) / 3_600
        let minutes = (s % 3_600) / 60
        if days > 0 { return hours > 0 ? "\(days)d \(hours)h" : "\(days)d" }
        if hours > 0 { return minutes > 0 ? "\(hours)h \(minutes)m" : "\(hours)h" }
        return "\(max(minutes, s > 0 ? 1 : 0))m"
    }
}

/// Date presentation helpers. All wire dates are UTC; display converts to
/// the user's time zone.
public struct DisplayDateFormatter: Sendable {
    public let locale: Locale
    public let timeZone: TimeZone

    public init(locale: Locale = .current, timeZone: TimeZone = .current) {
        self.locale = locale
        self.timeZone = timeZone
    }

    private func formatter(_ template: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter
    }

    public func shortDate(_ date: Date) -> String { formatter("MMMd").string(from: date) }
    public func longDate(_ date: Date) -> String { formatter("yMMMMd").string(from: date) }
    public func time(_ date: Date) -> String { formatter("jmm").string(from: date) }
    public func monthYear(_ date: Date) -> String { formatter("yMMMM").string(from: date) }

    /// "Mar 3 – Apr 2" billing period label.
    public func period(from start: Date, to end: Date) -> String {
        "\(shortDate(start)) – \(shortDate(end))"
    }

    /// "Tue, Mar 4 · 8:00 AM – 12:00 PM" appointment window.
    public func slotWindow(_ slot: TimeSlot) -> String {
        let day = formatter("EEEMMMd").string(from: slot.start)
        return "\(day) · \(time(slot.start)) – \(time(slot.end))"
    }

    public func relative(_ date: Date, to reference: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: reference)
    }
}
