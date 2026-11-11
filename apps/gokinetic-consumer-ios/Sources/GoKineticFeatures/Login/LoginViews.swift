import SwiftUI
import GoKineticCore
import GoKineticUI

public struct LoginView: View {
    @StateObject private var viewModel: LoginViewModel

    public init(viewModel: @autoclosure @escaping () -> LoginViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        VStack(spacing: Theme.Spacing.xl) {
            Spacer()
            Image(systemName: "bolt.horizontal.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(Theme.Palette.brand)
                .accessibilityHidden(true)
            VStack(spacing: Theme.Spacing.s) {
                Text(L10n.Login.title).font(Theme.Typography.display)
                Text(L10n.Login.subtitle)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            ValidatedField(L10n.string("login.emailOptional"), text: $viewModel.loginHint, contentType: .email)
            if let key = viewModel.errorMessageKey {
                Banner(title: L10n.string(key), tone: .danger)
            }
            Spacer()
            PrimaryButton(L10n.Login.signIn, isLoading: viewModel.isSigningIn) {
                Task { await viewModel.signIn() }
            }
            Text(L10n.string("login.footer"))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(Theme.Spacing.xl)
    }
}

public struct BiometricLockView: View {
    @StateObject private var viewModel: BiometricLockViewModel

    public init(viewModel: @autoclosure @escaping () -> BiometricLockViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        VStack(spacing: Theme.Spacing.xl) {
            Spacer()
            Image(systemName: viewModel.symbolName)
                .font(.system(size: 64))
                .foregroundStyle(Theme.Palette.brand)
                .accessibilityHidden(true)
            Text(L10n.string("lock.title")).font(Theme.Typography.title)
            if viewModel.failed {
                Banner(title: L10n.string("lock.failed"), tone: .warning)
            }
            Spacer()
            PrimaryButton(L10n.Login.unlock, isLoading: viewModel.isAuthenticating) {
                Task { await viewModel.unlock() }
            }
            Button(L10n.Login.usePassword) {
                Task { await viewModel.usePasswordInstead() }
            }
            .font(.subheadline)
        }
        .padding(Theme.Spacing.xl)
        .task { await viewModel.onAppear() }
    }
}
