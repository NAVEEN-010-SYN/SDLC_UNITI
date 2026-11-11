import Foundation

/// Composition root. Every dependency a view model needs is created here
/// once and handed down explicitly - no singletons reached from features.
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
