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
