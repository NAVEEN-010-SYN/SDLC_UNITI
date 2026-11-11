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

/// Raw token endpoint response (RFC 6749 Section 5.1).
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
