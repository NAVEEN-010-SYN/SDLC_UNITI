import Foundation
import GoKineticCore

/// Root coordinator: mirrors the auth state, owns tab selection and
/// routes deep links / push notifications once the user is signed in.
@MainActor
public final class AppViewModel: ObservableObject {
    public enum Phase: Equatable {
        case launching
        case signedOut
        case locked
        case signedIn(SessionUser)
    }

    @Published public private(set) var phase: Phase = .launching
    @Published public var selectedTab: AppTab = .home
    /// Destination the active tab should push once it appears.
    @Published public var activeLink: DeepLink?

    private let container: DependencyContainer
    /// Link received while signed out/locked, replayed after unlock.
    private(set) var pendingLink: DeepLink?
    private var observeTask: Task<Void, Never>?

    public init(container: DependencyContainer) {
        self.container = container
    }

    deinit {
        observeTask?.cancel()
    }

    public var dependencies: DependencyContainer { container }

    public func start() {
        guard observeTask == nil else { return }
        let session = container.authSession
        observeTask = Task { [weak self] in
            await session.restore()
            for await state in await session.stateUpdates() {
                await self?.apply(state)
            }
        }
    }

    func apply(_ state: AuthState) async {
        let previous = phase
        switch state {
        case .unknown:
            phase = .launching
        case .signedOut:
            phase = .signedOut
            selectedTab = .home
            activeLink = nil
            if case .signedIn = previous {
                await container.resetForSignOut()
            }
        case .locked:
            phase = .locked
        case .signedIn(let user):
            phase = .signedIn(user)
            container.analytics.identify(userId: user.subject)
            if let link = pendingLink {
                pendingLink = nil
                route(to: link)
            }
        }
    }

    // MARK: Deep links

    public func handle(url: URL) {
        guard let link = DeepLink(url: url) else {
            container.logger.warning("deeplink.unrecognised", ["scheme": url.scheme ?? ""])
            return
        }
        open(link)
    }

    public func open(_ link: DeepLink) {
        guard case .signedIn = phase else {
            pendingLink = link
            return
        }
        route(to: link)
    }

    private func route(to link: DeepLink) {
        selectedTab = link.tab
        activeLink = link == .dashboard ? nil : link
    }

    /// Called by the tab once it has pushed the destination.
    public func consumeActiveLink() {
        activeLink = nil
    }

    // MARK: Push notifications

    public func handleNotificationResponse(userInfo: [AnyHashable: Any]) {
        guard let push = PushNotification(userInfo: userInfo) else { return }
        container.analytics.track(.pushOpened(category: push.category.rawValue))
        open(push.link)
    }

    public func registerPushToken(_ deviceToken: Data, appVersion: String) async {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        guard case .signedIn = phase, container.preferences.lastPushToken != token else { return }
        do {
            try await container.notifications.register(
                DeviceRegistration(token: token, appVersion: appVersion, locale: Locale.current.identifier)
            )
            container.preferences.lastPushToken = token
        } catch {
            container.logger.warning("push.register_failed", ["error": String(describing: error)])
        }
    }

    // MARK: Lifecycle

    public func sceneDidEnterBackground() {
        Task { await container.authSession.appDidEnterBackground() }
    }

    public func sceneWillEnterForeground() {
        Task { await container.authSession.appWillEnterForeground() }
    }

    public func signOut() async {
        if let token = container.preferences.lastPushToken {
            try? await container.notifications.unregister(token: token)
            container.preferences.lastPushToken = nil
        }
        container.analytics.track(.logout)
        await container.authSession.signOut()
    }
}
