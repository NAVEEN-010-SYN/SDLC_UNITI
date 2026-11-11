import Foundation

// MARK: - Usage

public protocol UsageRepository: Sendable {
    func usage(serviceId: String, period: UsagePeriod, forceRefresh: Bool) async throws -> UsageReport
}

enum UsageEndpoints {
    static func usage(serviceId: String, period: UsagePeriod) -> Endpoint<UsageReport> {
        Endpoint(path: "/services/\(serviceId)/usage", query: [URLQueryItem(name: "period", value: period.rawValue)])
    }
}

public final class LiveUsageRepository: UsageRepository {
    private struct Key: Hashable, Sendable { let serviceId: String; let period: UsagePeriod }

    private let client: APIClientProtocol
    private let cache: TTLCache<Key, UsageReport>

    public init(client: APIClientProtocol, clock: Clock = SystemClock()) {
        self.client = client
        // Usage is aggregated hourly upstream; caching for 10 minutes is safe.
        self.cache = TTLCache(ttl: 10 * 60, clock: clock)
    }

    public func usage(serviceId: String, period: UsagePeriod, forceRefresh: Bool) async throws -> UsageReport {
        let client = self.client
        return try await cache.value(for: Key(serviceId: serviceId, period: period), forceRefresh: forceRefresh) {
            let report = try await client.send(UsageEndpoints.usage(serviceId: serviceId, period: period))
            return UsageReport(serviceId: report.serviceId, period: report.period,
                               samples: report.samples.sorted { $0.timestamp < $1.timestamp },
                               dataCapBytes: report.dataCapBytes, cycleStart: report.cycleStart, cycleEnd: report.cycleEnd)
        }
    }
}

// MARK: - Router

public protocol RouterRepository: Sendable {
    func status(serviceId: String) async throws -> RouterStatus
    func reboot(routerId: String) async throws
    func updateWiFi(routerId: String, _ request: WiFiUpdateRequest) async throws -> WiFiNetwork
    func connectedDevices(routerId: String) async throws -> [ConnectedDevice]
    func setDeviceBlocked(routerId: String, deviceId: String, blocked: Bool) async throws -> ConnectedDevice
    func renameDevice(routerId: String, deviceId: String, name: String) async throws -> ConnectedDevice
}

enum RouterEndpoints {
    static func status(serviceId: String) -> Endpoint<RouterStatus> {
        Endpoint(path: "/services/\(serviceId)/router", timeout: 20)
    }

    static func reboot(routerId: String) -> Endpoint<EmptyResponse> {
        // Not idempotent from the user's perspective: never auto-retried.
        Endpoint(path: "/routers/\(routerId)/reboot", method: .post)
    }

    static func updateWiFi(routerId: String, _ request: WiFiUpdateRequest) throws -> Endpoint<WiFiNetwork> {
        try Endpoint(path: "/routers/\(routerId)/wifi/\(request.networkId)", method: .put, jsonBody: request)
    }

    static func devices(routerId: String) -> Endpoint<[ConnectedDevice]> {
        Endpoint(path: "/routers/\(routerId)/devices")
    }

    struct DevicePatch: Encodable { let blocked: Bool?; let name: String? }

    static func patchDevice(routerId: String, deviceId: String, _ patch: DevicePatch) throws -> Endpoint<ConnectedDevice> {
        try Endpoint(path: "/routers/\(routerId)/devices/\(deviceId)", method: .patch, jsonBody: patch)
    }
}

public final class LiveRouterRepository: RouterRepository {
    private let client: APIClientProtocol

    public init(client: APIClientProtocol) {
        self.client = client
    }

    public func status(serviceId: String) async throws -> RouterStatus {
        try await client.send(RouterEndpoints.status(serviceId: serviceId))
    }

    public func reboot(routerId: String) async throws {
        _ = try await client.send(RouterEndpoints.reboot(routerId: routerId))
    }

    public func updateWiFi(routerId: String, _ request: WiFiUpdateRequest) async throws -> WiFiNetwork {
        let result = WiFiCredentialsValidator.validate(ssid: request.ssid, passphrase: request.passphrase, confirmation: request.passphrase)
        guard result.isValid else {
            var errors: [String: [String]] = [:]
            result.issues.forEach { errors[$0.field, default: []].append($0.messageKey) }
            throw APIError.validation(ProblemDetails(title: "Invalid Wi-Fi settings", errors: errors))
        }
        return try await client.send(RouterEndpoints.updateWiFi(routerId: routerId, request))
    }

    /// Online devices first (most recently active), then offline/blocked.
    public func connectedDevices(routerId: String) async throws -> [ConnectedDevice] {
        let devices = try await client.send(RouterEndpoints.devices(routerId: routerId))
        return devices.sorted { lhs, rhs in
            if lhs.isBlocked != rhs.isBlocked { return !lhs.isBlocked }
            return lhs.lastActive > rhs.lastActive
        }
    }

    public func setDeviceBlocked(routerId: String, deviceId: String, blocked: Bool) async throws -> ConnectedDevice {
        try await client.send(RouterEndpoints.patchDevice(routerId: routerId, deviceId: deviceId, .init(blocked: blocked, name: nil)))
    }

    public func renameDevice(routerId: String, deviceId: String, name: String) async throws -> ConnectedDevice {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...40).contains(trimmed.count) else {
            throw APIError.validation(ProblemDetails(title: "Invalid name", errors: ["name": ["Use 1–40 characters."]]))
        }
        return try await client.send(RouterEndpoints.patchDevice(routerId: routerId, deviceId: deviceId, .init(blocked: nil, name: trimmed)))
    }
}

// MARK: - Outages

public protocol OutageRepository: Sendable {
    func outages(serviceId: String) async throws -> [Outage]
}

enum OutageEndpoints {
    static func outages(serviceId: String) -> Endpoint<[Outage]> {
        Endpoint(path: "/services/\(serviceId)/outages")
    }
}

public final class LiveOutageRepository: OutageRepository {
    private let client: APIClientProtocol
    private let cache: TTLCache<String, [Outage]>

    public init(client: APIClientProtocol, clock: Clock = SystemClock()) {
        self.client = client
        self.cache = TTLCache(ttl: 2 * 60, clock: clock)
    }

    /// Active outages affecting the user first, ordered by severity, then
    /// other active outages, then recently resolved.
    public func outages(serviceId: String) async throws -> [Outage] {
        let client = self.client
        let list = try await cache.value(for: serviceId) {
            try await client.send(OutageEndpoints.outages(serviceId: serviceId))
        }
        return list.sorted { lhs, rhs in
            if lhs.isActive != rhs.isActive { return lhs.isActive }
            if lhs.affectsMyService != rhs.affectsMyService { return lhs.affectsMyService }
            if lhs.severity != rhs.severity { return lhs.severity > rhs.severity }
            return lhs.startedAt > rhs.startedAt
        }
    }
}
