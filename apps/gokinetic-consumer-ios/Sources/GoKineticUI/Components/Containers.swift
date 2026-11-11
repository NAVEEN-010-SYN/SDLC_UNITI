import SwiftUI
import GoKineticCore

/// Rounded surface used for every dashboard tile and section.
public struct Card<Content: View>: View {
    private let title: String?
    private let content: Content

    public init(title: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            if let title {
                Text(title)
                    .font(Theme.Typography.headline)
                    .accessibilityAddTraits(.isHeader)
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.l)
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
    }
}

/// Large metric with caption, e.g. "$84.99 - Balance".
public struct StatTile: View {
    private let value: String
    private let caption: String
    private let symbol: String?
    private let tone: Tone

    public init(value: String, caption: String, symbol: String? = nil, tone: Tone = .neutral) {
        self.value = value
        self.caption = caption
        self.symbol = symbol
        self.tone = tone
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            if let symbol {
                Image(systemName: symbol)
                    .foregroundStyle(tone == .neutral ? Theme.Palette.brand : tone.color)
                    .accessibilityHidden(true)
            }
            Text(value)
                .font(Theme.Typography.title)
                .monospacedDigit()
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(caption)
                .font(Theme.Typography.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.m)
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
        .accessibilityElement(children: .combine)
    }
}

/// Generic empty state with an optional call to action.
public struct EmptyStateView: View {
    private let symbol: String
    private let title: String
    private let message: String?
    private let actionTitle: String?
    private let action: (() -> Void)?

    public init(symbol: String, title: String, message: String? = nil, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        self.symbol = symbol
        self.title = title
        self.message = message
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        VStack(spacing: Theme.Spacing.m) {
            Image(systemName: symbol)
                .font(.system(size: 44))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(title).font(Theme.Typography.headline)
            if let message {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            if let actionTitle, let action {
                Button(actionTitle, action: action).buttonStyle(.borderedProminent)
            }
        }
        .padding(Theme.Spacing.xl)
        .frame(maxWidth: .infinity)
    }
}

/// Error presentation driven by `UserFacingError`.
public struct ErrorStateView: View {
    private let error: UserFacingError
    private let retry: (() -> Void)?

    public init(error: UserFacingError, retry: (() -> Void)?) {
        self.error = error
        self.retry = retry
    }

    public var body: some View {
        EmptyStateView(
            symbol: error.kind == .offline ? "wifi.slash" : "exclamationmark.triangle",
            title: L10n.string(error.titleKey),
            message: detailText,
            actionTitle: error.isRetryable && retry != nil ? L10n.Common.retry : nil,
            action: retry
        )
    }

    private var detailText: String? {
        var parts: [String] = []
        if let detail = error.detail { parts.append(detail) }
        if let id = error.correlationId { parts.append(L10n.string("error.reference", id)) }
        return parts.isEmpty ? nil : parts.joined(separator: "\n")
    }
}

/// Renders a `ViewState`: spinner on first load, stale content plus banner
/// on refresh failure, full-screen error when there is nothing to show.
public struct AsyncContentView<Value, Content: View>: View {
    private let state: ViewState<Value>
    private let emptyTitle: String
    private let emptySymbol: String
    private let retry: () -> Void
    private let content: (Value) -> Content

    public init(state: ViewState<Value>, emptyTitle: String, emptySymbol: String = "tray", retry: @escaping () -> Void, @ViewBuilder content: @escaping (Value) -> Content) {
        self.state = state
        self.emptyTitle = emptyTitle
        self.emptySymbol = emptySymbol
        self.retry = retry
        self.content = content
    }

    public var body: some View {
        switch state {
        case .idle:
            Color.clear.onAppear(perform: retry)
        case .loading(nil):
            ProgressView(L10n.Common.loading)
                .frame(maxWidth: .infinity, minHeight: 200)
        case .loading(let previous?):
            content(previous)
        case .loaded(let value):
            content(value)
        case .empty:
            EmptyStateView(symbol: emptySymbol, title: emptyTitle)
        case .failed(let error, nil):
            ErrorStateView(error: error, retry: retry)
        case .failed(let error, let previous?):
            VStack(spacing: Theme.Spacing.m) {
                Banner(title: L10n.string(error.titleKey), tone: .warning,
                       actionTitle: error.isRetryable ? L10n.Common.retry : nil, action: retry)
                content(previous)
            }
        }
    }
}

/// Horizontal progress meter, used for data cap and payment progress.
public struct Meter: View {
    private let fraction: Double
    private let tone: Tone

    public init(fraction: Double, tone: Tone? = nil) {
        self.fraction = min(max(fraction, 0), 1)
        self.tone = tone ?? (fraction >= 0.9 ? .danger : fraction >= 0.75 ? .warning : .info)
    }

    public var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.Palette.separator)
                Capsule().fill(tone.color).frame(width: proxy.size.width * fraction)
            }
        }
        .frame(height: 8)
        .accessibilityElement()
        .accessibilityValue("\(Int((fraction * 100).rounded()))%")
    }
}
