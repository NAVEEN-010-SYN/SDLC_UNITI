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
