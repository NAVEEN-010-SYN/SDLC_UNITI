import Foundation

/// Who is signed in, derived from ID-token claims.
public struct SessionUser: Equatable, Sendable {
    public let subject: String
    public let name: String?
    public let email: String?
    public let accountId: String?
    public let roles: [String]

    public init(subject: String, name: String?, email: String?, accountId: String?, roles: [String]) {
        self.subject = subject
        self.name = name
        self.email = email
        self.accountId = accountId
        self.roles = roles
    }

    init(claims: IDTokenClaims) {
        self.init(subject: claims.subject, name: claims.name, email: claims.email, accountId: claims.accountId, roles: claims.roles)
    }
}

public enum AuthState: Equatable, Sendable {
    case unknown
    case signedOut
    /// Tokens exist but the app requires a biometric unlock first.
    case locked(SessionUser?)
    case signedIn(SessionUser)

    public var isSignedIn: Bool {
        if case .signedIn = self { return true }
        return false
    }
}

/// Owns the OIDC session: login with PKCE, Keychain persistence, biometric
/// lock, and single-flight token refresh. Acts as the API client's
/// `AccessTokenProviding`.
public actor AuthSession: AccessTokenProviding {
    private let config: OIDCConfiguration
    private let tokenClient: OIDCTokenClient
    private let webAuthenticator: WebAuthenticating
    private let tokenStore: TokenStore
    private let biometrics: BiometricAuthenticating
    private let clock: Clock
    private let logger: AppLogger
    private let allowedRoles: Set<String>

    private var tokens: TokenSet?
    private var refreshTask: Task<TokenSet, Error>?
    private var observers: [UUID: AsyncStream<AuthState>.Continuation] = [:]
    private var backgroundedAt: Date?

    /// How long the app may sit in the background before biometric relock.
    public let relockInterval: TimeInterval

    public private(set) var state: AuthState = .unknown {
        didSet {
            guard state != oldValue else { return }
            observers.values.forEach { $0.yield(state) }
        }
    }

    public init(
        config: OIDCConfiguration,
        tokenClient: OIDCTokenClient,
        webAuthenticator: WebAuthenticating,
        tokenStore: TokenStore,
        biometrics: BiometricAuthenticating,
        clock: Clock = SystemClock(),
        logger: AppLogger = .shared,
        allowedRoles: Set<String> = [UserRole.consumer.rawValue],
        relockInterval: TimeInterval = 300
    ) {
        self.config = config
        self.tokenClient = tokenClient
        self.webAuthenticator = webAuthenticator
        self.tokenStore = tokenStore
        self.biometrics = biometrics
        self.clock = clock
        self.logger = logger
        self.allowedRoles = allowedRoles
        self.relockInterval = relockInterval
    }

    // MARK: Observation

    /// Stream of state changes, starting with the current state.
    public func stateUpdates() -> AsyncStream<AuthState> {
        let id = UUID()
        return AsyncStream { continuation in
            continuation.yield(state)
            observers[id] = continuation
            continuation.onTermination = { [weak self] _ in
                Task { await self?.removeObserver(id) }
            }
        }
    }

    private func removeObserver(_ id: UUID) {
        observers[id] = nil
    }

    // MARK: Lifecycle

    /// Restores a persisted session at launch.
    public func restore() {
        do {
            guard let stored = try tokenStore.load() else {
                state = .signedOut
                return
            }
            tokens = stored
            let user = stored.idToken.flatMap { try? IDTokenClaims.decode($0) }.map(SessionUser.init)
            if tokenStore.isBiometricUnlockEnabled && biometrics.availableBiometry() != .none {
                state = .locked(user)
            } else if let user {
                state = .signedIn(user)
            } else {
                state = .signedOut
            }
        } catch {
            logger.error("auth.restore_failed", ["error": String(describing: error)])
            state = .signedOut
        }
    }

    public func signIn(loginHint: String? = nil) async throws {
        let pkce = try PKCE.generate()
        let request = try AuthorizationRequest.make(config: config, pkce: pkce,
                                                    state: try PKCE.randomToken(),
                                                    nonce: try PKCE.randomToken(),
                                                    loginHint: loginHint)
        guard let scheme = config.redirectURI.scheme else { throw AuthError.configuration }
        let callback = try await webAuthenticator.authenticate(url: request.url, callbackScheme: scheme)
        let code = try request.authorizationCode(from: callback, redirectURI: config.redirectURI)
        let issued = try await tokenClient.exchange(code: code, verifier: pkce.verifier)

        guard let idToken = issued.idToken else { throw AuthError.invalidTokenResponse }
        let claims = try IDTokenClaims.decode(idToken)
        try claims.validate(issuer: config.issuer, clientId: config.clientId, nonce: request.nonce, now: clock.now())
        guard !allowedRoles.isDisjoint(with: claims.roles) else {
            if let refresh = issued.refreshToken { await tokenClient.revoke(refreshToken: refresh) }
            throw AuthError.roleNotPermitted
        }

        try tokenStore.save(issued)
        tokens = issued
        state = .signedIn(SessionUser(claims: claims))
        logger.info("auth.signed_in", ["sub": claims.subject])
    }

    public func unlockWithBiometrics(reason: String) async throws -> Bool {
        guard case .locked(let user) = state else { return state.isSignedIn }
        let success = try await biometrics.authenticate(reason: reason)
        guard success else { return false }
        if let user {
            state = .signedIn(user)
        } else {
            // No cached claims: prove the session is still valid by refreshing.
            _ = try await refreshTokens()
            let claims = tokens?.idToken.flatMap { try? IDTokenClaims.decode($0) }
            state = claims.map { .signedIn(SessionUser(claims: $0)) } ?? .signedOut
        }
        return state.isSignedIn
    }

    public func setBiometricUnlock(enabled: Bool) throws {
        try tokenStore.setBiometricUnlockEnabled(enabled)
    }

    public var biometricUnlockEnabled: Bool { tokenStore.isBiometricUnlockEnabled }

    public func appDidEnterBackground() {
        backgroundedAt = clock.now()
    }

    /// Relocks if biometric unlock is enabled and the app was away too long.
    public func appWillEnterForeground() {
        defer { backgroundedAt = nil }
        guard let since = backgroundedAt, case .signedIn(let user) = state else { return }
        if tokenStore.isBiometricUnlockEnabled, clock.now().timeIntervalSince(since) >= relockInterval {
            state = .locked(user)
        }
    }

    public func signOut() async {
        refreshTask?.cancel()
        refreshTask = nil
        if let refresh = tokens?.refreshToken {
            await tokenClient.revoke(refreshToken: refresh)
        }
        tokens = nil
        do {
            try tokenStore.clear()
            try tokenStore.setBiometricUnlockEnabled(false)
        } catch {
            logger.error("auth.clear_failed", ["error": String(describing: error)])
        }
        state = .signedOut
    }

    // MARK: AccessTokenProviding

    public func validAccessToken() async throws -> String {
        if case .locked = state { throw AuthError.notSignedIn }
        guard let current = tokens else { throw AuthError.notSignedIn }
        if !current.isExpired(at: clock.now()) { return current.accessToken }
        return try await refreshTokens().accessToken
    }

    public func refreshAfterRejection(of rejectedToken: String) async throws -> String {
        // Another request may already have refreshed while this one was in flight.
        if let current = tokens, current.accessToken != rejectedToken, !current.isExpired(at: clock.now()) {
            return current.accessToken
        }
        return try await refreshTokens().accessToken
    }

    /// Single-flight refresh: concurrent callers await the same task.
    private func refreshTokens() async throws -> TokenSet {
        if let existing = refreshTask {
            return try await existing.value
        }
        guard let refreshToken = tokens?.refreshToken else {
            await expireSession()
            throw AuthError.notSignedIn
        }
        let client = tokenClient
        let task = Task { try await client.refresh(refreshToken: refreshToken) }
        refreshTask = task
        defer { refreshTask = nil }

        do {
            let refreshed = try await task.value
            let merged = tokens.map { $0.merging(refreshed) } ?? refreshed
            tokens = merged
            try? tokenStore.save(merged)
            return merged
        } catch TokenRefreshError.invalidGrant {
            await expireSession()
            throw AuthError.refreshFailed
        }
    }

    private func expireSession() async {
        tokens = nil
        try? tokenStore.clear()
        state = .signedOut
        logger.warning("auth.session_expired")
    }
}
