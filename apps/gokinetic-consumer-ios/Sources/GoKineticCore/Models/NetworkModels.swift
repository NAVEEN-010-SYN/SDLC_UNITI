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
