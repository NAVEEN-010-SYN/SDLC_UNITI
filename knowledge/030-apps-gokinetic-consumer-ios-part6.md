# Go Kinetic Consumer mobile app (B2C): apps/gokinetic-consumer-ios (part 6 of 7)

- **Application:** Go Kinetic Consumer mobile app (B2C)
- **Tech stack:** Swift / SwiftUI
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 12

## Files

- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/WiFi/WiFiViews.swift` (284 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticUI/Components/Containers.swift` (196 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticUI/Components/Controls.swift` (186 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticUI/Components/UsageChart.swift` (140 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticUI/L10n.swift` (66 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticUI/Resources/en.lproj/Localizable.strings` (428 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticUI/Theme.swift` (122 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticUI/ViewState.swift` (61 lines)
- `apps/gokinetic-consumer-ios/Tests/GoKineticCoreTests/ConnectionDiagnosticsTests.swift` (88 lines)
- `apps/gokinetic-consumer-ios/Tests/GoKineticCoreTests/PaymentPlanningTests.swift` (94 lines)
- `apps/gokinetic-consumer-ios/Tests/GoKineticCoreTests/UsageAndHealthTests.swift` (135 lines)
- `apps/gokinetic-consumer-ios/Tests/GoKineticFeaturesTests/BillingViewModelTests.swift` (155 lines)

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/WiFi/WiFiViews.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/WiFi/WiFiViews.swift`.

```swift
import SwiftUI
import GoKineticCore
import GoKineticUI

public struct WiFiView: View {
    @StateObject private var viewModel: WiFiViewModel
    @State private var confirmingReboot = false
    @State private var renaming: ConnectedDevice?
    @State private var newName = ""

    public init(viewModel: @autoclosure @escaping () -> WiFiViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        List {
            AsyncContentView(state: viewModel.router, emptyTitle: L10n.string("wifi.noRouter"),
                             retry: { Task { await viewModel.load() } }) { status in
                Section { routerHeader(status) }
                Section(L10n.string("wifi.networks")) {
                    ForEach(status.networks) { network in
                        NavigationLink(value: AppRoute.editWiFi(routerId: status.routerId, network: network)) {
                            Label(network.ssid, systemImage: network.isGuest ? "person.2.wave.2" : "wifi")
                        }
                    }
                }
                Section {
                    NavigationLink(value: DeepLink.speedTest.route) { Label(L10n.string("dashboard.action.speedTest"), systemImage: "speedometer") }
                    NavigationLink(value: AppRoute.troubleshoot) { Label(L10n.string("support.troubleshoot"), systemImage: "wrench.and.screwdriver") }
                }
                Section(L10n.WiFi.devices) { devicesSection }
            }
            if let error = viewModel.actionError {
                Banner(title: L10n.string(error.titleKey), tone: .warning,
                       actionTitle: L10n.string("common.dismiss")) { viewModel.actionError = nil }
            }
        }
        .refreshable { await viewModel.load() }
        .navigationTitle(L10n.Tabs.wifi)
        .confirmationDialog(L10n.WiFi.rebootConfirm, isPresented: $confirmingReboot, titleVisibility: .visible) {
            Button(L10n.WiFi.reboot, role: .destructive) { Task { await viewModel.reboot() } }
        }
        .alert(L10n.string("wifi.renameDevice"), isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField(L10n.string("wifi.deviceName"), text: $newName)
            Button(L10n.Common.save) {
                guard let device = renaming else { return }
                let name = newName
                Task { await viewModel.rename(device, to: name) }
            }
            Button(L10n.Common.cancel, role: .cancel) {}
        }
    }

    private func routerHeader(_ status: RouterStatus) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack {
                Text(status.model).font(Theme.Typography.headline)
                Spacer()
                StatusBadge(L10n.string("router.state.\(status.state.rawValue.lowercased())"), tone: status.state.tone)
            }
            Text(L10n.string("wifi.uptime", DurationFormatter.compact(seconds: status.uptimeSeconds)))
                .font(.footnote).foregroundStyle(.secondary)
            switch viewModel.rebootState {
            case .idle:
                Button(L10n.WiFi.reboot) { confirmingReboot = true }.disabled(!viewModel.canReboot)
            case .inProgress(let state):
                ProgressView(L10n.string("wifi.reboot.progress.\(state.rawValue.lowercased())"))
            case .completed:
                Banner(title: L10n.string("wifi.reboot.done"), tone: .success,
                       actionTitle: L10n.Common.done) { viewModel.acknowledgeReboot() }
            case .failed(let error):
                Banner(title: L10n.string(error.titleKey), tone: .danger,
                       actionTitle: L10n.string("common.dismiss")) { viewModel.acknowledgeReboot() }
            }
        }
    }

    @ViewBuilder private var devicesSection: some View {
        if let summary = viewModel.deviceSummary {
            Text(L10n.string("wifi.deviceSummary", summary.online, summary.blocked))
                .font(.footnote).foregroundStyle(.secondary)
        }
        AsyncContentView(state: viewModel.devices, emptyTitle: L10n.string("wifi.noDevices"), emptySymbol: "laptopcomputer.and.iphone",
                         retry: { Task { await viewModel.load() } }) { devices in
            ForEach(devices) { device in
                DeviceRow(device: device, online: viewModel.isOnline(device),
                          busy: viewModel.busyDeviceIds.contains(device.id))
                    .swipeActions {
                        Button(device.isBlocked ? L10n.WiFi.unblock : L10n.WiFi.block) {
                            Task { await viewModel.setBlocked(device, blocked: !device.isBlocked) }
                        }
                        .tint(device.isBlocked ? Theme.Palette.success : Theme.Palette.danger)
                        Button(L10n.string("wifi.rename")) {
                            newName = device.name
                            renaming = device
                        }
                    }
            }
        }
    }
}

struct DeviceRow: View {
    let device: ConnectedDevice
    let online: Bool
    let busy: Bool

    var body: some View {
        HStack {
            Image(systemName: device.isWired ? "cable.connector" : "wifi")
                .foregroundStyle(online ? Theme.Palette.brand : .secondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                Text(device.name).font(.body)
                Text([device.ipAddress, device.band?.rawValue, L10n.string("signal.\(device.signalQuality.rawValue)")]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if busy { ProgressView() }
            if device.isBlocked { StatusBadge(L10n.string("wifi.blocked"), tone: .danger) }
        }
        .opacity(online || device.isBlocked ? 1 : 0.6)
        .accessibilityElement(children: .combine)
    }
}

public struct WiFiSettingsView: View {
    @StateObject private var viewModel: WiFiSettingsViewModel
    @State private var confirmingSave = false

    public init(viewModel: @autoclosure @escaping () -> WiFiSettingsViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        Form {
            ValidatedField(L10n.string("wifi.ssid"), text: $viewModel.ssid, message: viewModel.message(for: "ssid"))
            Picker(L10n.string("wifi.security"), selection: $viewModel.security) {
                ForEach(WiFiSecurity.allCases, id: \.self) { Text(L10n.string("wifi.security.\($0.rawValue.lowercased())")).tag($0) }
            }
            Toggle(L10n.string("wifi.changePassphrase"), isOn: $viewModel.changePassphrase)
            if viewModel.changePassphrase {
                ValidatedField(L10n.string("wifi.passphrase"), text: $viewModel.passphrase,
                               message: viewModel.message(for: "passphrase"), isSecure: true, contentType: .password)
                if let strength = viewModel.strength {
                    Meter(fraction: Double(strength.rawValue + 1) / 3, tone: strength == .strong ? .success : strength == .fair ? .warning : .danger)
                }
                ValidatedField(L10n.string("wifi.confirmPassphrase"), text: $viewModel.confirmation,
                               message: viewModel.message(for: "confirmation"), isSecure: true, contentType: .password)
            }
            if let error = viewModel.saveError {
                Banner(title: L10n.string(error.titleKey), message: error.detail, tone: .danger)
            }
            if viewModel.saved != nil {
                Banner(title: L10n.string("wifi.saved"), tone: .success)
            }
            PrimaryButton(L10n.Common.save, isLoading: viewModel.isSaving, isEnabled: viewModel.hasChanges) {
                if viewModel.disconnectsDevices { confirmingSave = true } else { Task { await viewModel.save() } }
            }
            .listRowInsets(EdgeInsets())
        }
        .navigationTitle(viewModel.network.ssid)
        .confirmationDialog(L10n.string("wifi.disconnectWarning"), isPresented: $confirmingSave, titleVisibility: .visible) {
            Button(L10n.Common.save) { Task { await viewModel.save() } }
        }
    }
}

public struct SpeedTestView: View {
    @StateObject private var viewModel: SpeedTestViewModel
    private let dateFormatter = DisplayDateFormatter()

    public init(viewModel: @autoclosure @escaping () -> SpeedTestViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.l) {
                SpeedGauge(mbps: viewModel.currentMbps, maxMbps: viewModel.gaugeMaxMbps, label: L10n.string(viewModel.phaseLabelKey))
                if case .finished(let result, let verdict) = viewModel.phase {
                    HStack {
                        StatTile(value: SpeedFormatter.string(mbps: result.uploadMbps), caption: L10n.string("plan.upload"), symbol: "arrow.up")
                        StatTile(value: SpeedFormatter.latency(ms: result.latencyMs), caption: L10n.string("speedtest.ping"), symbol: "timer")
                    }
                    if let verdict {
                        Banner(title: L10n.string("speedtest.verdict.\(verdict.rawValue)"),
                               tone: verdict == .belowExpected ? .warning : .success)
                    }
                }
                if case .failed(let error) = viewModel.phase {
                    Banner(title: L10n.string(error.titleKey), tone: .danger)
                }
                if viewModel.isRunning {
                    SecondaryButton(L10n.Common.cancel) { viewModel.cancel() }
                } else {
                    PrimaryButton(L10n.string("speedtest.start")) { viewModel.start() }
                }
                if !viewModel.history.isEmpty {
                    Card(title: L10n.string("speedtest.history")) {
                        ForEach(viewModel.history) { result in
                            HStack {
                                Text(dateFormatter.shortDate(result.measuredAt))
                                Spacer()
                                Text("\(SpeedFormatter.string(mbps: result.downloadMbps)) / \(SpeedFormatter.string(mbps: result.uploadMbps))")
                                    .monospacedDigit()
                            }
                            .font(.subheadline)
                        }
                    }
                }
            }
            .padding(Theme.Spacing.l)
        }
        .navigationTitle(L10n.string("dashboard.action.speedTest"))
        .task { await viewModel.loadHistory() }
        .onDisappear { viewModel.cancel() }
    }
}

public struct TroubleshootView: View {
    @StateObject private var viewModel: TroubleshootViewModel
    @State private var escalationDraft: NewTicketRequest?
    private let makeTicketForm: (NewTicketRequest) -> NewTicketViewModel

    public init(viewModel: @autoclosure @escaping () -> TroubleshootViewModel,
                makeTicketForm: @escaping (NewTicketRequest) -> NewTicketViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
        self.makeTicketForm = makeTicketForm
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) { content }
                .padding(Theme.Spacing.l)
        }
        .navigationTitle(L10n.string("support.troubleshoot"))
        .sheet(item: Binding(get: { escalationDraft.map(IdentifiedDraft.init) }, set: { escalationDraft = $0?.request })) { draft in
            NavigationStack { NewTicketView(viewModel: makeTicketForm(draft.request)) }
        }
    }

    @ViewBuilder private var content: some View {
        switch viewModel.step {
        case .start:
            Text(L10n.string("troubleshoot.intro"))
            PrimaryButton(L10n.string("troubleshoot.begin")) { Task { await viewModel.begin() } }
        case .checking:
            ProgressView(L10n.string("troubleshoot.checking")).frame(maxWidth: .infinity)
        case .knownOutage(let outage):
            Banner(title: L10n.string("troubleshoot.outage"), message: outage.title, tone: outage.severity.tone)
            NavigationLink(value: DeepLink.outages.route) { Text(L10n.string("outages.title")) }
        case .offerReboot(let status):
            Card(title: L10n.string("troubleshoot.rebootTitle")) {
                Text(L10n.string("troubleshoot.rebootBody", status.model))
                PrimaryButton(L10n.WiFi.reboot) { Task { await viewModel.reboot() } }
                SecondaryButton(L10n.string("troubleshoot.skip")) { Task { await viewModel.skipReboot() } }
            }
        case .rebooting(let state):
            ProgressView(L10n.string("wifi.reboot.progress.\(state.rawValue.lowercased())")).frame(maxWidth: .infinity)
        case .advice(let recommendations):
            if recommendations.isEmpty {
                Banner(title: L10n.string("troubleshoot.noIssues"), tone: .success)
            }
            ForEach(recommendations, id: \.self) { recommendation in
                Card { Text(L10n.string(recommendation.messageKey)) }
            }
            PrimaryButton(L10n.string("troubleshoot.fixed")) { viewModel.markResolved() }
            SecondaryButton(L10n.string("troubleshoot.notFixed")) { escalationDraft = viewModel.ticketDraft() }
            Button(L10n.string("troubleshoot.tryReboot")) { viewModel.offerRebootAnyway() }.font(.footnote)
        case .resolved:
            EmptyStateView(symbol: "checkmark.seal.fill", title: L10n.string("troubleshoot.resolved"))
        case .failed(let error):
            ErrorStateView(error: error) { Task { await viewModel.begin() } }
        }
    }
}

private struct IdentifiedDraft: Identifiable {
    let request: NewTicketRequest
    var id: String { request.subject + request.description }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticUI/Components/Containers.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticUI/Components/Containers.swift`.

```swift
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

/// Large metric with caption, e.g. "$84.99 — Balance".
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
```

## apps/gokinetic-consumer-ios/Sources/GoKineticUI/Components/Controls.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticUI/Components/Controls.swift`.

```swift
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
```

## apps/gokinetic-consumer-ios/Sources/GoKineticUI/Components/UsageChart.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticUI/Components/UsageChart.swift`.

```swift
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
```

## apps/gokinetic-consumer-ios/Sources/GoKineticUI/L10n.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticUI/L10n.swift`.

```swift
import Foundation
import SwiftUI

/// Typed access to `Localizable.strings`. Keys are grouped by feature so a
/// missing translation is a compile-visible change rather than a typo.
public enum L10n {
    public static func string(_ key: String, _ args: CVarArg...) -> String {
        let format = NSLocalizedString(key, bundle: .module, comment: "")
        return args.isEmpty ? format : String(format: format, locale: .current, arguments: args)
    }

    public static func text(_ key: String) -> Text {
        Text(string(key))
    }

    public enum Common {
        public static var retry: String { string("common.retry") }
        public static var cancel: String { string("common.cancel") }
        public static var done: String { string("common.done") }
        public static var save: String { string("common.save") }
        public static var continueAction: String { string("common.continue") }
        public static var loading: String { string("common.loading") }
        public static var credit: String { string("common.credit") }
        public static var perMonth: String { string("common.perMonth") }
    }

    public enum Tabs {
        public static var home: String { string("tab.home") }
        public static var billing: String { string("tab.billing") }
        public static var plan: String { string("tab.plan") }
        public static var wifi: String { string("tab.wifi") }
        public static var support: String { string("tab.support") }
    }

    public enum Login {
        public static var title: String { string("login.title") }
        public static var subtitle: String { string("login.subtitle") }
        public static var signIn: String { string("login.signIn") }
        public static var unlock: String { string("login.unlock") }
        public static var unlockReason: String { string("login.unlockReason") }
        public static var usePassword: String { string("login.usePassword") }
        public static var notConsumer: String { string("login.notConsumer") }
    }

    public enum Billing {
        public static var balance: String { string("billing.balance") }
        public static var dueOn: String { string("billing.dueOn") }
        public static var payNow: String { string("billing.payNow") }
        public static var autopay: String { string("billing.autopay") }
        public static var history: String { string("billing.history") }
        public static var noInvoices: String { string("billing.noInvoices") }
        public static func dueIn(days: Int) -> String { string("billing.dueInDays", days) }
        public static func overdueBy(days: Int) -> String { string("billing.overdueByDays", days) }
    }

    public enum WiFi {
        public static var reboot: String { string("wifi.reboot") }
        public static var rebootConfirm: String { string("wifi.rebootConfirm") }
        public static var changeNetwork: String { string("wifi.changeNetwork") }
        public static var devices: String { string("wifi.devices") }
        public static var block: String { string("wifi.block") }
        public static var unblock: String { string("wifi.unblock") }
    }

}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticUI/Resources/en.lproj/Localizable.strings

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: text. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticUI/Resources/en.lproj/Localizable.strings`.

```text
/* Go Kinetic Consumer: English strings. Keys are referenced through L10n. */

/* Common */
"common.retry" = "Try again";
"common.cancel" = "Cancel";
"common.done" = "Done";
"common.save" = "Save";
"common.continue" = "Continue";
"common.loading" = "Loading…";
"common.credit" = "credit";
"common.perMonth" = "/mo";
"common.view" = "View";
"common.dismiss" = "Dismiss";

/* Tabs */
"tab.home" = "Home";
"tab.billing" = "Billing";
"tab.plan" = "Plan";
"tab.wifi" = "Wi-Fi";
"tab.support" = "Support";

/* Errors */
"error.generic" = "Something went wrong";
"error.offline" = "You're offline";
"error.network" = "We couldn't reach Go Kinetic";
"error.sessionExpired" = "Your session has expired";
"error.forbidden" = "You don't have access to this";
"error.notFound" = "We couldn't find that";
"error.validation" = "Please check your details";
"error.conflict" = "That change conflicts with a recent update";
"error.rateLimited" = "Too many requests. Please wait a moment.";
"error.server" = "Our systems are having trouble";
"error.reference" = "Reference: %@";

/* Login and lock */
"login.title" = "Go Kinetic";
"login.subtitle" = "Manage your fibre broadband, bills and support in one place.";
"login.signIn" = "Sign in";
"login.unlock" = "Unlock";
"login.unlockReason" = "Unlock your Go Kinetic account";
"login.usePassword" = "Sign in with password instead";
"login.notConsumer" = "This app is for home customers. Business users can sign in on the web portal.";
"login.emailOptional" = "Email (optional)";
"login.error.generic" = "Sign-in failed. Please try again.";
"login.error.provider" = "The sign-in service reported a problem.";
"login.error.security" = "Sign-in couldn't be verified. Please try again.";
"login.footer" = "By signing in you agree to the Go Kinetic terms of service.";
"lock.title" = "Go Kinetic is locked";
"lock.failed" = "We couldn't verify it's you.";

/* Dashboard */
"dashboard.greeting" = "Hi %@";
"dashboard.noAccount" = "No account found";
"dashboard.myService" = "My service";
"dashboard.noService" = "No active service on this account.";
"dashboard.viewPlan" = "View plan";
"dashboard.homeWifi" = "Home Wi-Fi";
"dashboard.manageWifi" = "Manage Wi-Fi";
"dashboard.nextAppointment" = "Next appointment";
"dashboard.action.speedTest" = "Speed test";
"dashboard.action.usage" = "Usage";
"dashboard.action.support" = "Support";
"dashboard.action.outages" = "Service status";
"dashboard.alert.outage" = "There's an outage in your area";
"dashboard.alert.routerOffline" = "Your router is offline";
"dashboard.alert.billOverdue" = "Your bill is overdue";
"dashboard.alert.suspended" = "Your service is suspended";

/* Billing */
"billing.balance" = "Balance";
"billing.dueOn" = "Due on";
"billing.payNow" = "Pay now";
"billing.autopay" = "Autopay";
"billing.autopay.noMethod" = "Add a valid payment method to turn on autopay.";
"billing.history" = "Invoices";
"billing.noInvoices" = "No invoices yet";
"billing.dueInDays" = "Due in %ld days";
"billing.overdueByDays" = "Overdue by %ld days";
"billing.dueToday" = "Due today";
"billing.dueOnDate" = "Due %@";
"billing.nextBill" = "Next bill on %@";
"invoice.title" = "Invoice";
"invoice.settled" = "Nothing left to pay";
"invoice.amountDue" = "Amount due: %@";
"invoice.breakdown" = "Breakdown";
"invoice.breakdownIncomplete" = "A detailed breakdown isn't available for this invoice. Download the PDF for full details.";
"invoice.downloadPDF" = "Download PDF";
"invoice.status.open" = "Open";
"invoice.status.paid" = "Paid";
"invoice.status.partially_paid" = "Partly paid";
"invoice.status.overdue" = "Overdue";
"invoice.status.void" = "Void";
"invoice.category.recurring" = "Monthly charges";
"invoice.category.one_time" = "One-off charges";
"invoice.category.usage" = "Usage";
"invoice.category.discount" = "Discounts";
"invoice.category.tax" = "Taxes";
"invoice.category.adjustment" = "Adjustments";

/* Payments */
"payment.amount" = "Amount";
"payment.customAmount" = "Other amount";
"payment.option.balance" = "Full balance";
"payment.option.invoice" = "Invoice %@";
"payment.option.overdue" = "Overdue invoice %@";
"payment.option.custom" = "Other amount";
"payment.method" = "Pay with";
"payment.noMethods" = "No valid payment methods. Add one on the web portal.";
"payment.expiredHidden" = "Expired cards are hidden.";
"payment.payAmount" = "Pay %@";
"payment.footer" = "Payments usually appear on your account within a few minutes.";
"payment.nothingDue" = "Nothing to pay right now";
"payment.success" = "Payment received";
"payment.processing" = "Payment processing";
"payment.receiptDetail" = "Paid with %@ on %@";
"payment.reference" = "Reference %@";
"payment.error.declined" = "Your card was declined. Try another payment method.";
"payment.error.insufficientFunds" = "Insufficient funds. Try another payment method.";
"payment.error.methodExpired" = "That payment method has expired.";
"payment.error.amountRejected" = "That amount can't be paid.";
"payment.error.duplicate" = "This payment has already been made.";
"payment.error.outcomeUnknown" = "We're not sure the payment went through. Retrying is safe: you won't be charged twice.";
"payment.validation.amountInvalid" = "Enter a valid amount.";
"payment.validation.currency" = "Amount is in the wrong currency.";
"payment.validation.belowMinimum" = "The minimum payment is 1.00.";
"payment.validation.aboveBalance" = "That's more than your balance allows.";
"payment.validation.methodRequired" = "Choose a payment method.";

/* Plan and upgrades */
"plan.none" = "No plan found";
"plan.current" = "Current plan";
"plan.download" = "Download";
"plan.upload" = "Upload";
"plan.upgrades" = "Faster plans";
"plan.startUpgrade" = "Upgrade";
"plan.recommended" = "Recommended";
"plan.deltaMore" = "+%@/mo";
"plan.deltaLess" = "−%@/mo";
"plan.deltaSame" = "Same price";
"plan.pendingChange" = "Change to %@ in progress";
"plan.contractEnds" = "Contract ends %@ (%ld months left)";
"upgrade.title" = "Upgrade plan";
"upgrade.choosePlan" = "Choose a plan";
"upgrade.timing" = "When";
"upgrade.timing.immediate" = "Now";
"upgrade.timing.nextCycle" = "Next bill";
"upgrade.quoting" = "Getting your price…";
"upgrade.review" = "Review";
"upgrade.newPlan" = "New plan";
"upgrade.newMonthly" = "New monthly price";
"upgrade.prorated" = "Prorated charge";
"upgrade.nextBillImpact" = "Added to next bill";
"upgrade.quoteExpires" = "This price is held for %ld minutes.";
"upgrade.acceptTerms" = "I accept the plan terms";
"upgrade.confirm" = "Confirm upgrade";
"upgrade.changePlan" = "Choose a different plan";
"upgrade.submitted" = "Upgrade requested";
"upgrade.orderReference" = "Order %@";
"order.status.draft" = "Draft";
"order.status.submitted" = "Submitted";
"order.status.validated" = "Validated";
"order.status.provisioning" = "Provisioning";
"order.status.active" = "Active";
"order.status.cancelled" = "Cancelled";
"order.status.failed" = "Failed";

/* Usage */
"usage.title" = "Usage";
"usage.period" = "Period";
"usage.period.day" = "Day";
"usage.period.week" = "Week";
"usage.period.month" = "Month";
"usage.empty" = "No usage recorded yet";
"usage.total" = "Total";
"usage.dailyAverage" = "Daily average";
"usage.projected" = "Projected this cycle";
"usage.downloadShare" = "Download share";
"usage.peakHour" = "Busiest hour";
"usage.hourLabel" = "%ld:00";
"usage.daysLeft" = "Days left in cycle";
"usage.clearSelection" = "Show whole period";
"usage.cap.ok" = "Within your data allowance";
"usage.cap.approaching" = "Approaching your data allowance";
"usage.cap.projected" = "On track to exceed your allowance";
"usage.cap.exceeded" = "Data allowance exceeded";
"usage.cap.usedOf" = "%@ of %@ used";
"usage.cap.projectedDetail" = "Projected %@ against a %@ allowance";
"usage.cap.overBy" = "Over by %@";
"usage.cap.dailyBudget" = "About %@ per day keeps you within it for the remaining %ld days";

/* Service status */
"outages.title" = "Service status";
"outages.active" = "Current incidents";
"outages.noneActive" = "No incidents right now";
"outages.recentlyResolved" = "Recently resolved";
"outages.lastUpdated" = "Updated %@";
"outages.troubleshoot" = "Troubleshoot my connection";
"outage.eta" = "Expected fix by %@";
"outage.delayed" = "Taking longer than expected";
"outage.resolvedAt" = "Resolved %@";
"outage.started" = "Started %@";
"outage.affectsYou" = "Affects you";
"outage.severity.info" = "Planned work";
"outage.severity.degraded" = "Degraded";
"outage.severity.major" = "Outage";
"health.operational" = "Everything is working";
"health.maintenance" = "Planned maintenance in your area";
"health.degraded" = "Your service may be affected";
"health.outage" = "There's an outage affecting your service";
"health.unknown" = "Status unavailable";
"health.issue.routerOffline" = "Your router is offline";
"health.issue.routerDegraded" = "Your router is reporting problems";
"health.issue.router.rebooting" = "Your router is restarting";
"health.issue.router.updating" = "Your router is installing an update";
"health.issue.areaDegraded" = "Reduced performance in your area";
"health.issue.slowSpeed" = "Your last speed test was slower than expected";

/* Router and Wi-Fi */
"router.state.online" = "Online";
"router.state.offline" = "Offline";
"router.state.rebooting" = "Restarting";
"router.state.updating" = "Updating";
"router.state.degraded" = "Degraded";
"wifi.reboot" = "Restart router";
"wifi.rebootConfirm" = "Restarting disconnects every device for a few minutes.";
"wifi.reboot.done" = "Your router is back online";
"wifi.reboot.notRecovered" = "Your router hasn't come back online";
"wifi.reboot.progress.rebooting" = "Restarting…";
"wifi.reboot.progress.offline" = "Waiting for router…";
"wifi.reboot.progress.updating" = "Installing update…";
"wifi.reboot.progress.online" = "Back online";
"wifi.reboot.progress.degraded" = "Reconnecting…";
"wifi.changeNetwork" = "Change network";
"wifi.devices" = "Devices";
"wifi.block" = "Block";
"wifi.unblock" = "Unblock";
"wifi.blocked" = "Blocked";
"wifi.rename" = "Rename";
"wifi.renameDevice" = "Rename device";
"wifi.deviceName" = "Device name";
"wifi.deviceSummary" = "%ld online · %ld blocked";
"wifi.noDevices" = "No devices connected";
"wifi.noRouter" = "No router found";
"wifi.networks" = "Networks";
"wifi.uptime" = "Up for %@";
"wifi.ssid" = "Network name";
"wifi.security" = "Security";
"wifi.security.wpa2" = "WPA2";
"wifi.security.wpa3" = "WPA3";
"wifi.security.wpa2_wpa3" = "WPA2/WPA3";
"wifi.changePassphrase" = "Change password";
"wifi.passphrase" = "New password";
"wifi.confirmPassphrase" = "Confirm password";
"wifi.saved" = "Wi-Fi settings saved";
"wifi.disconnectWarning" = "All devices, including this phone, will need to reconnect.";
"wifi.validation.ssidRequired" = "Enter a network name.";
"wifi.validation.ssidWhitespace" = "Network names can't start or end with a space.";
"wifi.validation.ssidTooLong" = "Network name is too long.";
"wifi.validation.ssidCharacters" = "Network name contains characters the router doesn't support.";
"wifi.validation.passTooShort" = "Use at least 8 characters.";
"wifi.validation.passTooLong" = "Use 63 characters or fewer.";
"wifi.validation.passCharacters" = "Use letters, numbers and standard symbols only.";
"wifi.validation.passEqualsSSID" = "The password can't be the network name.";
"wifi.validation.passWeak" = "Choose a stronger password.";
"wifi.validation.mismatch" = "Passwords don't match.";
"signal.excellent" = "Excellent signal";
"signal.good" = "Good signal";
"signal.fair" = "Fair signal";
"signal.poor" = "Poor signal";
"signal.unknown" = "Signal unknown";

/* Speed test */
"speedtest.ready" = "Ready";
"speedtest.server" = "Finding a server…";
"speedtest.latency" = "Measuring latency…";
"speedtest.download" = "Download";
"speedtest.upload" = "Upload";
"speedtest.done" = "Download";
"speedtest.failed" = "Test failed";
"speedtest.start" = "Start test";
"speedtest.ping" = "Ping";
"speedtest.history" = "Recent tests";
"speedtest.verdict.great" = "You're getting the speed you pay for";
"speedtest.verdict.ok" = "Good speed for Wi-Fi";
"speedtest.verdict.belowExpected" = "Slower than your plan. Try troubleshooting.";

/* Troubleshooting */
"troubleshoot.intro" = "We'll check for outages, look at your router and connected devices, and suggest fixes.";
"troubleshoot.begin" = "Start";
"troubleshoot.checking" = "Checking your connection…";
"troubleshoot.outage" = "A known outage is affecting your service";
"troubleshoot.rebootTitle" = "Restart your router?";
"troubleshoot.rebootBody" = "Your %@ is reporting problems. A restart fixes most issues and takes about 3 minutes.";
"troubleshoot.skip" = "Skip";
"troubleshoot.noIssues" = "We didn't find any problems";
"troubleshoot.fixed" = "That fixed it";
"troubleshoot.notFixed" = "Still having problems";
"troubleshoot.tryReboot" = "Restart my router anyway";
"troubleshoot.resolved" = "Glad that's sorted";
"troubleshoot.rec.waitForOutage" = "Engineers are working on an outage in your area. Your service will return once it's fixed.";
"troubleshoot.rec.checkPower" = "Check the router is plugged in and the fibre cable is firmly connected.";
"troubleshoot.rec.restartRouter" = "Restart your router.";
"troubleshoot.rec.moveCloser" = "Some devices have a weak signal. Move them closer to the router.";
"troubleshoot.rec.switch5GHz" = "Some nearby devices are on the slower 2.4 GHz band. Reconnect them to 5 GHz.";
"troubleshoot.rec.reduceDevices" = "Lots of devices are online. Pause any you're not using.";
"troubleshoot.rec.testWired" = "Run a speed test on a device plugged in with a cable.";
"troubleshoot.rec.contactSupport" = "Contact support so we can investigate.";

/* Support */
"support.troubleshoot" = "Fix my connection";
"support.appointments" = "Engineer visits";
"support.settings" = "Settings";
"tickets.empty" = "No support tickets";
"tickets.includeClosed" = "Show closed tickets";
"tickets.new" = "New ticket";
"tickets.section.needsReply" = "Waiting for you";
"tickets.section.open" = "Open";
"tickets.section.closed" = "Closed";
"tickets.category" = "Topic";
"tickets.priority" = "Urgency";
"tickets.subject" = "Subject";
"tickets.description" = "What's happening?";
"tickets.charactersLeft" = "%ld characters left";
"tickets.submit" = "Submit";
"tickets.created" = "Ticket created";
"tickets.createdReference" = "Your reference is %@";
"ticket.title" = "Ticket";
"ticket.awaitingYou" = "We need more information from you";
"ticket.bookVisit" = "Book a visit";
"ticket.chat" = "Chat now";
"ticket.replyPlaceholder" = "Write a reply";
"ticket.send" = "Send";
"ticket.sending" = "Sending…";
"ticket.status.open" = "Open";
"ticket.status.in_progress" = "In progress";
"ticket.status.pending_customer" = "Waiting for you";
"ticket.status.resolved" = "Resolved";
"ticket.status.closed" = "Closed";
"ticket.category.connectivity" = "Connection";
"ticket.category.billing" = "Billing";
"ticket.category.equipment" = "Equipment";
"ticket.category.installation" = "Installation";
"ticket.category.account" = "Account";
"ticket.category.other" = "Other";
"ticket.priority.p1" = "No service at all";
"ticket.priority.p2" = "Service badly affected";
"ticket.priority.p3" = "Some disruption";
"ticket.priority.p4" = "General question";
"ticket.validation.subjectRequired" = "Enter a subject.";
"ticket.validation.subjectLength" = "Use 5 to 120 characters.";
"ticket.validation.descriptionRequired" = "Describe the problem.";
"ticket.validation.descriptionLength" = "Use 20 to 4000 characters.";
"ticket.validation.commentRequired" = "Write a message.";
"ticket.validation.commentLength" = "Message is too long.";
"chat.connected" = "Connected to an agent";
"chat.wait" = "An agent will join in about %ld min";
"chat.unavailable" = "No agents are available right now.";

/* Appointments */
"appointments.title" = "Engineer visits";
"appointments.empty" = "No visits booked";
"appointments.upcoming" = "Upcoming";
"appointments.past" = "Past";
"appointments.noneUpcoming" = "No upcoming visits";
"appointments.book" = "Book a visit";
"appointments.reschedule" = "Reschedule";
"appointments.cancel" = "Cancel visit";
"appointments.cancelTitle" = "Cancel this visit?";
"appointments.cancelReason" = "Reason (optional)";
"appointments.cancelConfirm" = "Cancel visit";
"appointments.keep" = "Keep visit";
"appointments.tooLateTitle" = "Too late to change online";
"appointments.tooLateMessage" = "Visits within 24 hours can only be changed by phone.";
"appointments.callSupport" = "Call support";
"appointments.visitType" = "Visit type";
"appointments.chooseSlot" = "Choose a time";
"appointments.noSlots" = "No times available";
"appointments.slotCount" = "%ld slots";
"appointments.slotTaken" = "That time was just taken. Please choose another.";
"appointments.notes" = "Notes for the engineer";
"appointments.confirm" = "Confirm";
"appointments.confirmed" = "Visit booked";
"appointments.confirmedDetail" = "We'll text you when the engineer is on the way.";
"appointment.technician" = "Engineer: %@";
"appointment.error.notChangeable" = "This visit can no longer be changed.";
"appointment.validation.notesLength" = "Notes must be 500 characters or fewer.";
"appointment.type.installation" = "Installation";
"appointment.type.repair" = "Repair";
"appointment.type.equipment_swap" = "Equipment swap";
"appointment.type.survey" = "Site survey";
"appointment.status.scheduled" = "Scheduled";
"appointment.status.en_route" = "On the way";
"appointment.status.in_progress" = "In progress";
"appointment.status.completed" = "Completed";
"appointment.status.cancelled" = "Cancelled";

/* Settings and profile */
"settings.title" = "Settings";
"settings.profile" = "Profile";
"settings.notifications" = "Notifications";
"settings.notify.billing" = "Bills and payments";
"settings.notify.outages" = "Outages";
"settings.notify.appointments" = "Engineer visits";
"settings.notify.tickets" = "Ticket updates";
"settings.notify.marketing" = "Offers and news";
"settings.saving" = "Saving…";
"settings.security" = "Security";
"settings.biometric.faceID" = "Unlock with Face ID";
"settings.biometric.touchID" = "Unlock with Touch ID";
"settings.biometric.opticID" = "Unlock with Optic ID";
"settings.biometric.none" = "Biometric unlock";
"settings.biometricReason" = "Confirm it's you to turn on biometric unlock";
"settings.biometricFailed" = "Biometric unlock couldn't be changed";
"settings.biometricUnavailable" = "Biometric unlock isn't set up on this device.";
"settings.privacy" = "Privacy";
"settings.analytics" = "Share usage analytics";
"settings.analyticsFooter" = "Helps us improve the app. Never includes your payment details.";
"settings.signOut" = "Sign out";
"settings.signOutConfirm" = "Sign out of Go Kinetic?";
"settings.version" = "Version %@";
"profile.contact" = "Contact details";
"profile.email" = "Email";
"profile.phone" = "Mobile number";
"profile.saved" = "Contact details updated";
"profile.discard" = "Discard changes";
"profile.validation.email" = "Enter a valid email address.";
"profile.validation.phone" = "Enter a valid phone number.";
```

## apps/gokinetic-consumer-ios/Sources/GoKineticUI/Theme.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticUI/Theme.swift`.

```swift
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
```

## apps/gokinetic-consumer-ios/Sources/GoKineticUI/ViewState.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticUI/ViewState.swift`.

```swift
import Foundation
import GoKineticCore

/// Uniform load state for screens. View models expose one of these per
/// asynchronously-loaded section so every screen handles loading, empty
/// and error states the same way.
public enum ViewState<Value> {
    case idle
    case loading(previous: Value?)
    case loaded(Value)
    case empty
    case failed(UserFacingError, previous: Value?)

    public var value: Value? {
        switch self {
        case .loaded(let value): return value
        case .loading(let previous), .failed(_, let previous): return previous
        case .idle, .empty: return nil
        }
    }

    public var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }

    public var error: UserFacingError? {
        if case .failed(let error, _) = self { return error }
        return nil
    }

    /// Moves to loading while keeping whatever is on screen (pull to refresh).
    public func reloading() -> ViewState<Value> {
        .loading(previous: value)
    }

    /// Moves to failed while keeping stale content visible.
    public func failing(_ error: Error) -> ViewState<Value> {
        .failed(UserFacingError(error), previous: value)
    }
}

extension ViewState: Equatable where Value: Equatable {
    public static func == (lhs: ViewState<Value>, rhs: ViewState<Value>) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle), (.empty, .empty): return true
        case let (.loading(a), .loading(b)): return a == b
        case let (.loaded(a), .loaded(b)): return a == b
        case let (.failed(e1, a), .failed(e2, b)): return e1 == e2 && a == b
        default: return false
        }
    }
}

public extension ViewState where Value: Collection {
    /// Maps an empty collection to `.empty` so screens show their empty state.
    static func from(_ collection: Value) -> ViewState<Value> {
        collection.isEmpty ? .empty : .loaded(collection)
    }
}
```

## apps/gokinetic-consumer-ios/Tests/GoKineticCoreTests/ConnectionDiagnosticsTests.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Tests/GoKineticCoreTests/ConnectionDiagnosticsTests.swift`.

```swift
import XCTest
@testable import GoKineticCore
import GoKineticTestSupport

final class ConnectionDiagnosticsTests: XCTestCase {
    private let now = Fixtures.date("2025-03-10T12:00:00Z")

    func testKnownOutageShortCircuitsAdvice() {
        var report = DiagnosticReport(startedAt: now)
        let eta = Fixtures.date("2025-03-10T18:00:00Z")
        report.outage = Fixtures.outage(eta: eta)
        report.routerBefore = Fixtures.router(state: .offline)
        XCTAssertEqual(report.recommendations(at: now), [.waitForOutage(estimatedResolution: eta)])
    }

    func testOfflineRouterAdviceDependsOnRebootAttempt() {
        var report = DiagnosticReport(startedAt: now)
        report.routerBefore = Fixtures.router(state: .offline)
        XCTAssertEqual(report.recommendations(at: now), [.checkPowerAndCables, .restartRouter])
        report.rebootAttempted = true
        XCTAssertEqual(report.recommendations(at: now), [.checkPowerAndCables, .contactSupport])
    }

    func testDeviceSignalAdvice() {
        var report = DiagnosticReport(startedAt: now)
        report.routerBefore = Fixtures.router()
        report.devices = [
            Fixtures.device(id: "D-1", name: "Tablet", band: .ghz5, signal: -82),
            Fixtures.device(id: "D-2", name: "TV", band: .ghz2_4, signal: -60),
            Fixtures.device(id: "D-3", name: "Old phone", band: .ghz2_4, signal: -50,
                            lastActive: Fixtures.date("2025-03-09T12:00:00Z")),
            Fixtures.device(id: "D-4", name: "Desktop", band: nil, signal: nil, wired: true)
        ]
        XCTAssertEqual(report.recommendations(at: now), [.moveCloser(deviceNames: ["Tablet"]), .switchTo5GHz(deviceNames: ["TV"])])
    }

    func testSlowSpeedSuggestsRestartThenWiredTest() {
        var report = DiagnosticReport(startedAt: now)
        report.routerBefore = Fixtures.router()
        report.speedTest = Fixtures.speedTest(download: 100)
        report.plan = Fixtures.plan(mbps: 1000)
        XCTAssertEqual(report.recommendations(at: now), [.restartRouter, .testOverEthernet])
    }

    func testEscalationTicketCarriesDiagnosticsAndPriority() {
        var report = DiagnosticReport(startedAt: now)
        report.routerBefore = Fixtures.router(state: .offline)
        report.rebootAttempted = true
        let request = report.ticketRequest(serviceId: "SVC-1", customerNotes: "  No lights on the box ")

        XCTAssertEqual(request.priority, .p1)
        XCTAssertEqual(request.category, .connectivity)
        XCTAssertTrue(request.description.contains("Customer notes: No lights on the box"))
        XCTAssertTrue(request.description.contains("Reboot attempted: yes"))
        XCTAssertTrue(TicketValidator.validate(subject: request.subject, description: request.description).isValid)
    }

    func testRecoveryMonitorPollsUntilOnline() async throws {
        let router = MockRouterRepository()
        router.statusStub.enqueue(.failure(APIError.server(status: 503, problem: nil)))
        router.statusStub.enqueue(.success(Fixtures.router(state: .rebooting)))
        router.statusStub.enqueue(.success(Fixtures.router(state: .online)))
        let sleeper = ImmediateSleeper()
        let monitor = RouterRecoveryMonitor(router: router, sleeper: sleeper, initialDelay: 30, pollInterval: 15, maxPolls: 5)
        let observed = Recorder<RouterState>()

        let status = try await monitor.rebootAndWait(routerId: "RTR-1", serviceId: "SVC-1") { observed.record($0) }

        XCTAssertEqual(status.state, .online)
        XCTAssertEqual(router.reboots.calls, ["RTR-1"])
        XCTAssertEqual(observed.calls, [.rebooting, .rebooting, .online])
        XCTAssertEqual(sleeper.delays.calls, [30, 15, 15])
    }

    func testRecoveryMonitorGivesUpAfterMaxPolls() async {
        let router = MockRouterRepository()
        router.statusStub.returns(Fixtures.router(state: .offline))
        let monitor = RouterRecoveryMonitor(router: router, sleeper: ImmediateSleeper(), maxPolls: 3)
        do {
            _ = try await monitor.rebootAndWait(routerId: "RTR-1", serviceId: "SVC-1")
            XCTFail("Expected failure")
        } catch {
            XCTAssertEqual(error as? RouterRecoveryMonitor.RecoveryError, .didNotRecover(lastKnown: .offline))
        }
        XCTAssertEqual(router.statusStub.callCount, 3)
    }
}
```

## apps/gokinetic-consumer-ios/Tests/GoKineticCoreTests/PaymentPlanningTests.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Tests/GoKineticCoreTests/PaymentPlanningTests.swift`.

```swift
import XCTest
@testable import GoKineticCore
import GoKineticTestSupport

final class PaymentPlanningTests: XCTestCase {
    private let now = Fixtures.date("2025-03-10T12:00:00Z")

    func testAmountOptionsListBalanceThenOverdueInvoiceFirst() {
        let overdue = Fixtures.invoice(id: "OLD", total: 3_000, due: Fixtures.date("2025-03-01T00:00:00Z"))
        let current = Fixtures.invoice(id: "NEW", total: 5_000, due: Fixtures.date("2025-03-20T00:00:00Z"))
        let paid = Fixtures.invoice(id: "PAID", total: 5_000, paid: 5_000, status: .paid)

        let options = PaymentPlanner.amountOptions(balance: Fixtures.usd(8_000), invoices: [current, paid, overdue], at: now)

        XCTAssertEqual(options.map(\.kind), [.balance, .overdueInvoice, .invoice])
        XCTAssertEqual(options.map(\.target), [.accountBalance, .invoice(id: "OLD"), .invoice(id: "NEW")])
    }

    func testInvoiceMatchingBalanceIsNotOfferedTwice() {
        let invoice = Fixtures.invoice(total: 8_499)
        let options = PaymentPlanner.amountOptions(balance: Fixtures.usd(8_499), invoices: [invoice], at: now)
        XCTAssertEqual(options.count, 1)
        XCTAssertEqual(options.first?.kind, .balance)
    }

    func testCreditBalanceStillOffersUnpaidInvoices() {
        let invoice = Fixtures.invoice(total: 2_000)
        let options = PaymentPlanner.amountOptions(balance: Fixtures.usd(-500), invoices: [invoice], at: now)
        XCTAssertEqual(options.map(\.kind), [.invoice])
    }

    func testPreferredMethodSkipsExpiredDefault() {
        let expiredDefault = Fixtures.method(id: "OLD", isDefault: true, expiryYear: 2024)
        let valid = Fixtures.method(id: "OK", isDefault: false)
        XCTAssertEqual(PaymentPlanner.preferredMethod([expiredDefault, valid], at: now)?.id, "OK")
        XCTAssertNil(PaymentPlanner.preferredMethod([expiredDefault], at: now))
    }

    func testOverpaymentAllowanceIgnoresVoidAndOtherCurrencies() {
        let invoices = [
            Fixtures.invoice(id: "A", total: 6_000),
            Fixtures.invoice(id: "B", total: 9_000, status: .void),
            Invoice(id: "C", number: "C", issuedAt: now, dueAt: now, periodStart: now, periodEnd: now,
                    total: Money(minorUnits: 50_000, currency: "EUR"), amountPaid: Money(minorUnits: 0, currency: "EUR"),
                    status: .open, lineItems: [])
        ]
        XCTAssertEqual(PaymentPlanner.overpaymentAllowance(invoices: invoices, currency: "USD"), Fixtures.usd(6_000))
    }

    func testDraftKeepsKeyWhenTermsUnchangedAndRotatesOnChange() {
        var counter = 0
        let makeKey: () -> String = { counter += 1; return "K\(counter)" }
        var draft = PaymentDraft(idempotencyKey: "K0")

        XCTAssertTrue(draft.update(amount: .some(Fixtures.usd(1_000)), paymentMethodId: .some("PM-1"), makeKey: makeKey))
        XCTAssertEqual(draft.idempotencyKey, "K1")
        XCTAssertFalse(draft.update(amount: .some(Fixtures.usd(1_000)), paymentMethodId: .some("PM-1"), makeKey: makeKey))
        XCTAssertEqual(draft.idempotencyKey, "K1")
        XCTAssertTrue(draft.update(target: .invoice(id: "INV-9"), makeKey: makeKey))
        XCTAssertEqual(draft.idempotencyKey, "K2")

        let request = draft.request
        XCTAssertEqual(request?.invoiceId, "INV-9")
        XCTAssertEqual(request?.idempotencyKey, "K2")
    }

    func testDraftWithoutMethodHasNoRequest() {
        let draft = PaymentDraft(amount: Fixtures.usd(100))
        XCTAssertNil(draft.request)
    }

    func testFailureClassificationFromProblemCodes() {
        XCTAssertEqual(PaymentFailure(Fixtures.validationProblem(code: "card-declined")), .declined)
        XCTAssertEqual(PaymentFailure(Fixtures.validationProblem(code: "insufficient-funds")), .insufficientFunds)
        XCTAssertEqual(PaymentFailure(Fixtures.validationProblem(code: "amount-too-large", field: "amount", message: "Too much")),
                       .amountRejected(detail: "Too much"))
        XCTAssertEqual(PaymentFailure(APIError.conflict(nil)), .duplicate)
        XCTAssertEqual(PaymentFailure(APIError.timedOut), .outcomeUnknown)
        XCTAssertEqual(PaymentFailure(APIError.server(status: 504, problem: nil)), .outcomeUnknown)
        XCTAssertEqual(PaymentFailure(APIError.server(status: 500, problem: nil)).messageKey, "error.server")
    }

    func testOnlyUnknownOutcomesKeepTheKey() {
        XCTAssertFalse(PaymentFailure.outcomeUnknown.isFinal)
        XCTAssertTrue(PaymentFailure.declined.isFinal)
    }

    func testFailedPaymentStatusMapsReason() {
        XCTAssertEqual(PaymentFailure(payment: Fixtures.payment(status: .failed, failureReason: "INSUFFICIENT_FUNDS")), .insufficientFunds)
        XCTAssertEqual(PaymentFailure(payment: Fixtures.payment(status: .failed, failureReason: nil)), .declined)
        XCTAssertNil(PaymentFailure(payment: Fixtures.payment(status: .pending)))
    }
}
```

## apps/gokinetic-consumer-ios/Tests/GoKineticCoreTests/UsageAndHealthTests.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Tests/GoKineticCoreTests/UsageAndHealthTests.swift`.

```swift
import XCTest
@testable import GoKineticCore
import GoKineticTestSupport

final class UsageInsightsTests: XCTestCase {
    private let gb: Int64 = 1_000_000_000

    private func report(samples: [UsageSample], cap: Int64?) -> UsageReport {
        UsageReport(serviceId: "SVC-1", period: .month, samples: samples, dataCapBytes: cap,
                    cycleStart: Fixtures.date("2025-03-01T00:00:00Z"), cycleEnd: Fixtures.date("2025-03-31T00:00:00Z"))
    }

    private func sample(_ iso: String, down: Int64, up: Int64 = 0) -> UsageSample {
        UsageSample(timestamp: Fixtures.date(iso), downloadBytes: down, uploadBytes: up)
    }

    func testDailyTotalsCollapseHourlySamples() {
        let samples = [sample("2025-03-01T01:00:00Z", down: 2 * gb), sample("2025-03-01T20:00:00Z", down: gb, up: gb),
                       sample("2025-03-02T09:00:00Z", down: 5 * gb)]
        let days = UsageInsights.dailyTotals(samples)
        XCTAssertEqual(days.map(\.totalBytes), [4 * gb, 5 * gb])
        XCTAssertEqual(days.first?.day, Fixtures.date("2025-03-01T00:00:00Z"))
    }

    func testUnlimitedPlanHasNoBudget() {
        let insights = UsageInsights(report: report(samples: [sample("2025-03-02T00:00:00Z", down: gb)], cap: nil),
                                     now: Fixtures.date("2025-03-10T12:00:00Z"))
        XCTAssertEqual(insights.capStatus, .unlimited)
        XCTAssertNil(insights.dailyBudget)
    }

    func testProjectionOverCapIsFlaggedBeforeCapIsReached() {
        // 400 GB in the first third of the cycle projects to ~1.2 TB against a 1 TB cap.
        let insights = UsageInsights(report: report(samples: [sample("2025-03-05T00:00:00Z", down: 400 * gb)], cap: 1_000 * gb),
                                     now: Fixtures.date("2025-03-11T00:00:00Z"))
        guard case .projectedToExceed(let projected) = insights.capStatus else {
            return XCTFail("Expected projection warning, got \(insights.capStatus)")
        }
        XCTAssertGreaterThan(projected, 1_000 * gb)
        XCTAssertEqual(insights.daysLeftInCycle, 20)
        XCTAssertEqual(insights.dailyBudget, 600 * gb / 20)
    }

    func testExceededReportsOverage() {
        let insights = UsageInsights(report: report(samples: [sample("2025-03-05T00:00:00Z", down: 1_100 * gb)], cap: 1_000 * gb),
                                     now: Fixtures.date("2025-03-30T00:00:00Z"))
        XCTAssertEqual(insights.capStatus, .exceeded(overageBytes: 100 * gb))
        XCTAssertEqual(insights.dailyBudget, 0)
    }

    func testPeakHourPrefersBusiestHourAcrossDays() {
        let samples = [sample("2025-03-01T21:00:00Z", down: 3 * gb), sample("2025-03-02T21:00:00Z", down: 3 * gb),
                       sample("2025-03-02T08:00:00Z", down: 5 * gb)]
        XCTAssertEqual(UsageInsights.peakHour(samples, calendar: .gregorianUTC), 21)
        XCTAssertNil(UsageInsights.peakHour([], calendar: .gregorianUTC))
    }
}

final class ServiceHealthTests: XCTestCase {
    private let now = Fixtures.date("2025-03-10T12:00:00Z")

    func testMajorOutageOnMyServiceWins() {
        let outage = Fixtures.outage(severity: .major)
        let health = ServiceHealthEvaluator.evaluate(outages: [outage], router: Fixtures.router(state: .offline),
                                                     latestSpeedTest: nil, plan: nil, now: now)
        XCTAssertEqual(health, .outage(outage))
        XCTAssertFalse(health.suggestsTroubleshooting)
    }

    func testOutagesElsewhereAreIgnored() {
        let health = ServiceHealthEvaluator.evaluate(outages: [Fixtures.outage(affectsMe: false)], router: Fixtures.router(),
                                                     latestSpeedTest: nil, plan: nil, now: now)
        XCTAssertEqual(health, .operational)
    }

    func testRouterAndSlowSpeedCombineIntoDegraded() {
        let health = ServiceHealthEvaluator.evaluate(outages: [], router: Fixtures.router(state: .degraded),
                                                     latestSpeedTest: Fixtures.speedTest(download: 120), plan: Fixtures.plan(mbps: 500), now: now)
        XCTAssertEqual(health, .degraded([.routerDegraded, .slowSpeed(measuredMbps: 120, planMbps: 500)]))
    }

    func testStaleSpeedTestIsDisregarded() {
        let old = Fixtures.speedTest(download: 50, measuredAt: Fixtures.date("2025-03-08T12:00:00Z"))
        let health = ServiceHealthEvaluator.evaluate(outages: [], router: Fixtures.router(), latestSpeedTest: old,
                                                     plan: Fixtures.plan(), now: now)
        XCTAssertEqual(health, .operational)
    }

    func testPlannedWorkWithoutOtherIssuesIsMaintenance() {
        let planned = Fixtures.outage(severity: .info)
        XCTAssertEqual(ServiceHealthEvaluator.evaluate(outages: [planned], router: nil, latestSpeedTest: nil, plan: nil, now: now),
                       .maintenance(planned))
        XCTAssertEqual(ServiceHealthEvaluator.evaluate(outages: nil, router: nil, latestSpeedTest: nil, plan: nil, now: now), .unknown)
    }
}

final class AppointmentPolicyTests: XCTestCase {
    private let now = Fixtures.date("2025-03-10T12:00:00Z")

    func testEligibilityHonoursCutoffAndStatus() {
        let farOff = Fixtures.appointment(slot: Fixtures.slot(id: "A", start: "2025-03-14T08:00:00Z"))
        let tomorrowMorning = Fixtures.appointment(slot: Fixtures.slot(id: "B", start: "2025-03-11T08:00:00Z"))
        let enRoute = Fixtures.appointment(status: .enRoute)
        XCTAssertEqual(AppointmentPolicy.eligibility(for: farOff, at: now), .allowed)
        XCTAssertEqual(AppointmentPolicy.eligibility(for: tomorrowMorning, at: now), .tooLate)
        XCTAssertEqual(AppointmentPolicy.eligibility(for: enRoute, at: now), .notChangeable)
    }

    func testGroupingByLocalDayUsesCalendarTimeZone() {
        var newYork = Calendar(identifier: .gregorian)
        newYork.timeZone = TimeZone(identifier: "America/New_York")!
        // 02:00 UTC on the 13th is still the evening of the 12th in New York.
        let slots = [Fixtures.slot(id: "late", start: "2025-03-13T02:00:00Z", hours: 2),
                     Fixtures.slot(id: "morning", start: "2025-03-12T13:00:00Z")]
        let days = AppointmentPolicy.groupByDay(slots, calendar: newYork)
        XCTAssertEqual(days.count, 1)
        XCTAssertEqual(days.first?.slots.map(\.id), ["morning", "late"])
    }

    func testReschedulingExcludesCurrentAndTooSoonSlots() {
        let current = Fixtures.slot(id: "S-0", start: "2025-03-14T08:00:00Z")
        let appointment = Fixtures.appointment(slot: current)
        let slots = [current,
                     Fixtures.slot(id: "same-time", start: "2025-03-14T08:00:00Z"),
                     Fixtures.slot(id: "too-soon", start: "2025-03-11T06:00:00Z"),
                     Fixtures.slot(id: "ok", start: "2025-03-15T08:00:00Z")]
        XCTAssertEqual(AppointmentPolicy.reschedulingOptions(slots, for: appointment, at: now).map(\.id), ["ok"])
    }

    func testNotesLimit() {
        XCTAssertTrue(AppointmentPolicy.validateNotes(String(repeating: "a", count: 500)).isValid)
        XCTAssertFalse(AppointmentPolicy.validateNotes(String(repeating: "a", count: 501)).isValid)
    }
}
```

## apps/gokinetic-consumer-ios/Tests/GoKineticFeaturesTests/BillingViewModelTests.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Tests/GoKineticFeaturesTests/BillingViewModelTests.swift`.

```swift
import XCTest
@testable import GoKineticFeatures
import GoKineticCore
import GoKineticTestSupport

@MainActor
final class PayBillViewModelTests: XCTestCase {
    private var accounts: MockAccountRepository!
    private var billing: MockBillingRepository!
    private var analytics: RecordingAnalytics!

    override func setUp() async throws {
        accounts = MockAccountRepository()
        billing = MockBillingRepository()
        analytics = RecordingAnalytics()
        accounts.summaryStub.returns(Fixtures.summary(balance: 8_000))
        billing.invoicesStub.returns(Fixtures.page([
            Fixtures.invoice(id: "OLD", total: 3_000, due: Fixtures.date("2025-03-01T00:00:00Z")),
            Fixtures.invoice(id: "NEW", total: 5_000)
        ]))
        billing.methodsStub.returns([Fixtures.method(id: "EXP", isDefault: true, expiryYear: 2020), Fixtures.method(id: "PM-2", isDefault: false)])
    }

    private func makeViewModel(invoiceId: String? = nil) -> PayBillViewModel {
        PayBillViewModel(invoiceId: invoiceId, accounts: accounts, billing: billing, analytics: analytics,
                         clock: FixedClock(), locale: Locale(identifier: "en_US"))
    }

    func testLoadSelectsBalanceAndFirstUsableMethod() async {
        let viewModel = makeViewModel()
        await viewModel.load()

        XCTAssertEqual(viewModel.resolvedAmount, Fixtures.usd(8_000))
        XCTAssertEqual(viewModel.selectedMethodId, "PM-2")
        XCTAssertEqual(viewModel.setup.value?.hasExpiredMethods, true)
        XCTAssertTrue(viewModel.canSubmit)
    }

    func testPreselectedInvoiceIsHonoured() async {
        let viewModel = makeViewModel(invoiceId: "OLD")
        await viewModel.load()
        XCTAssertEqual(viewModel.selectedOption?.target, .invoice(id: "OLD"))
        XCTAssertEqual(viewModel.resolvedAmount, Fixtures.usd(3_000))
    }

    func testCustomAmountAboveAllowanceIsRejected() async {
        let viewModel = makeViewModel()
        await viewModel.load()
        viewModel.amountChoice = .custom
        viewModel.customAmountText = "200.00" // balance 80.00 + allowance 50.00
        XCTAssertFalse(viewModel.canSubmit)
        viewModel.customAmountText = "120.00"
        XCTAssertTrue(viewModel.canSubmit)
    }

    func testSuccessfulPaymentSendsInvoiceTarget() async {
        billing.payStub.returns(Fixtures.payment(amount: 3_000))
        let viewModel = makeViewModel(invoiceId: "OLD")
        await viewModel.load()
        await viewModel.submit()

        XCTAssertEqual(viewModel.phase, .succeeded(Fixtures.payment(amount: 3_000)))
        XCTAssertEqual(billing.payRequests.last?.invoiceId, "OLD")
        XCTAssertEqual(billing.payRequests.last?.paymentMethodId, "PM-2")
        XCTAssertEqual(analytics.events.calls, [.paymentSubmitted(amountMinor: 3_000, currency: "USD")])
    }

    func testRetryAfterUnknownOutcomeReusesIdempotencyKey() async {
        billing.payStub.enqueue(.failure(APIError.timedOut))
        billing.payStub.enqueue(.success(Fixtures.payment()))
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.submit()
        XCTAssertEqual(viewModel.phase, .failed(.outcomeUnknown))
        await viewModel.retry()

        let keys = billing.payRequests.calls.map(\.idempotencyKey)
        XCTAssertEqual(keys.count, 2)
        XCTAssertEqual(keys[0], keys[1])
        XCTAssertEqual(viewModel.phase, .succeeded(Fixtures.payment()))
    }

    func testDeclinedPaymentRotatesKeyForNextAttempt() async {
        billing.payStub.enqueue(.success(Fixtures.payment(status: .failed, failureReason: "CARD_DECLINED")))
        billing.payStub.enqueue(.success(Fixtures.payment()))
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.submit()
        XCTAssertEqual(viewModel.phase, .failed(.declined))
        XCTAssertTrue(analytics.events.calls.contains(.paymentFailed(code: "declined")))
        await viewModel.submit()

        let keys = billing.payRequests.calls.map(\.idempotencyKey)
        XCTAssertNotEqual(keys[0], keys[1])
    }
}

@MainActor
final class BillingViewModelTests: XCTestCase {
    func testAutopayRollsBackWhenServerRejects() async {
        let accounts = MockAccountRepository()
        let billing = MockBillingRepository()
        accounts.summaryStub.returns(Fixtures.summary())
        billing.invoicesStub.returns(Fixtures.page([Fixtures.invoice()]))
        billing.methodsStub.returns([Fixtures.method()])
        billing.autopayStub.returns(AutopaySettings(enabled: false, paymentMethodId: nil))
        billing.setAutopayStub.fails(APIError.server(status: 500, problem: nil))
        let viewModel = BillingViewModel(accounts: accounts, billing: billing, analytics: RecordingAnalytics(), clock: FixedClock())

        await viewModel.load()
        await viewModel.setAutopay(enabled: true)

        XCTAssertEqual(billing.autopayRequests.last, AutopaySettings(enabled: true, paymentMethodId: "PM-1"))
        XCTAssertEqual(viewModel.overview.value?.autopay.enabled, false)
        XCTAssertEqual(viewModel.inlineError?.kind, .server)
    }

    func testEnablingAutopayWithoutValidMethodIsBlockedLocally() async {
        let accounts = MockAccountRepository()
        let billing = MockBillingRepository()
        accounts.summaryStub.returns(Fixtures.summary())
        billing.invoicesStub.returns(Fixtures.page([Invoice]()))
        billing.methodsStub.returns([Fixtures.method(expiryYear: 2020)])
        billing.autopayStub.returns(AutopaySettings(enabled: false, paymentMethodId: nil))
        let viewModel = BillingViewModel(accounts: accounts, billing: billing, analytics: RecordingAnalytics(), clock: FixedClock())

        await viewModel.load()
        await viewModel.setAutopay(enabled: true)

        XCTAssertTrue(billing.autopayRequests.calls.isEmpty)
        XCTAssertEqual(viewModel.inlineError?.titleKey, "billing.autopay.noMethod")
        XCTAssertEqual(viewModel.invoices, .empty)
    }

    func testInvoicePagesAppendWithoutDuplicates() async {
        let accounts = MockAccountRepository()
        let billing = MockBillingRepository()
        accounts.summaryStub.returns(Fixtures.summary())
        billing.methodsStub.returns([])
        billing.autopayStub.returns(AutopaySettings(enabled: false, paymentMethodId: nil))
        billing.invoicesStub.enqueue(.success(Page(items: [Fixtures.invoice(id: "A"), Fixtures.invoice(id: "B")], page: 1, pageSize: 2, total: 4)))
        billing.invoicesStub.enqueue(.success(Page(items: [Fixtures.invoice(id: "B"), Fixtures.invoice(id: "C")], page: 2, pageSize: 2, total: 4)))
        let viewModel = BillingViewModel(accounts: accounts, billing: billing, analytics: RecordingAnalytics(), clock: FixedClock(), pageSize: 2)

        await viewModel.load()
        await viewModel.loadMoreIfNeeded(current: Fixtures.invoice(id: "B"))

        XCTAssertEqual(viewModel.invoices.value?.map(\.id), ["A", "B", "C"])
        XCTAssertEqual(billing.invoicePages.calls, [1, 2])
        XCTAssertFalse(viewModel.hasMoreInvoices)
    }
}
```
