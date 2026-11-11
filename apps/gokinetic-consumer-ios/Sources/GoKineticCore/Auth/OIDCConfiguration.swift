import Foundation

/// Static OIDC client settings. Values come from Info.plist build settings
/// (populated per environment via xcconfig) - never hard-coded secrets. A
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
