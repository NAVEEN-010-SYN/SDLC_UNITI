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
