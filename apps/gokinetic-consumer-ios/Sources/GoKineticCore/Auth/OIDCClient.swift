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
