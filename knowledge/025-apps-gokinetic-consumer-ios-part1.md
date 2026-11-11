# Go Kinetic Consumer mobile app (B2C): apps/gokinetic-consumer-ios (part 1 of 7)

- **Application:** Go Kinetic Consumer mobile app (B2C)
- **Tech stack:** Swift / SwiftUI
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 14

## Files

- `apps/gokinetic-consumer-ios/Package.swift` (61 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/AuthSession.swift` (254 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/BiometricAuthenticator.swift` (60 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/OIDCClient.swift` (119 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/OIDCConfiguration.swift` (118 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/PKCE.swift` (83 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/SecureStore.swift` (116 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/TokenSet.swift` (102 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/DI/AppEnvironment.swift` (56 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/DI/DependencyContainer.swift` (173 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/AccountModels.swift` (176 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/BillingModels.swift` (193 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/Money.swift` (139 lines)
- `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/NetworkModels.swift` (268 lines)

## apps/gokinetic-consumer-ios/Package.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Package.swift`.

```swift
// swift-tools-version:5.9
//
// Go Kinetic Consumer iOS app — Swift package layout.
//
// The Xcode app target (see `App/`) is a thin shell that depends on these
// library products. Splitting the code into packages keeps the business
// logic (networking, auth, repositories) testable on any Apple platform and
// keeps the SwiftUI feature layer free of I/O concerns.

import PackageDescription

let package = Package(
    name: "GoKineticConsumer",
    defaultLocalization: "en",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(name: "GoKineticCore", targets: ["GoKineticCore"]),
        .library(name: "GoKineticUI", targets: ["GoKineticUI"]),
        .library(name: "GoKineticFeatures", targets: ["GoKineticFeatures"])
    ],
    targets: [
        // Models, networking, auth, repositories, caching, analytics, DI.
        .target(
            name: "GoKineticCore",
            path: "Sources/GoKineticCore"
        ),
        // Theme + reusable SwiftUI components + localized strings.
        .target(
            name: "GoKineticUI",
            dependencies: ["GoKineticCore"],
            path: "Sources/GoKineticUI",
            resources: [.process("Resources")]
        ),
        // Feature folders: view models (MVVM) and screens.
        .target(
            name: "GoKineticFeatures",
            dependencies: ["GoKineticCore", "GoKineticUI"],
            path: "Sources/GoKineticFeatures"
        ),
        // Test doubles shared by the test targets.
        .target(
            name: "GoKineticTestSupport",
            dependencies: ["GoKineticCore"],
            path: "Tests/GoKineticTestSupport"
        ),
        .testTarget(
            name: "GoKineticCoreTests",
            dependencies: ["GoKineticCore", "GoKineticTestSupport"],
            path: "Tests/GoKineticCoreTests"
        ),
        .testTarget(
            name: "GoKineticFeaturesTests",
            dependencies: ["GoKineticFeatures", "GoKineticCore", "GoKineticTestSupport"],
            path: "Tests/GoKineticFeaturesTests"
        )
    ]
)
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/AuthSession.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/AuthSession.swift`.

```swift
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
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/BiometricAuthenticator.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/BiometricAuthenticator.swift`.

```swift
import Foundation
#if canImport(LocalAuthentication)
import LocalAuthentication
#endif

public enum BiometryKind: String, Sendable {
    case none
    case touchID
    case faceID
    case opticID
}

/// Biometric unlock abstraction so view models never touch
/// `LocalAuthentication` directly and tests can script outcomes.
public protocol BiometricAuthenticating: Sendable {
    func availableBiometry() -> BiometryKind
    /// Returns true on success, false if the user cancelled or fell back.
    func authenticate(reason: String) async throws -> Bool
}

#if canImport(LocalAuthentication)
public struct LocalBiometricAuthenticator: BiometricAuthenticating {
    public init() {}

    public func availableBiometry() -> BiometryKind {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else { return .none }
        switch context.biometryType {
        case .faceID: return .faceID
        case .touchID: return .touchID
        default:
            if #available(iOS 17.0, macOS 14.0, *), context.biometryType == .opticID { return .opticID }
            return .none
        }
    }

    public func authenticate(reason: String) async throws -> Bool {
        let context = LAContext()
        context.localizedFallbackTitle = ""
        var policyError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &policyError) else {
            throw AuthError.biometricUnavailable
        }
        do {
            return try await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason)
        } catch let error as LAError {
            switch error.code {
            case .userCancel, .appCancel, .systemCancel, .userFallback:
                return false
            case .biometryNotAvailable, .biometryNotEnrolled, .biometryLockout:
                throw AuthError.biometricUnavailable
            default:
                throw AuthError.biometricFailed
            }
        }
    }
}
#endif
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/OIDCClient.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/OIDCClient.swift`.

```swift
import Foundation

/// Presents the identity provider's login page and returns the redirect
/// URL. Production wraps `ASWebAuthenticationSession`.
public protocol WebAuthenticating: Sendable {
    func authenticate(url: URL, callbackScheme: String) async throws -> URL
}

/// Talks to the identity provider's token and revocation endpoints. These
/// are form-encoded OAuth endpoints, not the `/api/v1` platform API, so they
/// go straight through the transport rather than `APIClient`.
public protocol OIDCTokenClient: Sendable {
    func exchange(code: String, verifier: String) async throws -> TokenSet
    func refresh(refreshToken: String) async throws -> TokenSet
    func revoke(refreshToken: String) async
}

public enum TokenRefreshError: Error, Equatable {
    /// The refresh token is no longer valid; the user must sign in again.
    case invalidGrant
    case temporarilyUnavailable
}

public struct DefaultOIDCTokenClient: OIDCTokenClient {
    private let config: OIDCConfiguration
    private let transport: HTTPTransport
    private let clock: Clock
    private let logger: AppLogger

    public init(config: OIDCConfiguration, transport: HTTPTransport, clock: Clock = SystemClock(), logger: AppLogger = .shared) {
        self.config = config
        self.transport = transport
        self.clock = clock
        self.logger = logger
    }

    public func exchange(code: String, verifier: String) async throws -> TokenSet {
        let form = [
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": config.redirectURI.absoluteString,
            "client_id": config.clientId,
            "code_verifier": verifier
        ]
        let (data, response) = try await post(form, to: config.tokenEndpoint)
        guard response.statusCode == 200 else {
            logger.error("oidc.exchange_failed", ["status": String(response.statusCode)])
            throw AuthError.tokenExchangeFailed(status: response.statusCode)
        }
        return try decodeTokens(data)
    }

    public func refresh(refreshToken: String) async throws -> TokenSet {
        let form = [
            "grant_type": "refresh_token",
            "refresh_token": refreshToken,
            "client_id": config.clientId
        ]
        let (data, response) = try await post(form, to: config.tokenEndpoint)
        switch response.statusCode {
        case 200:
            return try decodeTokens(data)
        case 400, 401:
            let oauthError = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            logger.warning("oidc.refresh_rejected", ["error": oauthError ?? "unknown"])
            throw TokenRefreshError.invalidGrant
        default:
            throw TokenRefreshError.temporarilyUnavailable
        }
    }

    public func revoke(refreshToken: String) async {
        guard let endpoint = config.revocationEndpoint else { return }
        let form = ["token": refreshToken, "token_type_hint": "refresh_token", "client_id": config.clientId]
        do {
            _ = try await post(form, to: endpoint)
        } catch {
            // Revocation is best-effort; local sign-out proceeds regardless.
            logger.warning("oidc.revoke_failed", ["error": String(describing: error)])
        }
    }

    private func decodeTokens(_ data: Data) throws -> TokenSet {
        do {
            return try JSONDecoder().decode(TokenResponse.self, from: data).tokenSet(issuedAt: clock.now())
        } catch let error as AuthError {
            throw error
        } catch {
            throw AuthError.invalidTokenResponse
        }
    }

    private func post(_ form: [String: String], to url: URL) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = Self.formEncode(form).data(using: .utf8)
        do {
            return try await transport.send(request)
        } catch let urlError as URLError {
            throw APIError.from(urlError: urlError)
        }
    }

    static func formEncode(_ form: [String: String]) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return form
            .sorted { $0.key < $1.key }
            .map { key, value in
                let k = key.addingPercentEncoding(withAllowedCharacters: allowed) ?? key
                let v = value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
                return "\(k)=\(v)"
            }
            .joined(separator: "&")
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/OIDCConfiguration.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/OIDCConfiguration.swift`.

```swift
import Foundation

/// Static OIDC client settings. Values come from Info.plist build settings
/// (populated per environment via xcconfig) — never hard-coded secrets. A
/// public mobile client has no client secret; PKCE protects the code.
public struct OIDCConfiguration: Sendable, Equatable {
    public let issuer: URL
    public let clientId: String
    public let redirectURI: URL
    public let scopes: [String]
    public let authorizationEndpoint: URL
    public let tokenEndpoint: URL
    public let endSessionEndpoint: URL?
    public let revocationEndpoint: URL?

    public init(issuer: URL, clientId: String, redirectURI: URL, scopes: [String] = ["openid", "profile", "email", "offline_access"],
                authorizationEndpoint: URL? = nil, tokenEndpoint: URL? = nil, endSessionEndpoint: URL? = nil, revocationEndpoint: URL? = nil) {
        self.issuer = issuer
        self.clientId = clientId
        self.redirectURI = redirectURI
        self.scopes = scopes
        self.authorizationEndpoint = authorizationEndpoint ?? issuer.appendingPathComponent("authorize")
        self.tokenEndpoint = tokenEndpoint ?? issuer.appendingPathComponent("oauth/token")
        self.endSessionEndpoint = endSessionEndpoint ?? issuer.appendingPathComponent("logout")
        self.revocationEndpoint = revocationEndpoint ?? issuer.appendingPathComponent("oauth/revoke")
    }

    public enum LoadError: Error, Equatable {
        case missingKey(String)
        case invalidURL(String)
    }

    /// Reads `GKOIDCIssuer`, `GKOIDCClientID`, `GKOIDCRedirectURI` from a
    /// bundle's Info dictionary.
    public static func load(from info: [String: Any]) throws -> OIDCConfiguration {
        func string(_ key: String) throws -> String {
            guard let value = info[key] as? String, !value.isEmpty, !value.hasPrefix("$(") else {
                throw LoadError.missingKey(key)
            }
            return value
        }
        func url(_ key: String) throws -> URL {
            let raw = try string(key)
            guard let url = URL(string: raw), url.scheme != nil else { throw LoadError.invalidURL(key) }
            return url
        }
        let issuer = try url("GKOIDCIssuer")
        guard issuer.scheme == "https" else { throw LoadError.invalidURL("GKOIDCIssuer") }
        return OIDCConfiguration(issuer: issuer, clientId: try string("GKOIDCClientID"), redirectURI: try url("GKOIDCRedirectURI"))
    }
}

/// A single in-progress authorization attempt. Holds the secrets that must
/// match the callback (state, nonce) and the PKCE verifier for the exchange.
public struct AuthorizationRequest: Sendable, Equatable {
    public let url: URL
    public let state: String
    public let nonce: String
    public let pkce: PKCE

    public static func make(config: OIDCConfiguration, pkce: PKCE, state: String, nonce: String, loginHint: String? = nil, prompt: String? = nil) throws -> AuthorizationRequest {
        guard var components = URLComponents(url: config.authorizationEndpoint, resolvingAgainstBaseURL: false) else {
            throw AuthError.configuration
        }
        var items = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: config.clientId),
            URLQueryItem(name: "redirect_uri", value: config.redirectURI.absoluteString),
            URLQueryItem(name: "scope", value: config.scopes.joined(separator: " ")),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "nonce", value: nonce),
            URLQueryItem(name: "code_challenge", value: pkce.challenge),
            URLQueryItem(name: "code_challenge_method", value: pkce.method)
        ]
        if let loginHint, !loginHint.isEmpty { items.append(URLQueryItem(name: "login_hint", value: loginHint)) }
        if let prompt { items.append(URLQueryItem(name: "prompt", value: prompt)) }
        components.queryItems = items
        guard let url = components.url else { throw AuthError.configuration }
        return AuthorizationRequest(url: url, state: state, nonce: nonce, pkce: pkce)
    }

    /// Validates the redirect and extracts the authorization code.
    public func authorizationCode(from callback: URL, redirectURI: URL) throws -> String {
        guard callback.scheme == redirectURI.scheme,
              callback.host == redirectURI.host,
              callback.path == redirectURI.path else {
            throw AuthError.invalidCallback
        }
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String? { items.first { $0.name == name }?.value }

        if let error = value("error") {
            if error == "access_denied" { throw AuthError.userCancelled }
            throw AuthError.provider(code: error, description: value("error_description"))
        }
        guard value("state") == state else { throw AuthError.stateMismatch }
        guard let code = value("code"), !code.isEmpty else { throw AuthError.invalidCallback }
        return code
    }
}

public enum AuthError: Error, Equatable, Sendable {
    case configuration
    case userCancelled
    case invalidCallback
    case stateMismatch
    case nonceMismatch
    case provider(code: String, description: String?)
    case tokenExchangeFailed(status: Int)
    case invalidTokenResponse
    case notSignedIn
    case refreshFailed
    case roleNotPermitted
    case biometricUnavailable
    case biometricFailed
    case keychain(status: Int32)
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/PKCE.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/PKCE.swift`.

```swift
import Foundation
import CryptoKit
#if canImport(Security)
import Security
#endif

/// Proof Key for Code Exchange (RFC 7636) using the S256 method.
public struct PKCE: Sendable, Equatable {
    public let verifier: String
    public let challenge: String
    public let method = "S256"

    /// Unreserved characters allowed in a code verifier (RFC 7636 §4.1).
    static let verifierAlphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

    public init(verifier: String) throws {
        guard PKCE.isValidVerifier(verifier) else { throw PKCEError.invalidVerifier }
        self.verifier = verifier
        self.challenge = PKCE.challenge(for: verifier)
    }

    /// Generates a fresh 64-character verifier from a CSPRNG.
    public static func generate(length: Int = 64, randomBytes: (Int) throws -> [UInt8] = secureRandomBytes) throws -> PKCE {
        guard (43...128).contains(length) else { throw PKCEError.invalidVerifier }
        let bytes = try randomBytes(length)
        // Rejection-free mapping: the alphabet has 66 symbols, so take each
        // byte modulo 66. The slight bias is irrelevant at 64 chars of entropy
        // well above the RFC's 256-bit recommendation.
        let verifier = String(bytes.map { verifierAlphabet[Int($0) % verifierAlphabet.count] })
        return try PKCE(verifier: verifier)
    }

    public static func challenge(for verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest).base64URLEncodedString()
    }

    public static func isValidVerifier(_ verifier: String) -> Bool {
        (43...128).contains(verifier.count) && verifier.allSatisfy { verifierAlphabet.contains($0) }
    }

    public static func secureRandomBytes(_ count: Int) throws -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: count)
        #if canImport(Security)
        let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        guard status == errSecSuccess else { throw PKCEError.randomGenerationFailed }
        #else
        var generator = SystemRandomNumberGenerator()
        for index in bytes.indices { bytes[index] = UInt8.random(in: .min ... .max, using: &generator) }
        #endif
        return bytes
    }

    /// Random URL-safe token for `state` and `nonce`.
    public static func randomToken(byteCount: Int = 32) throws -> String {
        Data(try secureRandomBytes(byteCount)).base64URLEncodedString()
    }
}

public enum PKCEError: Error, Equatable {
    case invalidVerifier
    case randomGenerationFailed
}

public extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    init?(base64URLEncoded string: String) {
        var base64 = string
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = base64.count % 4
        if remainder == 1 { return nil }
        if remainder > 0 { base64 += String(repeating: "=", count: 4 - remainder) }
        self.init(base64Encoded: base64)
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/SecureStore.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/SecureStore.swift`.

```swift
import Foundation
#if canImport(Security)
import Security
#endif

/// Minimal secure key/value storage. Production uses the Keychain.
public protocol SecureStore: Sendable {
    func data(for key: String) throws -> Data?
    func set(_ data: Data, for key: String) throws
    func remove(_ key: String) throws
}

#if canImport(Security)
/// Keychain-backed store. Items are `WhenUnlockedThisDeviceOnly` so tokens
/// never migrate to backups or another device.
public struct KeychainSecureStore: SecureStore {
    private let service: String
    private let accessGroup: String?

    public init(service: String = "com.gokinetic.consumer.auth", accessGroup: String? = nil) {
        self.service = service
        self.accessGroup = accessGroup
    }

    private func baseQuery(for key: String) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }
        return query
    }

    public func data(for key: String) throws -> Data? {
        var query = baseQuery(for: key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess: return result as? Data
        case errSecItemNotFound: return nil
        default: throw AuthError.keychain(status: status)
        }
    }

    public func set(_ data: Data, for key: String) throws {
        let query = baseQuery(for: key)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else { throw AuthError.keychain(status: updateStatus) }

        var insert = query
        attributes.forEach { insert[$0.key] = $0.value }
        let addStatus = SecItemAdd(insert as CFDictionary, nil)
        guard addStatus == errSecSuccess else { throw AuthError.keychain(status: addStatus) }
    }

    public func remove(_ key: String) throws {
        let status = SecItemDelete(baseQuery(for: key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw AuthError.keychain(status: status)
        }
    }
}
#endif

/// Typed persistence of the token set and the biometric preference on top
/// of a `SecureStore`.
public struct TokenStore: Sendable {
    static let tokensKey = "oidc.tokens"
    static let biometricKey = "auth.biometricEnabled"

    private let store: SecureStore

    public init(store: SecureStore) {
        self.store = store
    }

    public func load() throws -> TokenSet? {
        guard let data = try store.data(for: Self.tokensKey) else { return nil }
        do {
            return try JSONCoding.decoder.decode(TokenSet.self, from: data)
        } catch {
            // A corrupt entry is unrecoverable; clear it so the user can sign in.
            try? store.remove(Self.tokensKey)
            return nil
        }
    }

    public func save(_ tokens: TokenSet) throws {
        try store.set(try JSONCoding.encoder.encode(tokens), for: Self.tokensKey)
    }

    public func clear() throws {
        try store.remove(Self.tokensKey)
    }

    public var isBiometricUnlockEnabled: Bool {
        (try? store.data(for: Self.biometricKey)).flatMap { $0 }.map { $0 == Data([1]) } ?? false
    }

    public func setBiometricUnlockEnabled(_ enabled: Bool) throws {
        if enabled {
            try store.set(Data([1]), for: Self.biometricKey)
        } else {
            try store.remove(Self.biometricKey)
        }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/TokenSet.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Auth/TokenSet.swift`.

```swift
import Foundation

/// Tokens issued by the identity provider. Persisted only in the Keychain.
public struct TokenSet: Codable, Equatable, Sendable {
    public let accessToken: String
    public let refreshToken: String?
    public let idToken: String?
    public let expiresAt: Date
    public let scope: String?

    public init(accessToken: String, refreshToken: String?, idToken: String?, expiresAt: Date, scope: String? = nil) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.idToken = idToken
        self.expiresAt = expiresAt
        self.scope = scope
    }

    /// Treat the token as expired slightly early so a request never leaves
    /// the device with a token that expires in flight.
    public func isExpired(at date: Date, leeway: TimeInterval = 60) -> Bool {
        date.addingTimeInterval(leeway) >= expiresAt
    }

    /// Merges a refresh response: providers may omit the refresh/id token
    /// when it hasn't rotated, in which case the existing ones are kept.
    public func merging(_ refreshed: TokenSet) -> TokenSet {
        TokenSet(accessToken: refreshed.accessToken,
                 refreshToken: refreshed.refreshToken ?? refreshToken,
                 idToken: refreshed.idToken ?? idToken,
                 expiresAt: refreshed.expiresAt,
                 scope: refreshed.scope ?? scope)
    }
}

/// Raw token endpoint response (RFC 6749 §5.1).
struct TokenResponse: Decodable {
    let access_token: String
    let token_type: String
    let expires_in: Int?
    let refresh_token: String?
    let id_token: String?
    let scope: String?

    func tokenSet(issuedAt: Date) throws -> TokenSet {
        guard token_type.lowercased() == "bearer", !access_token.isEmpty else { throw AuthError.invalidTokenResponse }
        let lifetime = TimeInterval(expires_in ?? 3600)
        return TokenSet(accessToken: access_token, refreshToken: refresh_token, idToken: id_token,
                        expiresAt: issuedAt.addingTimeInterval(lifetime), scope: scope)
    }
}

/// Claims the app reads from the ID token. Signature verification is the
/// identity provider's and API gateway's job; the client only uses claims
/// for display and to check nonce/audience on the login it initiated.
public struct IDTokenClaims: Equatable, Sendable {
    public let subject: String
    public let issuer: String
    public let audience: [String]
    public let expiresAt: Date
    public let nonce: String?
    public let email: String?
    public let name: String?
    public let roles: [String]
    public let accountId: String?

    public static func decode(_ jwt: String) throws -> IDTokenClaims {
        let segments = jwt.split(separator: ".", omittingEmptySubsequences: false)
        guard segments.count == 3, let payload = Data(base64URLEncoded: String(segments[1])) else {
            throw AuthError.invalidTokenResponse
        }
        guard let json = try JSONSerialization.jsonObject(with: payload) as? [String: Any] else {
            throw AuthError.invalidTokenResponse
        }
        guard let sub = json["sub"] as? String, let iss = json["iss"] as? String,
              let exp = (json["exp"] as? NSNumber)?.doubleValue else {
            throw AuthError.invalidTokenResponse
        }
        let audience: [String]
        if let single = json["aud"] as? String { audience = [single] } else { audience = json["aud"] as? [String] ?? [] }
        let roles = (json["roles"] as? [String])
            ?? (json["https://uniti.example/roles"] as? [String])
            ?? []
        return IDTokenClaims(subject: sub, issuer: iss, audience: audience,
                             expiresAt: Date(timeIntervalSince1970: exp),
                             nonce: json["nonce"] as? String,
                             email: json["email"] as? String,
                             name: json["name"] as? String,
                             roles: roles,
                             accountId: json["account_id"] as? String)
    }

    /// Validates the claims of a freshly issued ID token for this client.
    public func validate(issuer expectedIssuer: URL, clientId: String, nonce expectedNonce: String, now: Date) throws {
        let normalized = { (s: String) in s.hasSuffix("/") ? String(s.dropLast()) : s }
        guard normalized(issuer) == normalized(expectedIssuer.absoluteString) else { throw AuthError.invalidTokenResponse }
        guard audience.contains(clientId) else { throw AuthError.invalidTokenResponse }
        guard nonce == expectedNonce else { throw AuthError.nonceMismatch }
        guard expiresAt > now.addingTimeInterval(-300) else { throw AuthError.invalidTokenResponse }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/DI/AppEnvironment.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/DI/AppEnvironment.swift`.

```swift
import Foundation

/// Per-build environment settings, sourced from Info.plist keys that the
/// xcconfig for each scheme populates (see `Config/*.xcconfig.example`).
public struct AppEnvironment: Sendable, Equatable {
    public enum Name: String, Sendable {
        case development, staging, production
    }

    public let name: Name
    public let apiBaseURL: URL
    public let speedTestDiscoveryURL: URL
    public let oidc: OIDCConfiguration
    public let analyticsEnabledByDefault: Bool
    public let supportPhone: String

    public init(name: Name, apiBaseURL: URL, speedTestDiscoveryURL: URL, oidc: OIDCConfiguration, analyticsEnabledByDefault: Bool, supportPhone: String) {
        self.name = name
        self.apiBaseURL = apiBaseURL
        self.speedTestDiscoveryURL = speedTestDiscoveryURL
        self.oidc = oidc
        self.analyticsEnabledByDefault = analyticsEnabledByDefault
        self.supportPhone = supportPhone
    }

    public enum LoadError: Error, Equatable {
        case missing(String)
        case invalid(String)
        case insecure(String)
    }

    public static func load(from info: [String: Any]) throws -> AppEnvironment {
        func value(_ key: String) throws -> String {
            guard let raw = info[key] as? String, !raw.isEmpty, !raw.hasPrefix("$(") else { throw LoadError.missing(key) }
            return raw
        }
        func httpsURL(_ key: String, allowInsecure: Bool) throws -> URL {
            guard let url = URL(string: try value(key)), let scheme = url.scheme else { throw LoadError.invalid(key) }
            if scheme != "https" && !allowInsecure { throw LoadError.insecure(key) }
            return url
        }

        guard let name = Name(rawValue: try value("GKEnvironment")) else { throw LoadError.invalid("GKEnvironment") }
        // Plain HTTP is only tolerated against a local mock server in development.
        let allowInsecure = name == .development
        return AppEnvironment(
            name: name,
            apiBaseURL: try httpsURL("GKAPIBaseURL", allowInsecure: allowInsecure),
            speedTestDiscoveryURL: try httpsURL("GKSpeedTestDiscoveryURL", allowInsecure: allowInsecure),
            oidc: try OIDCConfiguration.load(from: info),
            analyticsEnabledByDefault: (info["GKAnalyticsEnabled"] as? String) != "NO",
            supportPhone: (info["GKSupportPhone"] as? String) ?? ""
        )
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/DI/DependencyContainer.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/DI/DependencyContainer.swift`.

```swift
import Foundation

/// Composition root. Every dependency a view model needs is created here
/// once and handed down explicitly — no singletons reached from features.
public final class DependencyContainer: @unchecked Sendable {
    public let environment: AppEnvironment
    public let clock: Clock
    public let logger: AppLogger
    public let analytics: AnalyticsService
    public let authSession: AuthSession
    public let apiClient: APIClientProtocol

    public let accounts: AccountRepository
    public let plans: PlanRepository
    public let billing: BillingRepository
    public let usage: UsageRepository
    public let router: RouterRepository
    public let outages: OutageRepository
    public let support: SupportRepository
    public let appointments: AppointmentRepository
    public let notifications: NotificationRepository
    public let speedTest: SpeedTestRunning
    public let preferences: PreferencesStore

    public init(
        environment: AppEnvironment,
        clock: Clock,
        logger: AppLogger,
        analytics: AnalyticsService,
        authSession: AuthSession,
        apiClient: APIClientProtocol,
        accounts: AccountRepository,
        plans: PlanRepository,
        billing: BillingRepository,
        usage: UsageRepository,
        router: RouterRepository,
        outages: OutageRepository,
        support: SupportRepository,
        appointments: AppointmentRepository,
        notifications: NotificationRepository,
        speedTest: SpeedTestRunning,
        preferences: PreferencesStore
    ) {
        self.environment = environment
        self.clock = clock
        self.logger = logger
        self.analytics = analytics
        self.authSession = authSession
        self.apiClient = apiClient
        self.accounts = accounts
        self.plans = plans
        self.billing = billing
        self.usage = usage
        self.router = router
        self.outages = outages
        self.support = support
        self.appointments = appointments
        self.notifications = notifications
        self.speedTest = speedTest
        self.preferences = preferences
    }

    /// Wires the production graph.
    public static func live(
        environment: AppEnvironment,
        identity: ClientIdentity,
        webAuthenticator: WebAuthenticating,
        biometrics: BiometricAuthenticating,
        secureStore: SecureStore,
        defaults: UserDefaults = .standard
    ) -> DependencyContainer {
        let clock = SystemClock()
        let logger = AppLogger.shared
        if environment.name == .development { logger.setMinimumLevel(.debug) }

        let preferences = PreferencesStore(defaults: defaults)
        let analytics = AnalyticsService(
            providers: [LogAnalyticsProvider(logger: logger)],
            enabled: preferences.analyticsOptIn ?? environment.analyticsEnabledByDefault
        )

        let transport = URLSessionTransport(session: makeAPISession())
        let auth = AuthSession(
            config: environment.oidc,
            tokenClient: DefaultOIDCTokenClient(config: environment.oidc, transport: transport, clock: clock, logger: logger),
            webAuthenticator: webAuthenticator,
            tokenStore: TokenStore(store: secureStore),
            biometrics: biometrics,
            clock: clock,
            logger: logger
        )
        let client = APIClient(
            builder: RequestBuilder(baseURL: environment.apiBaseURL, identity: identity),
            transport: transport,
            tokenProvider: auth,
            logger: logger
        )

        return DependencyContainer(
            environment: environment,
            clock: clock,
            logger: logger,
            analytics: analytics,
            authSession: auth,
            apiClient: client,
            accounts: LiveAccountRepository(client: client, clock: clock),
            plans: LivePlanRepository(client: client, clock: clock),
            billing: LiveBillingRepository(client: client, clock: clock),
            usage: LiveUsageRepository(client: client, clock: clock),
            router: LiveRouterRepository(client: client),
            outages: LiveOutageRepository(client: client, clock: clock),
            support: LiveSupportRepository(client: client),
            appointments: LiveAppointmentRepository(client: client, clock: clock),
            notifications: LiveNotificationRepository(client: client),
            speedTest: SpeedTestService(engine: URLSessionSpeedTestEngine(discoveryURL: environment.speedTestDiscoveryURL), client: client, clock: clock),
            preferences: preferences
        )
    }

    private static func makeAPISession() -> URLSession {
        let configuration = URLSessionConfiguration.default
        configuration.waitsForConnectivity = false
        configuration.timeoutIntervalForResource = 60
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        return URLSession(configuration: configuration)
    }

    /// Clears every cache that may hold the previous user's data.
    public func resetForSignOut() async {
        await accounts.clearCache()
        await billing.invalidate()
        analytics.identify(userId: nil)
    }
}

/// Non-sensitive user preferences (never tokens) in `UserDefaults`.
public final class PreferencesStore: @unchecked Sendable {
    private enum Keys {
        static let analyticsOptIn = "prefs.analyticsOptIn"
        static let lastPushToken = "prefs.lastPushToken"
        static let hasSeenOnboarding = "prefs.hasSeenOnboarding"
        static let preferredUsagePeriod = "prefs.usagePeriod"
    }

    private let defaults: UserDefaults

    public init(defaults: UserDefaults) {
        self.defaults = defaults
    }

    public var analyticsOptIn: Bool? {
        get { defaults.object(forKey: Keys.analyticsOptIn) as? Bool }
        set { defaults.set(newValue, forKey: Keys.analyticsOptIn) }
    }

    public var lastPushToken: String? {
        get { defaults.string(forKey: Keys.lastPushToken) }
        set { defaults.set(newValue, forKey: Keys.lastPushToken) }
    }

    public var hasSeenOnboarding: Bool {
        get { defaults.bool(forKey: Keys.hasSeenOnboarding) }
        set { defaults.set(newValue, forKey: Keys.hasSeenOnboarding) }
    }

    public var preferredUsagePeriod: UsagePeriod {
        get { defaults.string(forKey: Keys.preferredUsagePeriod).flatMap(UsagePeriod.init(rawValue:)) ?? .month }
        set { defaults.set(newValue.rawValue, forKey: Keys.preferredUsagePeriod) }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/AccountModels.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/AccountModels.swift`.

```swift
import Foundation

/// Roles defined by the platform conventions. The consumer app only admits
/// `CONSUMER`, but decoding keeps unknown roles rather than failing.
public enum UserRole: String, Codable, Sendable, CaseIterable {
    case consumer = "CONSUMER"
    case businessAdmin = "BUSINESS_ADMIN"
    case businessUser = "BUSINESS_USER"
    case partnerAdmin = "PARTNER_ADMIN"
    case partnerAgent = "PARTNER_AGENT"
    case wholesaleBuyer = "WHOLESALE_BUYER"
    case supportAgent = "SUPPORT_AGENT"
}

/// Account identifier in the `ACC-########` format.
public struct AccountID: RawRepresentable, Codable, Hashable, Sendable, CustomStringConvertible {
    public let rawValue: String

    public init?(rawValue: String) {
        guard AccountID.isValid(rawValue) else { return nil }
        self.rawValue = rawValue
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        guard let value = AccountID(rawValue: raw) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid account id \(raw)")
        }
        self = value
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    public static func isValid(_ raw: String) -> Bool {
        guard raw.count == 12, raw.hasPrefix("ACC-") else { return false }
        return raw.dropFirst(4).allSatisfy { ("0"..."9").contains($0) }
    }

    /// Masked form for display in shared spaces, e.g. `ACC-••••5678`.
    public var masked: String {
        "ACC-••••" + rawValue.suffix(4)
    }

    public var description: String { rawValue }
}

public struct PostalAddress: Codable, Hashable, Sendable {
    public let line1: String
    public let line2: String?
    public let city: String
    public let region: String
    public let postalCode: String
    public let country: String

    public init(line1: String, line2: String? = nil, city: String, region: String, postalCode: String, country: String) {
        self.line1 = line1
        self.line2 = line2
        self.city = city
        self.region = region
        self.postalCode = postalCode
        self.country = country
    }

    public var singleLine: String {
        [line1, line2, city, "\(region) \(postalCode)"]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }
}

public struct UserProfile: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let firstName: String
    public let lastName: String
    public let email: String
    public let phone: String?
    public let roles: [String]
    public let accountId: AccountID

    public init(id: String, firstName: String, lastName: String, email: String, phone: String?, roles: [String], accountId: AccountID) {
        self.id = id
        self.firstName = firstName
        self.lastName = lastName
        self.email = email
        self.phone = phone
        self.roles = roles
        self.accountId = accountId
    }

    public var displayName: String {
        let full = "\(firstName) \(lastName)".trimmingCharacters(in: .whitespaces)
        return full.isEmpty ? email : full
    }

    public var initials: String {
        let letters = [firstName.first, lastName.first].compactMap { $0 }
        return letters.isEmpty ? String(email.prefix(1)).uppercased() : String(letters).uppercased()
    }

    public var isConsumer: Bool { roles.contains(UserRole.consumer.rawValue) }
}

public enum ServiceStatus: String, Codable, Sendable {
    case active = "ACTIVE"
    case provisioning = "PROVISIONING"
    case suspended = "SUSPENDED"
    case cancelled = "CANCELLED"
}

/// An active product instance on the account tied to a service address.
public struct Service: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let productName: String
    public let planId: String
    public let status: ServiceStatus
    public let address: PostalAddress
    public let activatedAt: Date?

    public init(id: String, productName: String, planId: String, status: ServiceStatus, address: PostalAddress, activatedAt: Date?) {
        self.id = id
        self.productName = productName
        self.planId = planId
        self.status = status
        self.address = address
        self.activatedAt = activatedAt
    }
}

public struct AccountSummary: Codable, Hashable, Sendable {
    public let accountId: AccountID
    public let holderName: String
    public let balance: Money
    public let nextBillDate: Date?
    public let autopayEnabled: Bool
    public let services: [Service]

    public init(accountId: AccountID, holderName: String, balance: Money, nextBillDate: Date?, autopayEnabled: Bool, services: [Service]) {
        self.accountId = accountId
        self.holderName = holderName
        self.balance = balance
        self.nextBillDate = nextBillDate
        self.autopayEnabled = autopayEnabled
        self.services = services
    }

    /// The broadband service the consumer app focuses on.
    public var primaryService: Service? {
        services.first { $0.status == .active } ?? services.first
    }
}

/// Standard paginated response shape: `{ items, page, pageSize, total }`.
public struct Page<Item: Codable & Sendable>: Codable, Sendable {
    public let items: [Item]
    public let page: Int
    public let pageSize: Int
    public let total: Int

    public init(items: [Item], page: Int, pageSize: Int, total: Int) {
        self.items = items
        self.page = page
        self.pageSize = pageSize
        self.total = total
    }

    public var hasMore: Bool { page * pageSize < total }
    public var nextPage: Int? { hasMore ? page + 1 : nil }
}

extension Page: Equatable where Item: Equatable {}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/BillingModels.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/BillingModels.swift`.

```swift
import Foundation

public struct LineItem: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let description: String
    public let amount: Money
    public let category: Category

    public enum Category: String, Codable, Sendable {
        case recurring = "RECURRING"
        case oneTime = "ONE_TIME"
        case usage = "USAGE"
        case discount = "DISCOUNT"
        case tax = "TAX"
        case adjustment = "ADJUSTMENT"
    }

    public init(id: String, description: String, amount: Money, category: Category) {
        self.id = id
        self.description = description
        self.amount = amount
        self.category = category
    }
}

public enum InvoiceStatus: String, Codable, Sendable {
    case open = "OPEN"
    case paid = "PAID"
    case partiallyPaid = "PARTIALLY_PAID"
    case overdue = "OVERDUE"
    case void = "VOID"
}

public struct Invoice: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let number: String
    public let issuedAt: Date
    public let dueAt: Date
    public let periodStart: Date
    public let periodEnd: Date
    public let total: Money
    public let amountPaid: Money
    public let status: InvoiceStatus
    public let lineItems: [LineItem]

    public init(id: String, number: String, issuedAt: Date, dueAt: Date, periodStart: Date, periodEnd: Date, total: Money, amountPaid: Money, status: InvoiceStatus, lineItems: [LineItem]) {
        self.id = id
        self.number = number
        self.issuedAt = issuedAt
        self.dueAt = dueAt
        self.periodStart = periodStart
        self.periodEnd = periodEnd
        self.total = total
        self.amountPaid = amountPaid
        self.status = status
        self.lineItems = lineItems
    }

    public var amountDue: Money {
        (try? total.subtracting(amountPaid)) ?? total
    }

    public var isSettled: Bool {
        status == .paid || status == .void || !amountDue.isPositive
    }

    /// Whether the invoice is past due at `date`, independent of the server
    /// flag so the UI is correct even with a stale cached copy.
    public func isOverdue(at date: Date) -> Bool {
        !isSettled && date > dueAt
    }

    public func daysUntilDue(from date: Date, calendar: Calendar = .gregorianUTC) -> Int {
        let start = calendar.startOfDay(for: date)
        let end = calendar.startOfDay(for: dueAt)
        return calendar.dateComponents([.day], from: start, to: end).day ?? 0
    }

    /// Totals grouped by line-item category, for the bill breakdown view.
    public func subtotals() -> [(category: LineItem.Category, amount: Money)] {
        var buckets: [LineItem.Category: Int64] = [:]
        var order: [LineItem.Category] = []
        for item in lineItems where item.amount.currency == total.currency {
            if buckets[item.category] == nil { order.append(item.category) }
            buckets[item.category, default: 0] += item.amount.minorUnits
        }
        return order.map { ($0, Money(minorUnits: buckets[$0] ?? 0, currency: total.currency)) }
    }

    /// Detects line items that do not add up to the invoice total.
    public var lineItemsReconcile: Bool {
        guard !lineItems.isEmpty else { return true }
        let sum = lineItems
            .filter { $0.amount.currency == total.currency }
            .reduce(Int64(0)) { $0 + $1.amount.minorUnits }
        return sum == total.minorUnits
    }
}

public enum PaymentMethodKind: String, Codable, Sendable {
    case card = "CARD"
    case bankAccount = "BANK_ACCOUNT"
    case applePay = "APPLE_PAY"
}

/// A stored, tokenised payment method. The app never handles raw PANs.
public struct PaymentMethod: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let kind: PaymentMethodKind
    public let brand: String?
    public let last4: String
    public let expiryMonth: Int?
    public let expiryYear: Int?
    public let isDefault: Bool

    public init(id: String, kind: PaymentMethodKind, brand: String?, last4: String, expiryMonth: Int?, expiryYear: Int?, isDefault: Bool) {
        self.id = id
        self.kind = kind
        self.brand = brand
        self.last4 = last4
        self.expiryMonth = expiryMonth
        self.expiryYear = expiryYear
        self.isDefault = isDefault
    }

    public func isExpired(at date: Date, calendar: Calendar = .gregorianUTC) -> Bool {
        guard let month = expiryMonth, let year = expiryYear else { return false }
        let now = calendar.dateComponents([.year, .month], from: date)
        guard let currentYear = now.year, let currentMonth = now.month else { return false }
        return year < currentYear || (year == currentYear && month < currentMonth)
    }

    public var displayName: String {
        switch kind {
        case .card: return "\(brand ?? "Card") •••• \(last4)"
        case .bankAccount: return "Bank account •••• \(last4)"
        case .applePay: return "Apple Pay"
        }
    }
}

public enum PaymentStatus: String, Codable, Sendable {
    case pending = "PENDING"
    case succeeded = "SUCCEEDED"
    case failed = "FAILED"
    case refunded = "REFUNDED"
}

public struct Payment: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let amount: Money
    public let createdAt: Date
    public let status: PaymentStatus
    public let methodDisplay: String
    public let invoiceId: String?
    public let failureReason: String?

    public init(id: String, amount: Money, createdAt: Date, status: PaymentStatus, methodDisplay: String, invoiceId: String?, failureReason: String? = nil) {
        self.id = id
        self.amount = amount
        self.createdAt = createdAt
        self.status = status
        self.methodDisplay = methodDisplay
        self.invoiceId = invoiceId
        self.failureReason = failureReason
    }
}

public struct PaymentRequest: Codable, Sendable, Equatable {
    public let invoiceId: String?
    public let paymentMethodId: String
    public let amount: Money
    /// Client-generated key so a retried request never double-charges.
    public let idempotencyKey: String

    public init(invoiceId: String?, paymentMethodId: String, amount: Money, idempotencyKey: String = UUID().uuidString) {
        self.invoiceId = invoiceId
        self.paymentMethodId = paymentMethodId
        self.amount = amount
        self.idempotencyKey = idempotencyKey
    }
}

public struct AutopaySettings: Codable, Hashable, Sendable {
    public let enabled: Bool
    public let paymentMethodId: String?

    public init(enabled: Bool, paymentMethodId: String?) {
        self.enabled = enabled
        self.paymentMethodId = paymentMethodId
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/Money.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/Money.swift`.

```swift
import Foundation

/// A monetary amount expressed as integer minor units (e.g. cents) plus an
/// ISO-4217 currency code. Money is never represented as a floating-point
/// value anywhere in the app; formatting converts through `Decimal`.
public struct Money: Codable, Hashable, Sendable {
    public let minorUnits: Int64
    public let currency: String

    public init(minorUnits: Int64, currency: String) {
        self.minorUnits = minorUnits
        self.currency = currency.uppercased()
    }

    public static func zero(_ currency: String) -> Money {
        Money(minorUnits: 0, currency: currency)
    }

    /// Number of fractional digits for the currency (ISO-4217 exponent).
    public var exponent: Int {
        Money.exponent(for: currency)
    }

    public static func exponent(for currency: String) -> Int {
        switch currency.uppercased() {
        case "JPY", "KRW", "VND", "CLP", "ISK": return 0
        case "BHD", "KWD", "OMR", "JOD", "TND": return 3
        default: return 2
        }
    }

    /// Exact decimal representation in major units (e.g. 12.34 for 1234 USD cents).
    public var decimalValue: Decimal {
        var value = Decimal(minorUnits)
        for _ in 0..<exponent { value /= 10 }
        return value
    }

    public var isZero: Bool { minorUnits == 0 }
    public var isNegative: Bool { minorUnits < 0 }
    public var isPositive: Bool { minorUnits > 0 }

    public var negated: Money {
        Money(minorUnits: -minorUnits, currency: currency)
    }

    public var absolute: Money {
        Money(minorUnits: Swift.abs(minorUnits), currency: currency)
    }

    /// Parses user-entered text such as "45.10" or "45,10" into minor units.
    /// Returns nil for malformed input or more fractional digits than the
    /// currency allows. Never routes through `Double`.
    public static func parse(_ text: String, currency: String, locale: Locale = .current) -> Money? {
        let separator = locale.decimalSeparator ?? "."
        var cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let grouping = locale.groupingSeparator, grouping != separator {
            cleaned = cleaned.replacingOccurrences(of: grouping, with: "")
        }
        cleaned = cleaned.filter { !$0.isCurrencySymbolLike }
        cleaned = cleaned.replacingOccurrences(of: separator, with: ".")
        guard !cleaned.isEmpty else { return nil }

        let parts = cleaned.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count <= 2 else { return nil }
        let whole = String(parts[0])
        let fraction = parts.count == 2 ? String(parts[1]) : ""
        let exp = exponent(for: currency)

        guard whole.allSatisfy(\.isASCIIDigit), fraction.allSatisfy(\.isASCIIDigit) else { return nil }
        guard !(whole.isEmpty && fraction.isEmpty) else { return nil }
        guard fraction.count <= exp else { return nil }

        let paddedFraction = fraction.padding(toLength: exp, withPad: "0", startingAt: 0)
        let digits = (whole.isEmpty ? "0" : whole) + paddedFraction
        guard let units = Int64(digits) else { return nil }
        return Money(minorUnits: units, currency: currency)
    }
}

public enum MoneyError: Error, Equatable {
    case currencyMismatch(String, String)
    case overflow
}

extension Money {
    public func adding(_ other: Money) throws -> Money {
        guard currency == other.currency else { throw MoneyError.currencyMismatch(currency, other.currency) }
        let (sum, overflow) = minorUnits.addingReportingOverflow(other.minorUnits)
        guard !overflow else { throw MoneyError.overflow }
        return Money(minorUnits: sum, currency: currency)
    }

    public func subtracting(_ other: Money) throws -> Money {
        try adding(other.negated)
    }

    /// Multiplies by an integer quantity (e.g. months).
    public func multiplied(by quantity: Int) throws -> Money {
        let (product, overflow) = minorUnits.multipliedReportingOverflow(by: Int64(quantity))
        guard !overflow else { throw MoneyError.overflow }
        return Money(minorUnits: product, currency: currency)
    }

    /// Prorates this monthly amount for `days` of a `daysInPeriod` billing
    /// period, rounding half-up to the nearest minor unit.
    public func prorated(days: Int, of daysInPeriod: Int) -> Money {
        guard daysInPeriod > 0 else { return .zero(currency) }
        let clampedDays = max(0, min(days, daysInPeriod))
        let numerator = minorUnits * Int64(clampedDays)
        let denominator = Int64(daysInPeriod)
        let quotient = numerator / denominator
        let remainder = numerator % denominator
        let roundsUp = Swift.abs(remainder) * 2 >= denominator
        let adjusted = roundsUp ? quotient + (numerator >= 0 ? 1 : -1) : quotient
        return Money(minorUnits: adjusted, currency: currency)
    }

    public static func sum(_ amounts: [Money], currency: String) throws -> Money {
        try amounts.reduce(.zero(currency)) { try $0.adding($1) }
    }
}

extension Money: Comparable {
    /// Comparison is only meaningful within one currency; mixed-currency
    /// comparisons order by currency code first so sorting stays total.
    public static func < (lhs: Money, rhs: Money) -> Bool {
        if lhs.currency != rhs.currency { return lhs.currency < rhs.currency }
        return lhs.minorUnits < rhs.minorUnits
    }
}

private extension Character {
    var isASCIIDigit: Bool { ("0"..."9").contains(self) }
    var isCurrencySymbolLike: Bool {
        unicodeScalars.allSatisfy { $0.properties.generalCategory == .currencySymbol }
    }
}
```

## apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/NetworkModels.swift

Application: Go Kinetic Consumer mobile app (B2C). Stack: Swift / SwiftUI. Language: swift. Path: `apps/gokinetic-consumer-ios/Sources/GoKineticCore/Models/NetworkModels.swift`.

```swift
import Foundation

// MARK: - Usage

public enum UsagePeriod: String, Codable, Sendable, CaseIterable, Identifiable {
    case day = "DAY"
    case week = "WEEK"
    case month = "MONTH"

    public var id: String { rawValue }
}

public struct UsageSample: Codable, Hashable, Sendable, Identifiable {
    public let timestamp: Date
    public let downloadBytes: Int64
    public let uploadBytes: Int64

    public var id: Date { timestamp }
    public var totalBytes: Int64 { downloadBytes + uploadBytes }

    public init(timestamp: Date, downloadBytes: Int64, uploadBytes: Int64) {
        self.timestamp = timestamp
        self.downloadBytes = downloadBytes
        self.uploadBytes = uploadBytes
    }
}

public struct UsageReport: Codable, Hashable, Sendable {
    public let serviceId: String
    public let period: UsagePeriod
    public let samples: [UsageSample]
    public let dataCapBytes: Int64?
    public let cycleStart: Date
    public let cycleEnd: Date

    public init(serviceId: String, period: UsagePeriod, samples: [UsageSample], dataCapBytes: Int64?, cycleStart: Date, cycleEnd: Date) {
        self.serviceId = serviceId
        self.period = period
        self.samples = samples
        self.dataCapBytes = dataCapBytes
        self.cycleStart = cycleStart
        self.cycleEnd = cycleEnd
    }

    public var totalDownload: Int64 { samples.reduce(0) { $0 + $1.downloadBytes } }
    public var totalUpload: Int64 { samples.reduce(0) { $0 + $1.uploadBytes } }
    public var total: Int64 { totalDownload + totalUpload }

    public var peak: UsageSample? { samples.max { $0.totalBytes < $1.totalBytes } }

    /// Fraction of the data cap used (0...1+), nil for unlimited plans.
    public var capUtilisation: Double? {
        guard let cap = dataCapBytes, cap > 0 else { return nil }
        return Double(total) / Double(cap)
    }

    /// Linear projection of cycle usage based on the elapsed portion.
    public func projectedCycleTotal(at date: Date) -> Int64 {
        let cycleLength = cycleEnd.timeIntervalSince(cycleStart)
        let elapsed = min(max(date.timeIntervalSince(cycleStart), 0), cycleLength)
        guard elapsed > 0, cycleLength > 0 else { return total }
        return Int64((Double(total) * cycleLength / elapsed).rounded())
    }
}

// MARK: - Router / Wi-Fi

public enum WiFiBand: String, Codable, Sendable, CaseIterable {
    case ghz2_4 = "2.4GHZ"
    case ghz5 = "5GHZ"
    case ghz6 = "6GHZ"
}

public enum WiFiSecurity: String, Codable, Sendable, CaseIterable {
    case wpa2 = "WPA2"
    case wpa3 = "WPA3"
    case wpa2wpa3 = "WPA2_WPA3"
}

public struct WiFiNetwork: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let ssid: String
    public let bands: [WiFiBand]
    public let security: WiFiSecurity
    public let isGuest: Bool
    public let enabled: Bool

    public init(id: String, ssid: String, bands: [WiFiBand], security: WiFiSecurity, isGuest: Bool, enabled: Bool) {
        self.id = id
        self.ssid = ssid
        self.bands = bands
        self.security = security
        self.isGuest = isGuest
        self.enabled = enabled
    }
}

public enum RouterState: String, Codable, Sendable {
    case online = "ONLINE"
    case offline = "OFFLINE"
    case rebooting = "REBOOTING"
    case updating = "UPDATING"
    case degraded = "DEGRADED"
}

public struct RouterStatus: Codable, Hashable, Sendable {
    public let routerId: String
    public let model: String
    public let firmwareVersion: String
    public let state: RouterState
    public let uptimeSeconds: Int
    public let lastSeen: Date
    public let networks: [WiFiNetwork]

    public init(routerId: String, model: String, firmwareVersion: String, state: RouterState, uptimeSeconds: Int, lastSeen: Date, networks: [WiFiNetwork]) {
        self.routerId = routerId
        self.model = model
        self.firmwareVersion = firmwareVersion
        self.state = state
        self.uptimeSeconds = uptimeSeconds
        self.lastSeen = lastSeen
        self.networks = networks
    }

    public var primaryNetwork: WiFiNetwork? {
        networks.first { !$0.isGuest } ?? networks.first
    }

    public var canReboot: Bool { state == .online || state == .degraded }
}

public struct ConnectedDevice: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let macAddress: String
    public let ipAddress: String?
    public let band: WiFiBand?
    public let isWired: Bool
    public let signalDBm: Int?
    public let isBlocked: Bool
    public let lastActive: Date

    public init(id: String, name: String, macAddress: String, ipAddress: String?, band: WiFiBand?, isWired: Bool, signalDBm: Int?, isBlocked: Bool, lastActive: Date) {
        self.id = id
        self.name = name
        self.macAddress = macAddress
        self.ipAddress = ipAddress
        self.band = band
        self.isWired = isWired
        self.signalDBm = signalDBm
        self.isBlocked = isBlocked
        self.lastActive = lastActive
    }

    public enum SignalQuality: String, Sendable {
        case excellent, good, fair, poor, unknown
    }

    public var signalQuality: SignalQuality {
        guard !isWired else { return .excellent }
        guard let dbm = signalDBm else { return .unknown }
        switch dbm {
        case (-55)...: return .excellent
        case (-67)..<(-55): return .good
        case (-75)..<(-67): return .fair
        default: return .poor
        }
    }

    public func isOnline(at date: Date, threshold: TimeInterval = 300) -> Bool {
        !isBlocked && date.timeIntervalSince(lastActive) <= threshold
    }
}

public struct WiFiUpdateRequest: Codable, Sendable, Equatable {
    public let networkId: String
    public let ssid: String
    public let passphrase: String?
    public let security: WiFiSecurity

    public init(networkId: String, ssid: String, passphrase: String?, security: WiFiSecurity) {
        self.networkId = networkId
        self.ssid = ssid
        self.passphrase = passphrase
        self.security = security
    }
}

// MARK: - Speed test

public struct SpeedTestResult: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let measuredAt: Date
    public let downloadMbps: Double
    public let uploadMbps: Double
    public let latencyMs: Double
    public let jitterMs: Double
    public let server: String

    public init(id: String = UUID().uuidString, measuredAt: Date, downloadMbps: Double, uploadMbps: Double, latencyMs: Double, jitterMs: Double, server: String) {
        self.id = id
        self.measuredAt = measuredAt
        self.downloadMbps = downloadMbps
        self.uploadMbps = uploadMbps
        self.latencyMs = latencyMs
        self.jitterMs = jitterMs
        self.server = server
    }

    public enum Verdict: String, Sendable {
        case great, ok, belowExpected
    }

    /// Compares the measurement to the plan's provisioned speed. Wi-Fi
    /// overhead means ~70% of tier over the air is considered healthy.
    public func verdict(against plan: Plan) -> Verdict {
        let ratio = downloadMbps / Double(max(plan.downloadMbps, 1))
        switch ratio {
        case 0.85...: return .great
        case 0.6..<0.85: return .ok
        default: return .belowExpected
        }
    }
}

// MARK: - Outages

public enum OutageSeverity: String, Codable, Sendable, Comparable {
    case info = "INFO"
    case degraded = "DEGRADED"
    case major = "MAJOR"

    private var rank: Int {
        switch self { case .info: return 0; case .degraded: return 1; case .major: return 2 }
    }

    public static func < (lhs: OutageSeverity, rhs: OutageSeverity) -> Bool { lhs.rank < rhs.rank }
}

public struct Outage: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let detail: String
    public let severity: OutageSeverity
    public let startedAt: Date
    public let estimatedResolution: Date?
    public let resolvedAt: Date?
    public let affectsMyService: Bool

    public init(id: String, title: String, detail: String, severity: OutageSeverity, startedAt: Date, estimatedResolution: Date?, resolvedAt: Date?, affectsMyService: Bool) {
        self.id = id
        self.title = title
        self.detail = detail
        self.severity = severity
        self.startedAt = startedAt
        self.estimatedResolution = estimatedResolution
        self.resolvedAt = resolvedAt
        self.affectsMyService = affectsMyService
    }

    public var isActive: Bool { resolvedAt == nil }

    public func isPastEstimate(at date: Date) -> Bool {
        guard isActive, let eta = estimatedResolution else { return false }
        return date > eta
    }
}
```
