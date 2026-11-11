import SwiftUI
import GoKineticCore

/// Full-width primary call to action with an inline progress state.
public struct PrimaryButton: View {
    private let title: String
    private let isLoading: Bool
    private let isEnabled: Bool
    private let action: () -> Void

    public init(_ title: String, isLoading: Bool = false, isEnabled: Bool = true, action: @escaping () -> Void) {
        self.title = title
        self.isLoading = isLoading
        self.isEnabled = isEnabled
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            ZStack {
                Text(title)
                    .font(Theme.Typography.headline)
                    .opacity(isLoading ? 0 : 1)
                if isLoading {
                    ProgressView().tint(.white)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 50)
            .foregroundStyle(.white)
            .background(isEnabled ? Theme.Palette.brand : Theme.Palette.brand.opacity(0.4),
                        in: RoundedRectangle(cornerRadius: Theme.Radius.card))
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled || isLoading)
        .accessibilityLabel(title)
        .accessibilityAddTraits(.isButton)
        .accessibilityValue(isLoading ? L10n.Common.loading : "")
    }
}

public struct SecondaryButton: View {
    private let title: String
    private let role: ButtonRole?
    private let action: () -> Void

    public init(_ title: String, role: ButtonRole? = nil, action: @escaping () -> Void) {
        self.title = title
        self.role = role
        self.action = action
    }

    public var body: some View {
        Button(role: role, action: action) {
            Text(title)
                .font(Theme.Typography.headline)
                .frame(maxWidth: .infinity, minHeight: 46)
        }
        .buttonStyle(.bordered)
        .tint(role == .destructive ? Theme.Palette.danger : Theme.Palette.brand)
    }
}

/// Text field with an inline validation message and accessible error hint.
public struct ValidatedField: View {
    private let title: String
    @Binding private var text: String
    private let message: String?
    private let isSecure: Bool
    private let contentType: FieldContentType

    public enum FieldContentType {
        case plain, amount, password, email
    }

    public init(_ title: String, text: Binding<String>, message: String? = nil, isSecure: Bool = false, contentType: FieldContentType = .plain) {
        self.title = title
        self._text = text
        self.message = message
        self.isSecure = isSecure
        self.contentType = contentType
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text(title)
                .font(Theme.Typography.caption)
                .foregroundStyle(.secondary)
            Group {
                if isSecure {
                    SecureField(title, text: $text)
                } else {
                    TextField(title, text: $text)
                }
            }
            .textFieldStyle(.roundedBorder)
            .autocorrectionDisabled()
            #if os(iOS)
            .textInputAutocapitalization(contentType == .plain ? .sentences : .never)
            .keyboardType(keyboardType)
            #endif
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(message == nil ? Color.clear : Theme.Palette.danger, lineWidth: 1)
            )
            if let message {
                Label(message, systemImage: "exclamationmark.circle")
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Palette.danger)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint(message ?? "")
    }

    #if os(iOS)
    private var keyboardType: UIKeyboardType {
        switch contentType {
        case .amount: return .decimalPad
        case .email: return .emailAddress
        case .plain, .password: return .default
        }
    }
    #endif
}

/// Small capsule showing a status in its semantic tone.
public struct StatusBadge: View {
    private let text: String
    private let tone: Tone

    public init(_ text: String, tone: Tone) {
        self.text = text
        self.tone = tone
    }

    public var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, Theme.Spacing.s)
            .padding(.vertical, Theme.Spacing.xxs + 1)
            .foregroundStyle(tone.color)
            .background(tone.color.opacity(0.14), in: Capsule())
            .accessibilityLabel(text)
    }
}

/// Inline banner for warnings, errors and informational notices.
public struct Banner: View {
    private let title: String
    private let message: String?
    private let tone: Tone
    private let actionTitle: String?
    private let action: (() -> Void)?

    public init(title: String, message: String? = nil, tone: Tone, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        self.title = title
        self.message = message
        self.tone = tone
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            Image(systemName: tone.symbol)
                .foregroundStyle(tone.color)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text(title).font(.subheadline.weight(.semibold))
                if let message {
                    Text(message).font(.footnote).foregroundStyle(.secondary)
                }
                if let actionTitle, let action {
                    Button(actionTitle, action: action)
                        .font(.footnote.weight(.semibold))
                        .padding(.top, Theme.Spacing.xxs)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(Theme.Spacing.m)
        .background(tone.color.opacity(0.1), in: RoundedRectangle(cornerRadius: Theme.Radius.small))
        .accessibilityElement(children: .combine)
    }
}
