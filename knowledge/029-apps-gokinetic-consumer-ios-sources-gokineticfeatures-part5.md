# Go Kinetic Consumer mobile app (B2C): apps/gokinetic-consumer-ios/Sources/GoKineticFeatures (part 5 of 7)

- **Application:** Go Kinetic Consumer mobile app (B2C)
- **Tech stack:** Swift / SwiftUI
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 15

## Files

- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Plan/PlanViews.swift` (199 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Plan/UpgradeFlowViewModel.swift` (168 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Profile/ProfileViewModel.swift` (97 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Profile/ProfileViews.swift` (136 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Profile/SettingsViewModel.swift` (128 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Support/NewTicketViewModel.swift` (91 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Support/SupportViews.swift` (265 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Support/TicketDetailViewModel.swift` (113 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Support/TicketsViewModel.swift` (87 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Usage/UsageView.swift` (84 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Usage/UsageViewModel.swift` (135 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/WiFi/SpeedTestViewModel.swift` (104 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/WiFi/TroubleshootViewModel.swift` (136 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/WiFi/WiFiSettingsViewModel.swift` (76 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/WiFi/WiFiViewModel.swift` (160 lines)

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Plan/PlanViews.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Plan/PlanViews.swift`.

```swift
import SwiftUI
import GoKineticCore
import GoKineticUI

public struct PlanView: View {
    @StateObject private var viewModel: PlanViewModel
    private let makeUpgradeFlow: (CurrentPlan, [Plan]) -> UpgradeFlowViewModel
    @State private var showingUpgrade = false
    private let dateFormatter = DisplayDateFormatter()

    public init(viewModel: @autoclosure @escaping () -> PlanViewModel,
                makeUpgradeFlow: @escaping (CurrentPlan, [Plan]) -> UpgradeFlowViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
        self.makeUpgradeFlow = makeUpgradeFlow
    }

    public var body: some View {
        ScrollView {
            AsyncContentView(state: viewModel.state, emptyTitle: L10n.string("plan.none"),
                             retry: { Task { await viewModel.load() } }) { content in
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    currentPlanCard(content)
                    if let pending = content.current.pendingChange {
                        Banner(title: L10n.string("plan.pendingChange", pending.targetPlanName),
                               message: L10n.string("order.status.\(pending.status.rawValue.lowercased())"),
                               tone: pending.status.tone)
                    }
                    if !content.upgrades.isEmpty {
                        Text(L10n.string("plan.upgrades")).font(Theme.Typography.headline)
                        ForEach(content.upgrades) { option in upgradeRow(option) }
                        PrimaryButton(L10n.string("plan.startUpgrade"), isEnabled: viewModel.canStartUpgrade) {
                            showingUpgrade = true
                        }
                    }
                }
                .sheet(isPresented: $showingUpgrade) {
                    NavigationStack {
                        UpgradeFlowView(viewModel: makeUpgradeFlow(content.current, content.upgrades.map(\.plan)))
                    }
                }
            }
            .padding(Theme.Spacing.l)
        }
        .refreshable { await viewModel.load() }
        .navigationTitle(L10n.Tabs.plan)
    }

    private func currentPlanCard(_ content: PlanViewModel.Content) -> some View {
        let plan = content.current.plan
        return Card(title: L10n.string("plan.current")) {
            Text(plan.name).font(Theme.Typography.title)
            HStack(spacing: Theme.Spacing.m) {
                StatTile(value: Plan.speedLabel(mbps: plan.downloadMbps), caption: L10n.string("plan.download"), symbol: "arrow.down")
                StatTile(value: Plan.speedLabel(mbps: plan.uploadMbps), caption: L10n.string("plan.upload"), symbol: "arrow.up")
            }
            Text(MoneyFormatter().compactString(from: plan.monthlyPrice) + L10n.Common.perMonth)
                .font(Theme.Typography.headline)
            if let end = content.current.contractEndDate, content.contractMonthsRemaining > 0 {
                Text(L10n.string("plan.contractEnds", dateFormatter.longDate(end), content.contractMonthsRemaining))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            ForEach(plan.features, id: \.self) { feature in
                Label(feature, systemImage: "checkmark").font(.subheadline)
            }
        }
    }

    private func upgradeRow(_ option: PlanViewModel.UpgradeOption) -> some View {
        Card {
            HStack {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    HStack {
                        Text(option.plan.name).font(Theme.Typography.headline)
                        if option.isRecommended { StatusBadge(L10n.string("plan.recommended"), tone: .success) }
                    }
                    Text(option.plan.speedLabel + (option.speedMultiplierText.map { " · \($0)" } ?? ""))
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing) {
                    Text(option.priceText).font(Theme.Typography.headline)
                    Text(option.deltaText).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
}

public struct UpgradeFlowView: View {
    @StateObject private var viewModel: UpgradeFlowViewModel
    @Environment(\.dismiss) private var dismiss

    public init(viewModel: @autoclosure @escaping () -> UpgradeFlowViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        Group {
            switch viewModel.step {
            case .selectPlan:
                selection
            case .quoting:
                ProgressView(L10n.string("upgrade.quoting"))
            case .review(let quote), .submitting(let quote):
                review(quote)
            case .submitted(let order):
                submitted(order)
            case .failed(let error, _):
                ErrorStateView(error: error) { viewModel.recover() }
            }
        }
        .padding(Theme.Spacing.l)
        .navigationTitle(L10n.string("upgrade.title"))
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L10n.Common.cancel) { dismiss() }
            }
        }
        .onDisappear { viewModel.stopPolling() }
    }

    private var selection: some View {
        Form {
            Picker(L10n.string("upgrade.choosePlan"), selection: $viewModel.selectedPlanId) {
                Text(L10n.string("upgrade.choosePlan")).tag(String?.none)
                ForEach(viewModel.options) { plan in
                    Text("\(plan.name) · \(plan.speedLabel)").tag(Optional(plan.id))
                }
            }
            Picker(L10n.string("upgrade.timing"), selection: $viewModel.timing) {
                Text(L10n.string("upgrade.timing.immediate")).tag(UpgradeTiming.immediate)
                Text(L10n.string("upgrade.timing.nextCycle")).tag(UpgradeTiming.nextBillingCycle)
            }
            .pickerStyle(.segmented)
            PrimaryButton(L10n.Common.continueAction, isEnabled: viewModel.canRequestQuote) {
                Task { await viewModel.requestQuote() }
            }
        }
    }

    private func review(_ quote: UpgradeQuote) -> some View {
        let isSubmitting: Bool = { if case .submitting = viewModel.step { return true }; return false }()
        return VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            Card(title: L10n.string("upgrade.review")) {
                ForEach(Array(viewModel.reviewLines(for: quote).enumerated()), id: \.offset) { _, line in
                    HStack {
                        Text(line.label).foregroundStyle(.secondary)
                        Spacer()
                        Text(line.value).monospacedDigit()
                    }
                }
            }
            Text(L10n.string("upgrade.quoteExpires", viewModel.secondsUntilQuoteExpires(quote) / 60))
                .font(.footnote).foregroundStyle(.secondary)
            Toggle(L10n.string("upgrade.acceptTerms"), isOn: $viewModel.acceptedTerms)
            Spacer()
            PrimaryButton(L10n.string("upgrade.confirm"), isLoading: isSubmitting, isEnabled: viewModel.canSubmit) {
                Task { await viewModel.submit() }
            }
            SecondaryButton(L10n.string("upgrade.changePlan")) { viewModel.backToSelection() }
        }
    }

    private func submitted(_ order: Order) -> some View {
        VStack(spacing: Theme.Spacing.l) {
            Image(systemName: order.status == .failed ? "xmark.circle" : "checkmark.seal.fill")
                .font(.system(size: 56))
                .foregroundStyle(order.status.tone.color)
            Text(L10n.string("upgrade.submitted")).font(Theme.Typography.title)
            OrderProgressView(status: order.status)
            Text(L10n.string("upgrade.orderReference", order.id)).font(.footnote).foregroundStyle(.secondary)
            PrimaryButton(L10n.Common.done) { dismiss() }
        }
    }
}

/// Horizontal tracker along DRAFT → SUBMITTED → VALIDATED → PROVISIONING → ACTIVE.
struct OrderProgressView: View {
    let status: OrderStatus

    var body: some View {
        HStack(spacing: Theme.Spacing.xs) {
            ForEach(Array(OrderStatus.happyPath.dropFirst().enumerated()), id: \.offset) { _, step in
                let reached = (status.progressIndex ?? -1) >= (step.progressIndex ?? 0)
                VStack(spacing: Theme.Spacing.xs) {
                    Capsule()
                        .fill(reached ? status.tone.color : Theme.Palette.separator)
                        .frame(height: 6)
                    Text(L10n.string("order.status.\(step.rawValue.lowercased())"))
                        .font(.caption2)
                        .foregroundStyle(reached ? .primary : .secondary)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.string("order.status.\(status.rawValue.lowercased())"))
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Plan/UpgradeFlowViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Plan/UpgradeFlowViewModel.swift`.

```swift
import Foundation
import GoKineticCore
import GoKineticUI

/// Multi-step plan upgrade: choose tier → choose timing → review quote →
/// submit → track order. Modelled as an explicit state machine so illegal
/// transitions (e.g. submitting an expired quote) are impossible.
@MainActor
public final class UpgradeFlowViewModel: ObservableObject {
    public enum Step: Equatable {
        case selectPlan
        case quoting
        case review(UpgradeQuote)
        case submitting(UpgradeQuote)
        case submitted(Order)
        case failed(UserFacingError, recoverTo: RecoveryPoint)
    }

    public enum RecoveryPoint: Equatable {
        case selectPlan
        case review(UpgradeQuote)
    }

    @Published public private(set) var step: Step = .selectPlan
    @Published public var selectedPlanId: String?
    @Published public var timing: UpgradeTiming = .nextBillingCycle
    @Published public var acceptedTerms = false

    public let currentPlan: Plan
    public let options: [Plan]
    private let serviceId: String
    private let plans: PlanRepository
    private let analytics: AnalyticsTracking
    private let clock: Clock
    private let formatter: MoneyFormatter
    private let sleeper: Sleeper
    /// One key per review so a double-tap or network retry can't create two orders.
    private var submissionKey = UUID().uuidString
    private var pollTask: Task<Void, Never>?

    public init(serviceId: String, currentPlan: Plan, options: [Plan], plans: PlanRepository,
                analytics: AnalyticsTracking, clock: Clock, formatter: MoneyFormatter = MoneyFormatter(),
                sleeper: Sleeper = TaskSleeper()) {
        self.serviceId = serviceId
        self.currentPlan = currentPlan
        self.options = options
        self.plans = plans
        self.analytics = analytics
        self.clock = clock
        self.formatter = formatter
        self.sleeper = sleeper
        analytics.track(.planUpgradeStarted(fromPlanId: currentPlan.id))
    }

    deinit { pollTask?.cancel() }

    public var selectedPlan: Plan? {
        options.first { $0.id == selectedPlanId }
    }

    public var canRequestQuote: Bool {
        if case .selectPlan = step { return selectedPlan != nil }
        return false
    }

    public var canSubmit: Bool {
        guard case .review(let quote) = step else { return false }
        return acceptedTerms && !quote.isExpired(at: clock.now())
    }

    public func requestQuote() async {
        guard canRequestQuote, let plan = selectedPlan else { return }
        step = .quoting
        do {
            let quote = try await plans.quoteUpgrade(UpgradeQuoteRequest(serviceId: serviceId, targetPlanId: plan.id, timing: timing))
            guard quote.targetPlan.id == plan.id else {
                throw APIError.conflict(ProblemDetails(detail: "Quote does not match the selected plan"))
            }
            submissionKey = UUID().uuidString
            acceptedTerms = false
            step = .review(quote)
            analytics.track(.planUpgradeQuoted(targetPlanId: plan.id))
        } catch {
            step = .failed(UserFacingError(error), recoverTo: .selectPlan)
        }
    }

    public func submit() async {
        guard case .review(let quote) = step else { return }
        guard !quote.isExpired(at: clock.now()) else {
            // Re-quote rather than submitting a price the server will reject.
            step = .selectPlan
            await requestQuote()
            return
        }
        guard acceptedTerms else { return }
        step = .submitting(quote)
        do {
            let order = try await plans.submitUpgrade(quoteId: quote.quoteId, idempotencyKey: submissionKey)
            step = .submitted(order)
            analytics.track(.planUpgradeSubmitted(targetPlanId: quote.targetPlan.id, timing: timing.rawValue))
            startPolling(orderId: order.id)
        } catch APIError.conflict(let problem) where problem?.code == "quote-expired" {
            step = .selectPlan
            await requestQuote()
        } catch {
            step = .failed(UserFacingError(error), recoverTo: .review(quote))
        }
    }

    public func recover() {
        guard case .failed(_, let point) = step else { return }
        switch point {
        case .selectPlan: step = .selectPlan
        case .review(let quote): step = .review(quote)
        }
    }

    public func backToSelection() {
        switch step {
        case .review, .failed: step = .selectPlan
        default: break
        }
    }

    /// Polls the order until it reaches a terminal state, backing off from
    /// 3s to 30s. Stops when the view goes away.
    func startPolling(orderId: String, maxPolls: Int = 20) {
        pollTask?.cancel()
        let sleeper = self.sleeper
        pollTask = Task { [weak self] in
            var delay: TimeInterval = 3
            for _ in 0..<maxPolls {
                do { try await sleeper.sleep(seconds: delay) } catch { return }
                guard let self, !Task.isCancelled else { return }
                guard let order = try? await self.plans.order(id: orderId) else { continue }
                self.step = .submitted(order)
                if order.status.isTerminal { return }
                delay = min(delay * 2, 30)
            }
        }
    }

    public func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    // MARK: Presentation helpers

    public func reviewLines(for quote: UpgradeQuote) -> [(label: String, value: String)] {
        var lines: [(String, String)] = [
            (L10n.string("upgrade.newPlan"), "\(quote.targetPlan.name) · \(quote.targetPlan.speedLabel)"),
            (L10n.string("upgrade.newMonthly"), formatter.string(from: quote.newMonthlyPrice)),
            (L10n.string("upgrade.prorated"), formatter.string(from: quote.proratedCharge))
        ]
        lines += quote.oneTimeFees.map { ($0.description, formatter.string(from: $0.amount)) }
        if let due = try? quote.dueToday() {
            lines.append((L10n.string("upgrade.nextBillImpact"), formatter.string(from: due)))
        }
        return lines
    }

    public func secondsUntilQuoteExpires(_ quote: UpgradeQuote) -> Int {
        max(0, Int(quote.expiresAt.timeIntervalSince(clock.now())))
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Profile/ProfileViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Profile/ProfileViewModel.swift`.

```swift
import Foundation
import GoKineticCore
import GoKineticUI

/// Account holder details with editable contact email and phone.
@MainActor
public final class ProfileViewModel: ObservableObject {
    @Published public private(set) var state: ViewState<UserProfile> = .idle
    @Published public var email = ""
    @Published public var phone = ""
    @Published public private(set) var isSaving = false
    @Published public private(set) var fieldErrors: [String: String] = [:]
    @Published public private(set) var saveError: UserFacingError?
    @Published public private(set) var didSave = false

    private let accounts: AccountRepository

    public init(accounts: AccountRepository) {
        self.accounts = accounts
    }

    public func load(forceRefresh: Bool = false) async {
        state = state.reloading()
        do {
            let profile = try await accounts.profile(forceRefresh: forceRefresh)
            state = .loaded(profile)
            resetFields(to: profile)
        } catch {
            state = state.failing(error)
        }
    }

    private func resetFields(to profile: UserProfile) {
        email = profile.email
        phone = profile.phone ?? ""
        fieldErrors = [:]
    }

    /// Only fields that differ from the stored profile are sent.
    var changes: (email: String?, phone: String?) {
        guard let profile = state.value else { return (nil, nil) }
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPhone = phone.trimmingCharacters(in: .whitespacesAndNewlines)
        let emailChange = trimmedEmail.lowercased() == profile.email.lowercased() ? nil : trimmedEmail
        let currentPhone = profile.phone.flatMap(ContactValidator.normalizePhone) ?? profile.phone ?? ""
        let phoneChange = (ContactValidator.normalizePhone(trimmedPhone) ?? trimmedPhone) == currentPhone ? nil : trimmedPhone
        return (emailChange, phoneChange)
    }

    public var hasChanges: Bool {
        let pending = changes
        return pending.email != nil || pending.phone != nil
    }

    func validate() -> [String: String] {
        var errors: [String: String] = [:]
        let pending = changes
        if let email = pending.email, !ContactValidator.isValidEmail(email.lowercased()) {
            errors["email"] = L10n.string("profile.validation.email")
        }
        if let phone = pending.phone, ContactValidator.normalizePhone(phone) == nil {
            errors["phone"] = L10n.string("profile.validation.phone")
        }
        return errors
    }

    public func save() async {
        guard hasChanges, !isSaving else { return }
        didSave = false
        saveError = nil
        fieldErrors = validate()
        guard fieldErrors.isEmpty else { return }

        isSaving = true
        defer { isSaving = false }
        let pending = changes
        do {
            let updated = try await accounts.updateContact(email: pending.email, phone: pending.phone)
            state = .loaded(updated)
            resetFields(to: updated)
            didSave = true
        } catch APIError.validation(let problem) where problem.errors?.isEmpty == false {
            // Server-side rules (e.g. email already in use) land on the field.
            fieldErrors = ["email", "phone"].reduce(into: [:]) { result, field in
                if let message = problem.firstError(for: field) { result[field] = message }
            }
            if fieldErrors.isEmpty { saveError = UserFacingError(APIError.validation(problem)) }
        } catch {
            saveError = UserFacingError(error)
        }
    }

    public func discardChanges() {
        if let profile = state.value { resetFields(to: profile) }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Profile/ProfileViews.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Profile/ProfileViews.swift`.

```swift
import SwiftUI
import GoKineticCore
import GoKineticUI

public struct SettingsView: View {
    @StateObject private var viewModel: SettingsViewModel
    @State private var confirmingSignOut = false

    public init(viewModel: @autoclosure @escaping () -> SettingsViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        Form {
            Section {
                NavigationLink(value: AppRoute.profile) {
                    Label(L10n.string("settings.profile"), systemImage: "person.crop.circle")
                }
            }

            Section {
                AsyncContentView(state: viewModel.notifications, emptyTitle: "",
                                 retry: { Task { await viewModel.load() } }) { prefs in
                    notificationToggle("settings.notify.billing", \.billing, prefs)
                    notificationToggle("settings.notify.outages", \.outages, prefs)
                    notificationToggle("settings.notify.appointments", \.appointments, prefs)
                    notificationToggle("settings.notify.tickets", \.ticketUpdates, prefs)
                    notificationToggle("settings.notify.marketing", \.marketing, prefs)
                }
            } header: {
                Text(L10n.string("settings.notifications"))
            } footer: {
                if viewModel.isSavingNotifications { Text(L10n.string("settings.saving")) }
            }

            Section(L10n.string("settings.security")) {
                if viewModel.biometricsAvailable {
                    Toggle(L10n.string("settings.biometric.\(viewModel.biometry.rawValue)"), isOn: Binding(
                        get: { viewModel.biometricUnlockEnabled },
                        set: { enabled in Task { await viewModel.setBiometricUnlock(enabled) } }
                    ))
                } else {
                    Text(L10n.string("settings.biometricUnavailable")).foregroundStyle(.secondary)
                }
            }

            Section {
                Toggle(L10n.string("settings.analytics"), isOn: Binding(
                    get: { viewModel.analyticsEnabled },
                    set: { viewModel.setAnalyticsEnabled($0) }
                ))
            } header: {
                Text(L10n.string("settings.privacy"))
            } footer: {
                Text(L10n.string("settings.analyticsFooter"))
            }

            if let error = viewModel.error {
                Banner(title: L10n.string(error.titleKey), tone: .warning,
                       actionTitle: L10n.string("common.dismiss")) { viewModel.error = nil }
            }

            Section {
                SecondaryButton(L10n.string("settings.signOut"), role: .destructive) { confirmingSignOut = true }
                    .disabled(viewModel.isSigningOut)
            } footer: {
                Text(L10n.string("settings.version", viewModel.appVersion))
            }
        }
        .navigationTitle(L10n.string("settings.title"))
        .confirmationDialog(L10n.string("settings.signOutConfirm"), isPresented: $confirmingSignOut, titleVisibility: .visible) {
            Button(L10n.string("settings.signOut"), role: .destructive) {
                Task { await viewModel.signOut() }
            }
        }
    }

    private func notificationToggle(_ key: String, _ keyPath: WritableKeyPath<NotificationPreferences, Bool>,
                                    _ prefs: NotificationPreferences) -> some View {
        Toggle(L10n.string(key), isOn: Binding(
            get: { prefs[keyPath: keyPath] },
            set: { value in Task { await viewModel.setNotification(keyPath, to: value) } }
        ))
    }
}

public struct ProfileView: View {
    @StateObject private var viewModel: ProfileViewModel

    public init(viewModel: @autoclosure @escaping () -> ProfileViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        Form {
            AsyncContentView(state: viewModel.state, emptyTitle: L10n.string("error.notFound"),
                             retry: { Task { await viewModel.load(forceRefresh: true) } }) { profile in
                Section {
                    HStack(spacing: Theme.Spacing.m) {
                        Text(profile.initials)
                            .font(Theme.Typography.title)
                            .frame(width: 56, height: 56)
                            .background(Theme.Palette.brand.opacity(0.15), in: Circle())
                        VStack(alignment: .leading) {
                            Text(profile.displayName).font(Theme.Typography.headline)
                            Text(profile.accountId.masked).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
                Section(L10n.string("profile.contact")) {
                    ValidatedField(L10n.string("profile.email"), text: $viewModel.email,
                                   message: viewModel.fieldErrors["email"], contentType: .email)
                    ValidatedField(L10n.string("profile.phone"), text: $viewModel.phone,
                                   message: viewModel.fieldErrors["phone"])
                }
            }
            if let error = viewModel.saveError {
                Banner(title: L10n.string(error.titleKey), message: error.detail, tone: .danger)
            }
            if viewModel.didSave {
                Banner(title: L10n.string("profile.saved"), tone: .success)
            }
            if viewModel.hasChanges {
                Section {
                    PrimaryButton(L10n.Common.save, isLoading: viewModel.isSaving) {
                        Task { await viewModel.save() }
                    }
                    .listRowInsets(EdgeInsets())
                    Button(L10n.string("profile.discard"), role: .cancel) { viewModel.discardChanges() }
                }
            }
        }
        .navigationTitle(L10n.string("settings.profile"))
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Profile/SettingsViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Profile/SettingsViewModel.swift`.

```swift
import Foundation
import GoKineticCore
import GoKineticUI

/// Seam over the session's biometric-unlock flag so settings can be tested
/// without a Keychain-backed `AuthSession`.
public protocol BiometricUnlockControlling: Sendable {
    func isBiometricUnlockEnabled() async -> Bool
    func setBiometricUnlock(enabled: Bool) async throws
}

extension AuthSession: BiometricUnlockControlling {
    public func isBiometricUnlockEnabled() async -> Bool { biometricUnlockEnabled }
}

/// Notification preferences, biometric unlock, analytics consent and
/// sign-out.
@MainActor
public final class SettingsViewModel: ObservableObject {
    @Published public private(set) var notifications: ViewState<NotificationPreferences> = .idle
    @Published public private(set) var isSavingNotifications = false
    @Published public private(set) var biometricUnlockEnabled = false
    @Published public private(set) var analyticsEnabled: Bool
    @Published public private(set) var isSigningOut = false
    @Published public var error: UserFacingError?

    public let biometry: BiometryKind
    public let appVersion: String
    private let notificationRepository: NotificationRepository
    private let biometricUnlock: BiometricUnlockControlling
    private let biometrics: BiometricAuthenticating
    private let analytics: AnalyticsService
    private let preferences: PreferencesStore
    private let signOutAction: () async -> Void
    /// Last preferences the server confirmed; the rollback target.
    private var confirmed: NotificationPreferences?

    public init(notifications: NotificationRepository, biometricUnlock: BiometricUnlockControlling,
                biometrics: BiometricAuthenticating, analytics: AnalyticsService, preferences: PreferencesStore,
                appVersion: String, signOut: @escaping () async -> Void) {
        self.notificationRepository = notifications
        self.biometricUnlock = biometricUnlock
        self.biometrics = biometrics
        self.analytics = analytics
        self.preferences = preferences
        self.appVersion = appVersion
        self.signOutAction = signOut
        self.biometry = biometrics.availableBiometry()
        self.analyticsEnabled = analytics.enabled
    }

    public func load() async {
        biometricUnlockEnabled = await biometricUnlock.isBiometricUnlockEnabled()
        notifications = notifications.reloading()
        do {
            let prefs = try await notificationRepository.preferences()
            confirmed = prefs
            notifications = .loaded(prefs)
        } catch {
            notifications = notifications.failing(error)
        }
    }

    // MARK: Notifications

    /// Applies the toggle immediately, then saves. Toggles flipped while a
    /// save is in flight are coalesced into one follow-up save of the latest
    /// state; on failure the screen returns to what the server last confirmed.
    public func setNotification(_ keyPath: WritableKeyPath<NotificationPreferences, Bool>, to value: Bool) async {
        guard var desired = notifications.value, desired[keyPath: keyPath] != value else { return }
        desired[keyPath: keyPath] = value
        notifications = .loaded(desired)
        guard !isSavingNotifications else { return }

        isSavingNotifications = true
        defer { isSavingNotifications = false }
        var lastSent: NotificationPreferences?
        while let target = notifications.value, target != lastSent {
            lastSent = target
            do {
                confirmed = try await notificationRepository.updatePreferences(target)
            } catch {
                if let confirmed { notifications = .loaded(confirmed) }
                self.error = UserFacingError(error)
                return
            }
        }
        if let confirmed { notifications = .loaded(confirmed) }
    }

    // MARK: Security

    public var biometricsAvailable: Bool { biometry != .none }

    /// Enabling requires a successful biometric check first so a device
    /// whose biometrics belong to someone else can't silently opt in.
    public func setBiometricUnlock(_ enabled: Bool) async {
        guard enabled != biometricUnlockEnabled, biometricsAvailable || !enabled else { return }
        do {
            if enabled {
                let confirmedByUser = try await biometrics.authenticate(reason: L10n.string("settings.biometricReason"))
                guard confirmedByUser else { return }
            }
            try await biometricUnlock.setBiometricUnlock(enabled: enabled)
            biometricUnlockEnabled = enabled
        } catch {
            self.error = UserFacingError(kind: .unknown, titleKey: "settings.biometricFailed", isRetryable: true)
        }
    }

    // MARK: Privacy

    public func setAnalyticsEnabled(_ enabled: Bool) {
        preferences.analyticsOptIn = enabled
        analytics.setEnabled(enabled)
        analyticsEnabled = enabled
    }

    // MARK: Session

    public func signOut() async {
        guard !isSigningOut else { return }
        isSigningOut = true
        defer { isSigningOut = false }
        await signOutAction()
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Support/NewTicketViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Support/NewTicketViewModel.swift`.

```swift
import Foundation
import GoKineticCore
import GoKineticUI

/// Raise a support ticket. Priority follows the category's suggestion
/// until the customer picks one explicitly, and P1 is reserved for total
/// loss of service.
@MainActor
public final class NewTicketViewModel: ObservableObject {
    @Published public var subject: String
    @Published public var details: String
    @Published public var category: TicketCategory {
        didSet {
            if !priorityChosenByUser || !selectablePriorities.contains(priority) {
                priority = category.suggestedPriority
            }
        }
    }
    @Published public private(set) var priority: TicketPriority
    @Published public private(set) var isSubmitting = false
    @Published public private(set) var submitError: UserFacingError?
    @Published public private(set) var created: Ticket?
    @Published private var attemptedSubmit = false

    private var priorityChosenByUser = false
    /// Stable for the lifetime of the form so a retried submit after a
    /// timeout can't open two tickets.
    private let idempotencyKey: String
    private let serviceId: String?
    private let support: SupportRepository
    private let analytics: AnalyticsTracking
    private let onCreated: (Ticket) -> Void

    public init(serviceId: String?, support: SupportRepository, analytics: AnalyticsTracking,
                prefill: NewTicketRequest? = nil, idempotencyKey: String = UUID().uuidString,
                onCreated: @escaping (Ticket) -> Void = { _ in }) {
        self.serviceId = prefill?.serviceId ?? serviceId
        self.support = support
        self.analytics = analytics
        self.idempotencyKey = idempotencyKey
        self.onCreated = onCreated
        self.subject = prefill?.subject ?? ""
        self.details = prefill?.description ?? ""
        self.category = prefill?.category ?? .connectivity
        self.priority = prefill?.priority ?? (prefill?.category ?? .connectivity).suggestedPriority
        self.priorityChosenByUser = prefill != nil
    }

    /// P1 is only selectable for connectivity problems.
    public var selectablePriorities: [TicketPriority] {
        category == .connectivity ? TicketPriority.allCases : TicketPriority.allCases.filter { $0 != .p1 }
    }

    public func choosePriority(_ newValue: TicketPriority) {
        guard selectablePriorities.contains(newValue) else { return }
        priority = newValue
        priorityChosenByUser = true
    }

    public var validation: ValidationResult {
        TicketValidator.validate(subject: subject, description: details)
    }

    public func message(for field: String) -> String? {
        guard attemptedSubmit, let key = validation.message(for: field) else { return nil }
        return L10n.string(key)
    }

    public var remainingDescriptionCharacters: Int {
        TicketValidator.descriptionRange.upperBound - details.trimmingCharacters(in: .whitespacesAndNewlines).count
    }

    public func submit() async {
        attemptedSubmit = true
        guard validation.isValid, !isSubmitting, created == nil else { return }
        isSubmitting = true
        submitError = nil
        defer { isSubmitting = false }
        let request = NewTicketRequest(subject: subject, description: details, category: category,
                                       priority: priority, serviceId: serviceId)
        do {
            let ticket = try await support.createTicket(request, idempotencyKey: idempotencyKey)
            created = ticket
            analytics.track(.ticketCreated(category: category.rawValue))
            onCreated(ticket)
        } catch {
            submitError = UserFacingError(error)
        }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Support/SupportViews.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Support/SupportViews.swift`.

```swift
import SwiftUI
import GoKineticCore
import GoKineticUI

public struct TicketsView: View {
    @StateObject private var viewModel: TicketsViewModel
    @State private var showingNewTicket = false
    private let makeNewTicket: (@escaping (Ticket) -> Void) -> NewTicketViewModel
    private let dateFormatter = DisplayDateFormatter()

    public init(viewModel: @autoclosure @escaping () -> TicketsViewModel,
                makeNewTicket: @escaping (@escaping (Ticket) -> Void) -> NewTicketViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
        self.makeNewTicket = makeNewTicket
    }

    public var body: some View {
        List {
            Section {
                NavigationLink(value: AppRoute.troubleshoot) {
                    Label(L10n.string("support.troubleshoot"), systemImage: "wrench.and.screwdriver")
                }
                NavigationLink(value: DeepLink.appointments.route) {
                    Label(L10n.string("support.appointments"), systemImage: "calendar")
                }
                NavigationLink(value: DeepLink.settings.route) {
                    Label(L10n.string("support.settings"), systemImage: "gearshape")
                }
            }

            Toggle(L10n.string("tickets.includeClosed"), isOn: Binding(
                get: { viewModel.includeClosed },
                set: { include in Task { await viewModel.setIncludeClosed(include) } }
            ))

            AsyncContentView(state: viewModel.state, emptyTitle: L10n.string("tickets.empty"), emptySymbol: "bubble.left.and.bubble.right",
                             retry: { Task { await viewModel.load() } }) { _ in
                ForEach(viewModel.sections) { section in
                    Section(L10n.string(section.titleKey)) {
                        ForEach(section.tickets) { ticket in
                            NavigationLink(value: DeepLink.ticket(id: ticket.id).route) {
                                TicketRow(ticket: ticket, updatedText: dateFormatter.shortDate(ticket.updatedAt))
                            }
                            .task { await viewModel.loadMoreIfNeeded(current: ticket) }
                        }
                    }
                }
                if viewModel.isLoadingMore { ProgressView().frame(maxWidth: .infinity) }
            }
        }
        .refreshable { await viewModel.load() }
        .navigationTitle(L10n.Tabs.support)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingNewTicket = true } label: {
                    Label(L10n.string("tickets.new"), systemImage: "square.and.pencil")
                }
            }
        }
        .sheet(isPresented: $showingNewTicket) {
            NavigationStack {
                NewTicketView(viewModel: makeNewTicket { viewModel.didCreate($0) })
            }
        }
    }
}

struct TicketRow: View {
    let ticket: Ticket
    let updatedText: String

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                Text(ticket.subject).font(Theme.Typography.headline).lineLimit(1)
                Spacer()
                StatusBadge(L10n.string("ticket.status.\(ticket.status.rawValue.lowercased())"), tone: ticket.status.tone)
            }
            Text("\(ticket.reference) · \(ticket.priority.rawValue) · \(updatedText)")
                .font(.footnote).foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}

public struct TicketDetailView: View {
    @StateObject private var viewModel: TicketDetailViewModel
    private let dateFormatter = DisplayDateFormatter()

    public init(viewModel: @autoclosure @escaping () -> TicketDetailViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                AsyncContentView(state: viewModel.state, emptyTitle: L10n.string("error.notFound"),
                                 retry: { Task { await viewModel.load() } }) { ticket in
                    VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                        header(ticket)
                        ForEach(viewModel.visibleComments) { comment in
                            CommentBubble(comment: comment, timestamp: dateFormatter.relative(comment.createdAt, to: Date()),
                                          isPending: comment.id == viewModel.pendingComment?.id)
                        }
                    }
                    .padding(Theme.Spacing.l)
                }
            }
            if viewModel.state.value?.status.acceptsComments == true { composer }
        }
        .navigationTitle(viewModel.state.value?.reference ?? L10n.string("ticket.title"))
        .refreshable { await viewModel.load() }
    }

    private func header(_ ticket: Ticket) -> some View {
        Card {
            HStack {
                Text(ticket.subject).font(Theme.Typography.headline)
                Spacer()
                StatusBadge(L10n.string("ticket.status.\(ticket.status.rawValue.lowercased())"), tone: ticket.status.tone)
            }
            Text(L10n.string("ticket.category.\(ticket.category.rawValue.lowercased())")).font(.footnote).foregroundStyle(.secondary)
            if ticket.status.awaitsCustomer {
                Banner(title: L10n.string("ticket.awaitingYou"), tone: .warning)
            }
            HStack {
                chatButton
                if let type = viewModel.suggestedAppointmentType {
                    NavigationLink(value: AppRoute.bookAppointment(type: type, ticketId: ticket.id)) {
                        Label(L10n.string("ticket.bookVisit"), systemImage: "calendar.badge.plus")
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    @ViewBuilder private var chatButton: some View {
        switch viewModel.chat {
        case .idle, .failed:
            Button { Task { await viewModel.startChat() } } label: {
                Label(L10n.string("ticket.chat"), systemImage: "bubble.left.and.text.bubble.right")
            }
            .buttonStyle(.bordered)
        case .connecting:
            ProgressView()
        case .connected(let session):
            Label(session.estimatedWaitSeconds.map { L10n.string("chat.wait", max(1, $0 / 60)) } ?? L10n.string("chat.connected"),
                  systemImage: "person.wave.2")
                .font(.footnote)
        case .unavailable:
            Text(L10n.string("chat.unavailable")).font(.footnote).foregroundStyle(.secondary)
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            if let error = viewModel.replyError {
                Text(L10n.string(error.titleKey)).font(.footnote).foregroundStyle(Theme.Palette.danger)
            }
            HStack(alignment: .bottom) {
                TextField(L10n.string("ticket.replyPlaceholder"), text: $viewModel.replyText, axis: .vertical)
                    .lineLimit(1...5)
                    .textFieldStyle(.roundedBorder)
                Button { Task { await viewModel.sendReply() } } label: {
                    Image(systemName: "paperplane.fill")
                }
                .disabled(!viewModel.canReply)
                .accessibilityLabel(L10n.string("ticket.send"))
            }
        }
        .padding(Theme.Spacing.m)
        .background(.bar)
    }
}

struct CommentBubble: View {
    let comment: TicketComment
    let timestamp: String
    let isPending: Bool

    var body: some View {
        HStack {
            if comment.isFromCustomer { Spacer(minLength: Theme.Spacing.xxl) }
            VStack(alignment: comment.isFromCustomer ? .trailing : .leading, spacing: Theme.Spacing.xs) {
                Text(comment.body)
                    .padding(Theme.Spacing.m)
                    .background(comment.isFromCustomer ? Theme.Palette.brand.opacity(0.15) : Theme.Palette.surface,
                                in: RoundedRectangle(cornerRadius: Theme.Radius.card))
                Text(isPending ? L10n.string("ticket.sending") : [comment.author, timestamp].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption2).foregroundStyle(.secondary)
            }
            .opacity(isPending ? 0.6 : 1)
            if !comment.isFromCustomer { Spacer(minLength: Theme.Spacing.xxl) }
        }
    }
}

public struct NewTicketView: View {
    @StateObject private var viewModel: NewTicketViewModel
    @Environment(\.dismiss) private var dismiss

    public init(viewModel: @autoclosure @escaping () -> NewTicketViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        Group {
            if let ticket = viewModel.created {
                VStack(spacing: Theme.Spacing.l) {
                    Image(systemName: "checkmark.circle.fill").font(.system(size: 56)).foregroundStyle(Theme.Palette.success)
                    Text(L10n.string("tickets.created")).font(Theme.Typography.title)
                    Text(L10n.string("tickets.createdReference", ticket.reference)).foregroundStyle(.secondary)
                    PrimaryButton(L10n.Common.done) { dismiss() }
                }
                .padding(Theme.Spacing.xl)
            } else {
                form
            }
        }
        .navigationTitle(L10n.string("tickets.new"))
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L10n.Common.cancel) { dismiss() }
            }
        }
    }

    private var form: some View {
        Form {
            Picker(L10n.string("tickets.category"), selection: $viewModel.category) {
                ForEach(TicketCategory.allCases) { category in
                    Text(L10n.string("ticket.category.\(category.rawValue.lowercased())")).tag(category)
                }
            }
            Picker(L10n.string("tickets.priority"), selection: Binding(
                get: { viewModel.priority },
                set: { viewModel.choosePriority($0) }
            )) {
                ForEach(viewModel.selectablePriorities, id: \.self) { priority in
                    Text(L10n.string("ticket.priority.\(priority.rawValue.lowercased())")).tag(priority)
                }
            }
            ValidatedField(L10n.string("tickets.subject"), text: $viewModel.subject, message: viewModel.message(for: "subject"))
            Section {
                TextEditor(text: $viewModel.details).frame(minHeight: 140)
                if let message = viewModel.message(for: "description") {
                    Text(message).font(.footnote).foregroundStyle(Theme.Palette.danger)
                }
            } header: {
                Text(L10n.string("tickets.description"))
            } footer: {
                Text(L10n.string("tickets.charactersLeft", viewModel.remainingDescriptionCharacters))
            }
            if let error = viewModel.submitError {
                Banner(title: L10n.string(error.titleKey), message: error.detail, tone: .danger)
            }
            PrimaryButton(L10n.string("tickets.submit"), isLoading: viewModel.isSubmitting) {
                Task { await viewModel.submit() }
            }
            .listRowInsets(EdgeInsets())
        }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Support/TicketDetailViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Support/TicketDetailViewModel.swift`.

```swift
import Foundation
import GoKineticCore
import GoKineticUI

/// Ticket conversation: read the thread, reply, or escalate to live chat.
@MainActor
public final class TicketDetailViewModel: ObservableObject {
    public enum ChatState: Equatable {
        case idle
        case connecting
        case connected(ChatSession)
        case unavailable
        case failed(UserFacingError)
    }

    @Published public private(set) var state: ViewState<Ticket> = .idle
    @Published public var replyText = ""
    @Published public private(set) var isSending = false
    /// Local echo of the reply while it is being sent.
    @Published public private(set) var pendingComment: TicketComment?
    @Published public private(set) var replyError: UserFacingError?
    @Published public private(set) var chat: ChatState = .idle

    public let ticketId: String
    private let support: SupportRepository
    private let analytics: AnalyticsTracking
    private let clock: Clock
    private let onChange: (Ticket) -> Void

    public init(ticketId: String, support: SupportRepository, analytics: AnalyticsTracking, clock: Clock,
                onChange: @escaping (Ticket) -> Void = { _ in }) {
        self.ticketId = ticketId
        self.support = support
        self.analytics = analytics
        self.clock = clock
        self.onChange = onChange
    }

    public func load() async {
        state = state.reloading()
        do {
            state = .loaded(try await support.ticket(id: ticketId))
        } catch {
            state = state.failing(error)
        }
    }

    public var canReply: Bool {
        guard let ticket = state.value, ticket.status.acceptsComments, !isSending else { return false }
        return TicketValidator.validateComment(replyText).isValid
    }

    /// Replying reopens a resolved ticket and hands a pending-customer
    /// ticket back to the agent; the local copy mirrors the server rule.
    static func status(afterCustomerReplyTo status: TicketStatus) -> TicketStatus {
        switch status {
        case .pendingCustomer: return .inProgress
        case .resolved: return .open
        case .open, .inProgress, .closed: return status
        }
    }

    public func sendReply() async {
        guard canReply, let ticket = state.value else { return }
        let body = replyText.trimmingCharacters(in: .whitespacesAndNewlines)
        isSending = true
        replyError = nil
        pendingComment = TicketComment(id: "pending-\(UUID().uuidString)", author: "", isFromCustomer: true,
                                       body: body, createdAt: clock.now())
        replyText = ""
        defer {
            isSending = false
            pendingComment = nil
        }
        do {
            let saved = try await support.addComment(ticketId: ticket.id, body: body)
            let updated = ticket.appending(saved, status: Self.status(afterCustomerReplyTo: ticket.status))
            state = .loaded(updated)
            onChange(updated)
        } catch {
            // Give the text back so nothing the customer typed is lost.
            if replyText.isEmpty { replyText = body }
            replyError = UserFacingError(error)
        }
    }

    public var visibleComments: [TicketComment] {
        (state.value?.comments ?? []) + [pendingComment].compactMap { $0 }
    }

    public func startChat() async {
        guard let ticket = state.value, chat != .connecting else { return }
        chat = .connecting
        do {
            let session = try await support.startChat(topic: ticket.category, ticketId: ticket.id)
            chat = session.agentsAvailable ? .connected(session) : .unavailable
            if session.agentsAvailable { analytics.track(.chatStarted) }
        } catch {
            chat = .failed(UserFacingError(error))
        }
    }

    public func dismissChat() {
        chat = .idle
    }

    /// Visit type to offer when the ticket implies an engineer is needed.
    public var suggestedAppointmentType: AppointmentType? {
        guard let ticket = state.value, !ticket.status.isClosed else { return nil }
        return AppointmentPolicy.suggestedType(for: ticket.category)
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Support/TicketsViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Support/TicketsViewModel.swift`.

```swift
import Foundation
import GoKineticCore
import GoKineticUI

/// Support tickets list, grouped so cases waiting on the customer surface
/// first.
@MainActor
public final class TicketsViewModel: ObservableObject {
    public struct Section: Equatable, Identifiable {
        public enum Kind: String {
            case needsReply, open, closed
        }

        public let kind: Kind
        public let tickets: [Ticket]
        public var id: String { kind.rawValue }
        public var titleKey: String { "tickets.section.\(kind.rawValue)" }
    }

    @Published public private(set) var state: ViewState<[Ticket]> = .idle
    @Published public private(set) var isLoadingMore = false
    @Published public private(set) var includeClosed = false
    @Published public var inlineError: UserFacingError?

    private let support: SupportRepository
    private var loader: PagedLoader<Ticket>
    private let pageSize: Int

    public init(support: SupportRepository, pageSize: Int = 20) {
        self.support = support
        self.pageSize = pageSize
        self.loader = TicketsViewModel.makeLoader(support: support, pageSize: pageSize, includeClosed: false)
    }

    private static func makeLoader(support: SupportRepository, pageSize: Int, includeClosed: Bool) -> PagedLoader<Ticket> {
        PagedLoader(pageSize: pageSize) { page, size in
            try await support.tickets(page: page, pageSize: size, includeClosed: includeClosed)
        }
    }

    public func load() async {
        state = state.reloading()
        state = await loader.refresh(current: state)
    }

    public func setIncludeClosed(_ include: Bool) async {
        guard include != includeClosed else { return }
        includeClosed = include
        loader = TicketsViewModel.makeLoader(support: support, pageSize: pageSize, includeClosed: include)
        state = .loading(previous: nil)
        state = await loader.refresh(current: state)
    }

    public func loadMoreIfNeeded(current ticket: Ticket) async {
        guard ticket.id == loader.collection.items.last?.id, loader.collection.hasMore else { return }
        isLoadingMore = true
        inlineError = await loader.loadMore()
        isLoadingMore = false
        state = loader.state
    }

    /// Inserts a just-created ticket without refetching.
    public func didCreate(_ ticket: Ticket) {
        loader.update { $0.prepend(ticket) }
        state = loader.state
    }

    /// Reflects changes made on the detail screen (new comment, reopen).
    public func didUpdate(_ ticket: Ticket) {
        loader.update { $0.replace(ticket) }
        state = loader.state
    }

    public var sections: [Section] {
        guard let tickets = state.value else { return [] }
        let byRecency: (Ticket, Ticket) -> Bool = { $0.updatedAt > $1.updatedAt }
        let needsReply = tickets.filter { $0.status.awaitsCustomer }.sorted(by: byRecency)
        let open = tickets.filter { !$0.status.awaitsCustomer && !$0.status.isClosed }
            .sorted { ($0.priority, $1.updatedAt) < ($1.priority, $0.updatedAt) }
        let closed = tickets.filter { $0.status.isClosed }.sorted(by: byRecency)
        return [Section(kind: .needsReply, tickets: needsReply),
                Section(kind: .open, tickets: open),
                Section(kind: .closed, tickets: closed)]
            .filter { !$0.tickets.isEmpty }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Usage/UsageView.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Usage/UsageView.swift`.

```swift
import SwiftUI
import GoKineticCore
import GoKineticUI

public struct UsageView: View {
    @StateObject private var viewModel: UsageViewModel

    public init(viewModel: @autoclosure @escaping () -> UsageViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                Picker(L10n.string("usage.period"), selection: Binding(
                    get: { viewModel.period },
                    set: { period in Task { await viewModel.select(period: period) } }
                )) {
                    ForEach(UsagePeriod.allCases) { period in
                        Text(L10n.string("usage.period.\(period.rawValue.lowercased())")).tag(period)
                    }
                }
                .pickerStyle(.segmented)

                AsyncContentView(state: viewModel.state, emptyTitle: L10n.string("usage.empty"), emptySymbol: "chart.bar",
                                 retry: { Task { await viewModel.load(forceRefresh: true) } }) { content in
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        if let cap = viewModel.capSummary { capCard(cap) }
                        chartCard(content)
                        statsGrid(content)
                    }
                }
            }
            .padding(Theme.Spacing.l)
        }
        .refreshable { await viewModel.load(forceRefresh: true) }
        .navigationTitle(L10n.string("usage.title"))
    }

    private func capCard(_ cap: UsageViewModel.CapSummary) -> some View {
        Card(title: L10n.string(cap.titleKey)) {
            Meter(fraction: cap.fraction, tone: cap.tone)
            Text(cap.detail).font(.footnote).foregroundStyle(.secondary)
        }
    }

    private func chartCard(_ content: UsageViewModel.Content) -> some View {
        Card {
            if let summary = viewModel.selectionSummary {
                HStack {
                    Text(summary.title).font(Theme.Typography.headline)
                    Spacer()
                    Label(summary.download, systemImage: "arrow.down").font(.subheadline)
                    Label(summary.upload, systemImage: "arrow.up").font(.subheadline)
                }
                .monospacedDigit()
            }
            UsageChart(points: content.points, unit: content.report.period.chartUnit,
                       averageGB: content.averageGB, selectedDate: $viewModel.selectedDate)
            if viewModel.selectedDate != nil {
                Button(L10n.string("usage.clearSelection")) { viewModel.selectedDate = nil }
                    .font(.footnote)
            }
        }
    }

    private func statsGrid(_ content: UsageViewModel.Content) -> some View {
        let insights = content.insights
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Theme.Spacing.m) {
            StatTile(value: DataSizeFormatter.string(fromBytes: insights.total), caption: L10n.string("usage.total"), symbol: "sum")
            StatTile(value: DataSizeFormatter.string(fromBytes: insights.averagePerDay), caption: L10n.string("usage.dailyAverage"),
                     symbol: "calendar")
            StatTile(value: DataSizeFormatter.string(fromBytes: insights.projectedCycleTotal), caption: L10n.string("usage.projected"),
                     symbol: "chart.line.uptrend.xyaxis")
            StatTile(value: "\(Int((insights.downloadShare * 100).rounded()))%", caption: L10n.string("usage.downloadShare"),
                     symbol: "arrow.down.circle")
            if let peak = content.peakHour {
                StatTile(value: L10n.string("usage.hourLabel", peak), caption: L10n.string("usage.peakHour"), symbol: "clock")
            }
            StatTile(value: "\(insights.daysLeftInCycle)", caption: L10n.string("usage.daysLeft"), symbol: "hourglass")
        }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Usage/UsageViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/Usage/UsageViewModel.swift`.

```swift
import Foundation
import GoKineticCore
import GoKineticUI

/// Data usage for the primary service with a chart, cap tracking and a
/// remembered period choice.
@MainActor
public final class UsageViewModel: ObservableObject {
    public struct Content: Equatable {
        public let report: UsageReport
        public let insights: UsageInsights
        public let points: [UsageChartPoint]
        public let averageGB: Double?
        public let peakHour: Int?
    }

    public struct CapSummary: Equatable {
        public let fraction: Double
        public let titleKey: String
        public let detail: String
        public let tone: Tone
    }

    @Published public private(set) var state: ViewState<Content> = .idle
    @Published public private(set) var period: UsagePeriod
    @Published public var selectedDate: Date?

    public let serviceId: String
    private let usage: UsageRepository
    private let preferences: PreferencesStore
    private let clock: Clock
    private let calendar: Calendar
    private let dateFormatter: DisplayDateFormatter
    private var loadGeneration = 0

    public init(serviceId: String, usage: UsageRepository, preferences: PreferencesStore, clock: Clock,
                calendar: Calendar = .current, dateFormatter: DisplayDateFormatter = DisplayDateFormatter()) {
        self.serviceId = serviceId
        self.usage = usage
        self.preferences = preferences
        self.clock = clock
        self.calendar = calendar
        self.dateFormatter = dateFormatter
        self.period = preferences.preferredUsagePeriod
    }

    public func load(forceRefresh: Bool = false) async {
        loadGeneration += 1
        let generation = loadGeneration
        let requested = period
        state = state.reloading()
        do {
            let report = try await usage.usage(serviceId: serviceId, period: requested, forceRefresh: forceRefresh)
            // A quicker response for a newer period choice may already be on screen.
            guard generation == loadGeneration else { return }
            state = report.samples.isEmpty ? .empty : .loaded(makeContent(report))
            selectedDate = nil
        } catch {
            guard generation == loadGeneration else { return }
            state = state.failing(error)
        }
    }

    public func select(period newPeriod: UsagePeriod) async {
        guard newPeriod != period else { return }
        period = newPeriod
        preferences.preferredUsagePeriod = newPeriod
        await load()
    }

    func makeContent(_ report: UsageReport) -> Content {
        let unit = report.period.chartUnit
        let buckets = UsageInsights.rebucket(report.samples, to: unit, calendar: calendar)
        let insights = UsageInsights(report: report, now: clock.now(), calendar: calendar)
        let average = buckets.isEmpty ? nil
            : DataSizeFormatter.gigabytes(fromBytes: buckets.reduce(0) { $0 + $1.totalBytes }) / Double(buckets.count)
        return Content(report: report, insights: insights,
                       points: UsageChartPoint.points(from: buckets),
                       averageGB: buckets.count > 1 ? average : nil,
                       peakHour: report.period == .day ? nil : UsageInsights.peakHour(report.samples, calendar: calendar))
    }

    public var capSummary: CapSummary? {
        guard let content = state.value, let cap = content.report.dataCapBytes, cap > 0 else { return nil }
        let insights = content.insights
        let fraction = Double(insights.total) / Double(cap)
        let capText = DataSizeFormatter.string(fromBytes: cap)
        switch insights.capStatus {
        case .unlimited:
            return nil
        case .withinCap:
            return CapSummary(fraction: fraction, titleKey: "usage.cap.ok",
                              detail: L10n.string("usage.cap.usedOf", DataSizeFormatter.string(fromBytes: insights.total), capText),
                              tone: .info)
        case .approaching:
            return CapSummary(fraction: fraction, titleKey: "usage.cap.approaching",
                              detail: budgetText(insights) ?? capText, tone: .warning)
        case .projectedToExceed(let projected):
            return CapSummary(fraction: fraction, titleKey: "usage.cap.projected",
                              detail: L10n.string("usage.cap.projectedDetail", DataSizeFormatter.string(fromBytes: projected), capText),
                              tone: .warning)
        case .exceeded(let overage):
            return CapSummary(fraction: fraction, titleKey: "usage.cap.exceeded",
                              detail: L10n.string("usage.cap.overBy", DataSizeFormatter.string(fromBytes: overage)),
                              tone: .danger)
        }
    }

    private func budgetText(_ insights: UsageInsights) -> String? {
        guard let budget = insights.dailyBudget, insights.daysLeftInCycle > 0 else { return nil }
        return L10n.string("usage.cap.dailyBudget", DataSizeFormatter.string(fromBytes: budget), insights.daysLeftInCycle)
    }

    /// Totals for the bar under the finger, or the whole period otherwise.
    public var selectionSummary: (title: String, download: String, upload: String)? {
        guard let content = state.value else { return nil }
        let unit = content.report.period.chartUnit
        let matching = content.points.filter { point in
            selectedDate.map { calendar.isDate(point.date, equalTo: $0, toGranularity: unit) } ?? true
        }
        guard !matching.isEmpty else { return nil }
        func total(_ series: UsageChartPoint.Series) -> String {
            let gb = matching.filter { $0.series == series }.reduce(0) { $0 + $1.gigabytes }
            return DataSizeFormatter.string(fromBytes: Int64((gb * 1_000_000_000).rounded()))
        }
        let title: String
        if let date = selectedDate {
            title = unit == .hour ? dateFormatter.time(date) : dateFormatter.shortDate(date)
        } else {
            title = dateFormatter.period(from: content.report.cycleStart, to: content.report.cycleEnd)
        }
        return (title, total(.download), total(.upload))
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/WiFi/SpeedTestViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/WiFi/SpeedTestViewModel.swift`.

```swift
import Foundation
import GoKineticCore
import GoKineticUI

/// Runs a speed test, shows live progress, and judges the result against
/// the customer's plan.
@MainActor
public final class SpeedTestViewModel: ObservableObject {
    public enum Phase: Equatable {
        case ready
        case running(SpeedTestPhase)
        case finished(SpeedTestResult, SpeedTestResult.Verdict?)
        case failed(UserFacingError)
    }

    @Published public private(set) var phase: Phase = .ready
    @Published public private(set) var history: [SpeedTestResult] = []

    private let speedTest: SpeedTestRunning
    private let plan: Plan?
    private let analytics: AnalyticsTracking
    private let onResult: (SpeedTestResult) -> Void
    private var runTask: Task<Void, Never>?

    public init(speedTest: SpeedTestRunning, plan: Plan?, analytics: AnalyticsTracking,
                onResult: @escaping (SpeedTestResult) -> Void = { _ in }) {
        self.speedTest = speedTest
        self.plan = plan
        self.analytics = analytics
        self.onResult = onResult
    }

    deinit { runTask?.cancel() }

    public var isRunning: Bool {
        if case .running = phase { return true }
        return false
    }

    /// Gauge ceiling: the plan's tier, so a full dial means "as sold".
    public var gaugeMaxMbps: Double { Double(plan?.downloadMbps ?? 1000) }

    public func loadHistory() async {
        history = (try? await speedTest.history()) ?? []
    }

    public func start() {
        guard !isRunning else { return }
        phase = .running(.selectingServer)
        runTask = Task { [weak self] in await self?.consume() }
    }

    public func cancel() {
        runTask?.cancel()
        runTask = nil
        if isRunning { phase = .ready }
    }

    private func consume() async {
        do {
            for try await update in speedTest.run() {
                if case .finished(let result) = update {
                    complete(with: result)
                } else {
                    phase = .running(update)
                }
            }
        } catch is CancellationError {
            phase = .ready
        } catch {
            phase = .failed(UserFacingError(error))
        }
    }

    func complete(with result: SpeedTestResult) {
        let verdict = plan.map { result.verdict(against: $0) }
        phase = .finished(result, verdict)
        history = [result] + history.filter { $0.id != result.id }
        analytics.track(.speedTestCompleted(downloadMbps: Int(result.downloadMbps.rounded()), verdict: verdict?.rawValue ?? "unknown"))
        onResult(result)
    }

    /// Live reading for the gauge while running.
    public var currentMbps: Double {
        switch phase {
        case .running(.download(let mbps, _)), .running(.upload(let mbps, _)): return mbps
        case .finished(let result, _): return result.downloadMbps
        default: return 0
        }
    }

    public var phaseLabelKey: String {
        switch phase {
        case .ready: return "speedtest.ready"
        case .running(.selectingServer): return "speedtest.server"
        case .running(.latency): return "speedtest.latency"
        case .running(.download): return "speedtest.download"
        case .running(.upload): return "speedtest.upload"
        case .running(.finished), .finished: return "speedtest.done"
        case .failed: return "speedtest.failed"
        }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/WiFi/TroubleshootViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/WiFi/TroubleshootViewModel.swift`.

```swift
import Foundation
import GoKineticCore
import GoKineticUI

/// Guided "my internet isn't working" flow: rule out a known outage, check
/// and optionally restart the router, inspect devices, then either advise
/// or escalate with a pre-filled ticket carrying everything learned.
@MainActor
public final class TroubleshootViewModel: ObservableObject {
    public enum Step: Equatable {
        case start
        case checking
        case knownOutage(Outage)
        case offerReboot(RouterStatus)
        case rebooting(RouterState)
        case advice([Recommendation])
        case resolved
        case failed(UserFacingError)
    }

    @Published public private(set) var step: Step = .start
    @Published public private(set) var report: DiagnosticReport

    public let serviceId: String
    private let outages: OutageRepository
    private let router: RouterRepository
    private let monitor: RouterRecoveryMonitor
    private let clock: Clock

    public init(serviceId: String, outages: OutageRepository, router: RouterRepository, clock: Clock,
                sleeper: Sleeper = TaskSleeper()) {
        self.serviceId = serviceId
        self.outages = outages
        self.router = router
        self.monitor = RouterRecoveryMonitor(router: router, sleeper: sleeper)
        self.clock = clock
        self.report = DiagnosticReport(startedAt: clock.now())
    }

    public func begin() async {
        guard step == .start || isFailed else { return }
        report = DiagnosticReport(startedAt: clock.now())
        step = .checking

        async let outageList = Result.capturing { try await outages.outages(serviceId: serviceId) }
        async let routerStatus = Result.capturing { try await router.status(serviceId: serviceId) }
        let (outageResult, routerResult) = await (outageList, routerStatus)

        report.outage = (try? outageResult.get())?.first { $0.isActive && $0.affectsMyService }
        if let outage = report.outage {
            step = .knownOutage(outage)
            return
        }
        switch routerResult {
        case .success(let status):
            report.routerBefore = status
            // An offline router can't be restarted remotely; the advice step
            // tells the customer to check power and cables instead.
            if status.state == .degraded {
                step = .offerReboot(status)
            } else {
                await collectDevicesAndAdvise(routerId: status.routerId)
            }
        case .failure(let error):
            step = .failed(UserFacingError(error))
        }
    }

    private var isFailed: Bool {
        if case .failed = step { return true }
        return false
    }

    /// Restarting is also offered for a healthy-looking router: it is the
    /// single most effective fix, but the customer decides.
    public func offerRebootAnyway() {
        guard case .advice = step, let status = report.currentRouter, status.canReboot, !report.rebootAttempted else { return }
        step = .offerReboot(status)
    }

    public func reboot() async {
        guard case .offerReboot(let status) = step else { return }
        step = .rebooting(.rebooting)
        report.rebootAttempted = true
        do {
            let recovered = try await monitor.rebootAndWait(routerId: status.routerId, serviceId: serviceId) { [weak self] state in
                await self?.showRebootProgress(state)
            }
            report.routerAfter = recovered
            await collectDevicesAndAdvise(routerId: recovered.routerId)
        } catch RouterRecoveryMonitor.RecoveryError.didNotRecover(let lastKnown) {
            report.routerAfter = report.routerBefore.map {
                RouterStatus(routerId: $0.routerId, model: $0.model, firmwareVersion: $0.firmwareVersion,
                             state: lastKnown ?? .offline, uptimeSeconds: 0, lastSeen: $0.lastSeen, networks: $0.networks)
            }
            step = .advice(report.recommendations(at: clock.now()))
        } catch {
            step = .failed(UserFacingError(error))
        }
    }

    private func showRebootProgress(_ state: RouterState) {
        if case .rebooting = step { step = .rebooting(state) }
    }

    public func skipReboot() async {
        guard case .offerReboot(let status) = step else { return }
        await collectDevicesAndAdvise(routerId: status.routerId)
    }

    private func collectDevicesAndAdvise(routerId: String) async {
        step = .checking
        report.devices = (try? await router.connectedDevices(routerId: routerId)) ?? []
        step = .advice(report.recommendations(at: clock.now()))
    }

    /// Attaches a speed test run elsewhere so advice can account for it.
    public func attach(speedTest: SpeedTestResult, plan: Plan?) {
        report.speedTest = speedTest
        report.plan = plan
        if case .advice = step { step = .advice(report.recommendations(at: clock.now())) }
    }

    public func markResolved() {
        step = .resolved
    }

    public func ticketDraft(customerNotes: String = "") -> NewTicketRequest {
        report.ticketRequest(serviceId: serviceId, customerNotes: customerNotes)
    }

    public func restart() {
        step = .start
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/WiFi/WiFiSettingsViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/WiFi/WiFiSettingsViewModel.swift`.

```swift
import Foundation
import GoKineticCore
import GoKineticUI

/// Edit a Wi-Fi network's name, security mode and (optionally) passphrase.
@MainActor
public final class WiFiSettingsViewModel: ObservableObject {
    @Published public var ssid: String
    @Published public var security: WiFiSecurity
    @Published public var changePassphrase = false
    @Published public var passphrase = ""
    @Published public var confirmation = ""
    @Published public private(set) var isSaving = false
    @Published public private(set) var saved: WiFiNetwork?
    @Published public private(set) var saveError: UserFacingError?
    @Published private var attemptedSave = false

    public let network: WiFiNetwork
    private let routerId: String
    private let router: RouterRepository
    private let analytics: AnalyticsTracking

    public init(routerId: String, network: WiFiNetwork, router: RouterRepository, analytics: AnalyticsTracking) {
        self.routerId = routerId
        self.network = network
        self.router = router
        self.analytics = analytics
        self.ssid = network.ssid
        self.security = network.security
    }

    public var validation: ValidationResult {
        WiFiCredentialsValidator.validate(ssid: ssid, passphrase: changePassphrase ? passphrase : nil,
                                          confirmation: changePassphrase ? confirmation : nil)
    }

    public func message(for field: String) -> String? {
        guard attemptedSave || field == "passphrase" && !passphrase.isEmpty,
              let key = validation.message(for: field) else { return nil }
        return L10n.string(key)
    }

    public var strength: WiFiCredentialsValidator.Strength? {
        guard changePassphrase, !passphrase.isEmpty else { return nil }
        return WiFiCredentialsValidator.passphraseStrength(passphrase)
    }

    public var hasChanges: Bool {
        ssid != network.ssid || security != network.security || changePassphrase
    }

    /// Changing the name or passphrase disconnects every device, including
    /// possibly this phone; the view warns before saving.
    public var disconnectsDevices: Bool {
        ssid != network.ssid || changePassphrase
    }

    public func save() async {
        attemptedSave = true
        guard hasChanges, validation.isValid, !isSaving else { return }
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        let request = WiFiUpdateRequest(networkId: network.id, ssid: ssid,
                                        passphrase: changePassphrase ? passphrase : nil, security: security)
        do {
            saved = try await router.updateWiFi(routerId: routerId, request)
            analytics.track(.wifiUpdated(changedPassphrase: changePassphrase))
            passphrase = ""
            confirmation = ""
        } catch {
            saveError = UserFacingError(error)
        }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/WiFi/WiFiViewModel.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticFeatures/WiFi/WiFiViewModel.swift`.

```swift
import Foundation
import GoKineticCore
import GoKineticUI

/// Home Wi-Fi: router health, reboot with recovery tracking, and the
/// connected-device list with block / rename.
@MainActor
public final class WiFiViewModel: ObservableObject {
    public enum RebootState: Equatable {
        case idle
        case inProgress(RouterState)
        case completed
        case failed(UserFacingError)
    }

    public struct DeviceSummary: Equatable {
        public let online: Int
        public let offline: Int
        public let blocked: Int
        public let weakSignal: Int
    }

    @Published public private(set) var router: ViewState<RouterStatus> = .idle
    @Published public private(set) var devices: ViewState<[ConnectedDevice]> = .idle
    @Published public private(set) var rebootState: RebootState = .idle
    @Published public private(set) var busyDeviceIds: Set<String> = []
    @Published public var actionError: UserFacingError?

    public let serviceId: String
    private let routerRepository: RouterRepository
    private let monitor: RouterRecoveryMonitor
    private let analytics: AnalyticsTracking
    private let clock: Clock

    public init(serviceId: String, router: RouterRepository, analytics: AnalyticsTracking, clock: Clock,
                sleeper: Sleeper = TaskSleeper()) {
        self.serviceId = serviceId
        self.routerRepository = router
        self.monitor = RouterRecoveryMonitor(router: router, sleeper: sleeper)
        self.analytics = analytics
        self.clock = clock
    }

    public func load() async {
        router = router.reloading()
        do {
            let status = try await routerRepository.status(serviceId: serviceId)
            router = .loaded(status)
            await loadDevices(routerId: status.routerId)
        } catch {
            router = router.failing(error)
        }
    }

    private func loadDevices(routerId: String) async {
        devices = devices.reloading()
        do {
            devices = .from(try await routerRepository.connectedDevices(routerId: routerId))
        } catch {
            devices = devices.failing(error)
        }
    }

    public var deviceSummary: DeviceSummary? {
        guard let list = devices.value else { return nil }
        let now = clock.now()
        return DeviceSummary(
            online: list.filter { $0.isOnline(at: now) }.count,
            offline: list.filter { !$0.isBlocked && !$0.isOnline(at: now) }.count,
            blocked: list.filter(\.isBlocked).count,
            weakSignal: list.filter { $0.isOnline(at: now) && $0.signalQuality == .poor }.count
        )
    }

    public func isOnline(_ device: ConnectedDevice) -> Bool {
        device.isOnline(at: clock.now())
    }

    // MARK: Reboot

    public var canReboot: Bool {
        guard let status = router.value, status.canReboot else { return false }
        if case .inProgress = rebootState { return false }
        return true
    }

    public func reboot() async {
        guard canReboot, let status = router.value else { return }
        rebootState = .inProgress(.rebooting)
        analytics.track(.routerRebooted)
        do {
            let recovered = try await monitor.rebootAndWait(routerId: status.routerId, serviceId: serviceId) { [weak self] state in
                await self?.observeRebootProgress(state)
            }
            router = .loaded(recovered)
            rebootState = .completed
            await loadDevices(routerId: recovered.routerId)
        } catch RouterRecoveryMonitor.RecoveryError.didNotRecover {
            rebootState = .failed(UserFacingError(kind: .server, titleKey: "wifi.reboot.notRecovered", isRetryable: true))
        } catch {
            rebootState = .failed(UserFacingError(error))
        }
    }

    private func observeRebootProgress(_ state: RouterState) {
        if case .inProgress = rebootState { rebootState = .inProgress(state) }
    }

    public func acknowledgeReboot() {
        rebootState = .idle
    }

    // MARK: Devices

    /// Optimistic: the row flips immediately and reverts on failure.
    public func setBlocked(_ device: ConnectedDevice, blocked: Bool) async {
        guard let routerId = router.value?.routerId, device.isBlocked != blocked else { return }
        await mutate(device, optimistic: device.with(blocked: blocked)) {
            let updated = try await self.routerRepository.setDeviceBlocked(routerId: routerId, deviceId: device.id, blocked: blocked)
            self.analytics.track(.deviceBlocked(blocked: blocked))
            return updated
        }
    }

    public func rename(_ device: ConnectedDevice, to name: String) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let routerId = router.value?.routerId, trimmed != device.name, !trimmed.isEmpty else { return }
        await mutate(device, optimistic: device.with(name: trimmed)) {
            try await self.routerRepository.renameDevice(routerId: routerId, deviceId: device.id, name: trimmed)
        }
    }

    private func mutate(_ device: ConnectedDevice, optimistic: ConnectedDevice,
                        operation: () async throws -> ConnectedDevice) async {
        guard !busyDeviceIds.contains(device.id) else { return }
        busyDeviceIds.insert(device.id)
        defer { busyDeviceIds.remove(device.id) }
        replace(optimistic)
        do {
            replace(try await operation())
        } catch {
            replace(device)
            actionError = UserFacingError(error)
        }
    }

    private func replace(_ device: ConnectedDevice) {
        guard var list = devices.value, let index = list.firstIndex(where: { $0.id == device.id }) else { return }
        list[index] = device
        devices = .loaded(list)
    }
}

extension ConnectedDevice {
    func with(blocked: Bool? = nil, name: String? = nil) -> ConnectedDevice {
        ConnectedDevice(id: id, name: name ?? self.name, macAddress: macAddress, ipAddress: ipAddress, band: band,
                        isWired: isWired, signalDBm: signalDBm, isBlocked: blocked ?? isBlocked, lastActive: lastActive)
    }
}
```
