import Foundation

/// A monetary amount expressed as integer minor units (e.g. cents) plus an
/// ISO-4217 currency code. Money is never represented as a floating-point
/// value anywhere in the app; formatting converts through `Decimal`.
public struct Money: Codable, Hashable, Sendable {
    public let minorUnits: Int64
    public let currency: String

    public init(minorUnits: Int64, currency: String) {
        self.minorUnits = minorUnits
        self.currency = currency.uppercased()
    }

    public static func zero(_ currency: String) -> Money {
        Money(minorUnits: 0, currency: currency)
    }

    /// Number of fractional digits for the currency (ISO-4217 exponent).
    public var exponent: Int {
        Money.exponent(for: currency)
    }

    public static func exponent(for currency: String) -> Int {
        switch currency.uppercased() {
        case "JPY", "KRW", "VND", "CLP", "ISK": return 0
        case "BHD", "KWD", "OMR", "JOD", "TND": return 3
        default: return 2
        }
    }

    /// Exact decimal representation in major units (e.g. 12.34 for 1234 USD cents).
    public var decimalValue: Decimal {
        var value = Decimal(minorUnits)
        for _ in 0..<exponent { value /= 10 }
        return value
    }

    public var isZero: Bool { minorUnits == 0 }
    public var isNegative: Bool { minorUnits < 0 }
    public var isPositive: Bool { minorUnits > 0 }

    public var negated: Money {
        Money(minorUnits: -minorUnits, currency: currency)
    }

    public var absolute: Money {
        Money(minorUnits: Swift.abs(minorUnits), currency: currency)
    }

    /// Parses user-entered text such as "45.10" or "45,10" into minor units.
    /// Returns nil for malformed input or more fractional digits than the
    /// currency allows. Never routes through `Double`.
    public static func parse(_ text: String, currency: String, locale: Locale = .current) -> Money? {
        let separator = locale.decimalSeparator ?? "."
        var cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let grouping = locale.groupingSeparator, grouping != separator {
            cleaned = cleaned.replacingOccurrences(of: grouping, with: "")
        }
        cleaned = cleaned.filter { !$0.isCurrencySymbolLike }
        cleaned = cleaned.replacingOccurrences(of: separator, with: ".")
        guard !cleaned.isEmpty else { return nil }

        let parts = cleaned.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count <= 2 else { return nil }
        let whole = String(parts[0])
        let fraction = parts.count == 2 ? String(parts[1]) : ""
        let exp = exponent(for: currency)

        guard whole.allSatisfy(\.isASCIIDigit), fraction.allSatisfy(\.isASCIIDigit) else { return nil }
        guard !(whole.isEmpty && fraction.isEmpty) else { return nil }
        guard fraction.count <= exp else { return nil }

        let paddedFraction = fraction.padding(toLength: exp, withPad: "0", startingAt: 0)
        let digits = (whole.isEmpty ? "0" : whole) + paddedFraction
        guard let units = Int64(digits) else { return nil }
        return Money(minorUnits: units, currency: currency)
    }
}

public enum MoneyError: Error, Equatable {
    case currencyMismatch(String, String)
    case overflow
}

extension Money {
    public func adding(_ other: Money) throws -> Money {
        guard currency == other.currency else { throw MoneyError.currencyMismatch(currency, other.currency) }
        let (sum, overflow) = minorUnits.addingReportingOverflow(other.minorUnits)
        guard !overflow else { throw MoneyError.overflow }
        return Money(minorUnits: sum, currency: currency)
    }

    public func subtracting(_ other: Money) throws -> Money {
        try adding(other.negated)
    }

    /// Multiplies by an integer quantity (e.g. months).
    public func multiplied(by quantity: Int) throws -> Money {
        let (product, overflow) = minorUnits.multipliedReportingOverflow(by: Int64(quantity))
        guard !overflow else { throw MoneyError.overflow }
        return Money(minorUnits: product, currency: currency)
    }

    /// Prorates this monthly amount for `days` of a `daysInPeriod` billing
    /// period, rounding half-up to the nearest minor unit.
    public func prorated(days: Int, of daysInPeriod: Int) -> Money {
        guard daysInPeriod > 0 else { return .zero(currency) }
        let clampedDays = max(0, min(days, daysInPeriod))
        let numerator = minorUnits * Int64(clampedDays)
        let denominator = Int64(daysInPeriod)
        let quotient = numerator / denominator
        let remainder = numerator % denominator
        let roundsUp = Swift.abs(remainder) * 2 >= denominator
        let adjusted = roundsUp ? quotient + (numerator >= 0 ? 1 : -1) : quotient
        return Money(minorUnits: adjusted, currency: currency)
    }

    public static func sum(_ amounts: [Money], currency: String) throws -> Money {
        try amounts.reduce(.zero(currency)) { try $0.adding($1) }
    }
}

extension Money: Comparable {
    /// Comparison is only meaningful within one currency; mixed-currency
    /// comparisons order by currency code first so sorting stays total.
    public static func < (lhs: Money, rhs: Money) -> Bool {
        if lhs.currency != rhs.currency { return lhs.currency < rhs.currency }
        return lhs.minorUnits < rhs.minorUnits
    }
}

private extension Character {
    var isASCIIDigit: Bool { ("0"..."9").contains(self) }
    var isCurrencySymbolLike: Bool {
        unicodeScalars.allSatisfy { $0.properties.generalCategory == .currencySymbol }
    }
}
