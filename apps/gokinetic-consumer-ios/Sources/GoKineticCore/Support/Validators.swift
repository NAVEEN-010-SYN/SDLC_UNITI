import Foundation

/// A single failed rule, expressed as a localization key so view models can
/// show messages without hard-coding copy.
public struct ValidationIssue: Equatable, Hashable, Sendable {
    public let field: String
    public let messageKey: String

    public init(field: String, messageKey: String) {
        self.field = field
        self.messageKey = messageKey
    }
}

public struct ValidationResult: Equatable, Sendable {
    public let issues: [ValidationIssue]

    public init(_ issues: [ValidationIssue] = []) { self.issues = issues }

    public var isValid: Bool { issues.isEmpty }

    public func message(for field: String) -> String? {
        issues.first { $0.field == field }?.messageKey
    }

    public static let valid = ValidationResult()
}

/// Rules for changing the home Wi-Fi network name and passphrase. Mirrors
/// IEEE 802.11 limits plus the router firmware's character restrictions.
public enum WiFiCredentialsValidator {
    public static let ssidMaxBytes = 32
    public static let passphraseMinLength = 8
    public static let passphraseMaxLength = 63
    /// Characters the router firmware rejects in SSIDs.
    private static let forbiddenSSIDCharacters: Set<Character> = ["\"", "\\", "$", "`", "?", "["]

    public static func validate(ssid: String, passphrase: String?, confirmation: String?) -> ValidationResult {
        var issues: [ValidationIssue] = []
        issues.append(contentsOf: validateSSID(ssid))
        if let passphrase {
            issues.append(contentsOf: validatePassphrase(passphrase, ssid: ssid))
            if passphrase != confirmation {
                issues.append(ValidationIssue(field: "confirmation", messageKey: "wifi.validation.mismatch"))
            }
        }
        return ValidationResult(issues)
    }

    public static func validateSSID(_ ssid: String) -> [ValidationIssue] {
        let trimmed = ssid.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty {
            return [ValidationIssue(field: "ssid", messageKey: "wifi.validation.ssidRequired")]
        }
        if trimmed != ssid {
            return [ValidationIssue(field: "ssid", messageKey: "wifi.validation.ssidWhitespace")]
        }
        if ssid.utf8.count > ssidMaxBytes {
            return [ValidationIssue(field: "ssid", messageKey: "wifi.validation.ssidTooLong")]
        }
        if ssid.contains(where: { forbiddenSSIDCharacters.contains($0) || $0.isNewline }) {
            return [ValidationIssue(field: "ssid", messageKey: "wifi.validation.ssidCharacters")]
        }
        return []
    }

    public static func validatePassphrase(_ passphrase: String, ssid: String) -> [ValidationIssue] {
        if passphrase.count < passphraseMinLength {
            return [ValidationIssue(field: "passphrase", messageKey: "wifi.validation.passTooShort")]
        }
        if passphrase.count > passphraseMaxLength {
            return [ValidationIssue(field: "passphrase", messageKey: "wifi.validation.passTooLong")]
        }
        guard passphrase.unicodeScalars.allSatisfy({ $0.isASCII && $0.value >= 32 && $0.value < 127 }) else {
            return [ValidationIssue(field: "passphrase", messageKey: "wifi.validation.passCharacters")]
        }
        if passphrase.lowercased() == ssid.lowercased() {
            return [ValidationIssue(field: "passphrase", messageKey: "wifi.validation.passEqualsSSID")]
        }
        if passphraseStrength(passphrase) == .weak {
            return [ValidationIssue(field: "passphrase", messageKey: "wifi.validation.passWeak")]
        }
        return []
    }

    public enum Strength: Int, Comparable, Sendable {
        case weak = 0, fair, strong

        public static func < (lhs: Strength, rhs: Strength) -> Bool { lhs.rawValue < rhs.rawValue }
    }

    /// Scores character-class diversity and length; repeated single
    /// characters ("aaaaaaaa") are always weak.
    public static func passphraseStrength(_ passphrase: String) -> Strength {
        guard Set(passphrase).count > 2 else { return .weak }
        var classes = 0
        if passphrase.contains(where: \.isLowercase) { classes += 1 }
        if passphrase.contains(where: \.isUppercase) { classes += 1 }
        if passphrase.contains(where: \.isNumber) { classes += 1 }
        if passphrase.contains(where: { !$0.isLetter && !$0.isNumber }) { classes += 1 }
        let length = passphrase.count
        if (length >= 16 && classes >= 2) || (length >= 12 && classes >= 3) {
            return .strong
        }
        if (length >= 10 && classes >= 2) || classes >= 3 {
            return .fair
        }
        return .weak
    }
}

public enum TicketValidator {
    public static let subjectRange = 5...120
    public static let descriptionRange = 20...4000

    public static func validate(subject: String, description: String) -> ValidationResult {
        var issues: [ValidationIssue] = []
        let s = subject.trimmingCharacters(in: .whitespacesAndNewlines)
        let d = description.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty {
            issues.append(ValidationIssue(field: "subject", messageKey: "ticket.validation.subjectRequired"))
        } else if !subjectRange.contains(s.count) {
            issues.append(ValidationIssue(field: "subject", messageKey: "ticket.validation.subjectLength"))
        }
        if d.isEmpty {
            issues.append(ValidationIssue(field: "description", messageKey: "ticket.validation.descriptionRequired"))
        } else if !descriptionRange.contains(d.count) {
            issues.append(ValidationIssue(field: "description", messageKey: "ticket.validation.descriptionLength"))
        }
        return ValidationResult(issues)
    }

    public static func validateComment(_ body: String) -> ValidationResult {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return ValidationResult([ValidationIssue(field: "comment", messageKey: "ticket.validation.commentRequired")])
        }
        if trimmed.count > descriptionRange.upperBound {
            return ValidationResult([ValidationIssue(field: "comment", messageKey: "ticket.validation.commentLength")])
        }
        return .valid
    }
}

public enum PaymentAmountValidator {
    /// Smallest one-off payment accepted (1.00 in major units).
    public static let minimumMinorUnits: Int64 = 100

    /// Validates a customer-entered amount against the outstanding balance.
    /// Overpayment up to the balance plus one month's charge is allowed and
    /// sits on the account as credit.
    public static func validate(amount: Money?, balance: Money, maxOverpayment: Money? = nil) -> ValidationResult {
        guard let amount else {
            return ValidationResult([ValidationIssue(field: "amount", messageKey: "payment.validation.amountInvalid")])
        }
        guard amount.currency == balance.currency else {
            return ValidationResult([ValidationIssue(field: "amount", messageKey: "payment.validation.currency")])
        }
        if amount.minorUnits < minimumMinorUnits {
            return ValidationResult([ValidationIssue(field: "amount", messageKey: "payment.validation.belowMinimum")])
        }
        let ceiling = balance.minorUnits + (maxOverpayment?.minorUnits ?? 0)
        if balance.isPositive, amount.minorUnits > ceiling {
            return ValidationResult([ValidationIssue(field: "amount", messageKey: "payment.validation.aboveBalance")])
        }
        return .valid
    }
}
