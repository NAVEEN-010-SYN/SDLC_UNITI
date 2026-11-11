import SwiftUI
import GoKineticCore

/// Design tokens. Values mirror the shared Figma token export in
/// `design/` so web and mobile stay visually consistent.
public enum Theme {
    public enum Palette {
        public static let brand = Color(red: 0.0, green: 0.42, blue: 0.84)
        public static let brandDark = Color(red: 0.0, green: 0.29, blue: 0.62)
        public static let accent = Color(red: 0.0, green: 0.74, blue: 0.62)
        public static let success = Color(red: 0.13, green: 0.6, blue: 0.33)
        public static let warning = Color(red: 0.93, green: 0.6, blue: 0.0)
        public static let danger = Color(red: 0.82, green: 0.18, blue: 0.2)
        public static let surface = Color(white: 0.5, opacity: 0.08)
        public static let separator = Color(white: 0.5, opacity: 0.2)
    }

    public enum Spacing {
        public static let xxs: CGFloat = 2
        public static let xs: CGFloat = 4
        public static let s: CGFloat = 8
        public static let m: CGFloat = 12
        public static let l: CGFloat = 16
        public static let xl: CGFloat = 24
        public static let xxl: CGFloat = 32
    }

    public enum Radius {
        public static let small: CGFloat = 8
        public static let card: CGFloat = 14
        public static let pill: CGFloat = 999
    }

    public enum Typography {
        public static let display = Font.system(.largeTitle, design: .rounded).weight(.bold)
        public static let title = Font.system(.title2, design: .rounded).weight(.semibold)
        public static let headline = Font.headline
        public static let body = Font.body
        public static let caption = Font.caption
        public static let metric = Font.system(size: 34, weight: .bold, design: .rounded).monospacedDigit()
    }
}

/// Semantic tone used by badges, banners and status rows.
public enum Tone: Sendable {
    case neutral, info, success, warning, danger

    public var color: Color {
        switch self {
        case .neutral: return .secondary
        case .info: return Theme.Palette.brand
        case .success: return Theme.Palette.success
        case .warning: return Theme.Palette.warning
        case .danger: return Theme.Palette.danger
        }
    }

    public var symbol: String {
        switch self {
        case .neutral: return "circle"
        case .info: return "info.circle.fill"
        case .success: return "checkmark.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .danger: return "xmark.octagon.fill"
        }
    }
}

public extension InvoiceStatus {
    var tone: Tone {
        switch self {
        case .paid: return .success
        case .open: return .info
        case .partiallyPaid: return .warning
        case .overdue: return .danger
        case .void: return .neutral
        }
    }
}

public extension TicketStatus {
    var tone: Tone {
        switch self {
        case .open: return .info
        case .inProgress: return .info
        case .pendingCustomer: return .warning
        case .resolved, .closed: return .success
        }
    }
}

public extension RouterState {
    var tone: Tone {
        switch self {
        case .online: return .success
        case .rebooting, .updating: return .info
        case .degraded: return .warning
        case .offline: return .danger
        }
    }
}

public extension OutageSeverity {
    var tone: Tone {
        switch self {
        case .info: return .info
        case .degraded: return .warning
        case .major: return .danger
        }
    }
}

public extension OrderStatus {
    var tone: Tone {
        switch self {
        case .active: return .success
        case .failed, .cancelled: return .danger
        default: return .info
        }
    }
}
