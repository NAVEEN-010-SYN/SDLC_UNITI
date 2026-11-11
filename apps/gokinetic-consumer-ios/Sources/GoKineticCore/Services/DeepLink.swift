import Foundation

/// Destinations reachable from push notifications, universal links and
/// the custom URL scheme.
public enum DeepLink: Equatable, Hashable, Sendable {
    case dashboard
    case bills
    case invoice(id: String)
    case payBill(invoiceId: String?)
    case plan
    case upgrade
    case usage
    case wifi
    case devices
    case speedTest
    case outages
    case tickets
    case ticket(id: String)
    case appointments
    case appointment(id: String)
    case settings

    /// Tab that should be selected when navigating to this link.
    public var tab: AppTab {
        switch self {
        case .dashboard, .outages: return .home
        case .bills, .invoice, .payBill: return .billing
        case .plan, .upgrade, .usage: return .plan
        case .wifi, .devices, .speedTest: return .wifi
        case .tickets, .ticket, .appointments, .appointment, .settings: return .support
        }
    }

    /// Parses `gokinetic://bills/INV-123` or
    /// `https://my.gokinetic.example/app/bills/INV-123`.
    public init?(url: URL, universalLinkHost: String = "my.gokinetic.example") {
        var segments: [String]
        switch url.scheme?.lowercased() {
        case "gokinetic":
            segments = ([url.host].compactMap { $0 } + url.pathComponents).filter { $0 != "/" && !$0.isEmpty }
        case "https" where url.host?.lowercased() == universalLinkHost:
            segments = url.pathComponents.filter { $0 != "/" && !$0.isEmpty }
            guard segments.first == "app" else { return nil }
            segments.removeFirst()
        default:
            return nil
        }
        guard let link = DeepLink(segments: segments.map { $0.removingPercentEncoding ?? $0 }) else { return nil }
        self = link
    }

    init?(segments: [String]) {
        guard let head = segments.first?.lowercased() else {
            self = .dashboard
            return
        }
        let id = segments.count > 1 ? segments[1] : nil
        if let id, !DeepLink.isSafeIdentifier(id) { return nil }
        guard let link = DeepLink.link(head: head, id: id) else { return nil }
        self = link
    }

    /// Maps the first path segment (and optional id) to a link.
    private static func link(head: String, id: String?) -> DeepLink? {
        switch head {
        case "home", "dashboard": return .dashboard
        case "bills":
            if let id { return .invoice(id: id) }
            return .bills
        case "pay": return .payBill(invoiceId: id)
        case "plan":
            if id == nil { return .plan }
            return id == "upgrade" ? .upgrade : nil
        case "upgrade": return .upgrade
        case "usage": return .usage
        case "wifi":
            if id == nil { return .wifi }
            return id == "devices" ? .devices : nil
        case "devices": return .devices
        case "speedtest", "speed-test": return .speedTest
        case "outages", "outage": return .outages
        case "tickets", "support":
            if let id { return .ticket(id: id) }
            return .tickets
        case "appointments":
            if let id { return .appointment(id: id) }
            return .appointments
        case "settings": return .settings
        default: return nil
        }
    }

    /// Identifiers are opaque server IDs; reject anything that could be
    /// used for path traversal or injection into later API paths.
    static func isSafeIdentifier(_ id: String) -> Bool {
        guard (1...64).contains(id.count) else { return false }
        return id.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_") }
    }
}

public enum AppTab: String, CaseIterable, Hashable, Sendable {
    case home, billing, plan, wifi, support
}

/// Push notification categories set by the backend in `aps.category`.
public enum PushCategory: String, Sendable {
    case billIssued = "BILL_ISSUED"
    case paymentFailed = "PAYMENT_FAILED"
    case paymentReceived = "PAYMENT_RECEIVED"
    case outageStarted = "OUTAGE_STARTED"
    case outageResolved = "OUTAGE_RESOLVED"
    case ticketUpdated = "TICKET_UPDATED"
    case appointmentReminder = "APPOINTMENT_REMINDER"
    case technicianEnRoute = "TECHNICIAN_EN_ROUTE"
    case planChangeCompleted = "PLAN_CHANGE_COMPLETED"
}

/// Parsed push payload. Pure logic - the UIKit delegate hands the raw
/// `userInfo` dictionary here and routes the resulting link.
public struct PushNotification: Equatable, Sendable {
    public let category: PushCategory
    public let link: DeepLink
    public let entityId: String?

    public init?(userInfo: [AnyHashable: Any]) {
        let aps = userInfo["aps"] as? [String: Any]
        guard let rawCategory = (aps?["category"] as? String) ?? (userInfo["category"] as? String),
              let category = PushCategory(rawValue: rawCategory) else { return nil }
        let entity = (userInfo["entityId"] as? String).flatMap { DeepLink.isSafeIdentifier($0) ? $0 : nil }

        // An explicit link wins when present and parseable.
        if let raw = userInfo["link"] as? String, let url = URL(string: raw), let explicit = DeepLink(url: url) {
            self.link = explicit
        } else {
            self.link = PushNotification.defaultLink(for: category, entityId: entity)
        }
        self.category = category
        self.entityId = entity
    }

    static func defaultLink(for category: PushCategory, entityId: String?) -> DeepLink {
        switch category {
        case .billIssued, .paymentReceived:
            return entityId.map { .invoice(id: $0) } ?? .bills
        case .paymentFailed:
            return .payBill(invoiceId: entityId)
        case .outageStarted, .outageResolved:
            return .outages
        case .ticketUpdated:
            return entityId.map { .ticket(id: $0) } ?? .tickets
        case .appointmentReminder, .technicianEnRoute:
            return entityId.map { .appointment(id: $0) } ?? .appointments
        case .planChangeCompleted:
            return .plan
        }
    }

    /// Whether a notification of this category should be shown as a banner
    /// while the app is in the foreground, given the user's preferences.
    public func shouldPresentInForeground(preferences: NotificationPreferences) -> Bool {
        switch category {
        case .billIssued, .paymentReceived, .paymentFailed: return preferences.billing
        case .outageStarted, .outageResolved: return preferences.outages
        case .ticketUpdated: return preferences.ticketUpdates
        case .appointmentReminder, .technicianEnRoute: return preferences.appointments
        case .planChangeCompleted: return true
        }
    }
}
