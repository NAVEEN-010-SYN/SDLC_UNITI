import Foundation
import GoKineticCore
import GoKineticUI

/// Home Wi-Fi: router health, reboot with recovery tracking, and the
/// connected-device list with block / rename.
@MainActor
public final class WiFiViewModel: ObservableObject {
    public enum RebootState: Equatable {
        case idle
        case inProgress(RouterState)
        case completed
        case failed(UserFacingError)
    }

    public struct DeviceSummary: Equatable {
        public let online: Int
        public let offline: Int
        public let blocked: Int
        public let weakSignal: Int
    }

    @Published public private(set) var router: ViewState<RouterStatus> = .idle
    @Published public private(set) var devices: ViewState<[ConnectedDevice]> = .idle
    @Published public private(set) var rebootState: RebootState = .idle
    @Published public private(set) var busyDeviceIds: Set<String> = []
    @Published public var actionError: UserFacingError?

    public let serviceId: String
    private let routerRepository: RouterRepository
    private let monitor: RouterRecoveryMonitor
    private let analytics: AnalyticsTracking
    private let clock: Clock

    public init(serviceId: String, router: RouterRepository, analytics: AnalyticsTracking, clock: Clock,
                sleeper: Sleeper = TaskSleeper()) {
        self.serviceId = serviceId
        self.routerRepository = router
        self.monitor = RouterRecoveryMonitor(router: router, sleeper: sleeper)
        self.analytics = analytics
        self.clock = clock
    }

    public func load() async {
        router = router.reloading()
        do {
            let status = try await routerRepository.status(serviceId: serviceId)
            router = .loaded(status)
            await loadDevices(routerId: status.routerId)
        } catch {
            router = router.failing(error)
        }
    }

    private func loadDevices(routerId: String) async {
        devices = devices.reloading()
        do {
            devices = .from(try await routerRepository.connectedDevices(routerId: routerId))
        } catch {
            devices = devices.failing(error)
        }
    }

    public var deviceSummary: DeviceSummary? {
        guard let list = devices.value else { return nil }
        let now = clock.now()
        return DeviceSummary(
            online: list.filter { $0.isOnline(at: now) }.count,
            offline: list.filter { !$0.isBlocked && !$0.isOnline(at: now) }.count,
            blocked: list.filter(\.isBlocked).count,
            weakSignal: list.filter { $0.isOnline(at: now) && $0.signalQuality == .poor }.count
        )
    }

    public func isOnline(_ device: ConnectedDevice) -> Bool {
        device.isOnline(at: clock.now())
    }

    // MARK: Reboot

    public var canReboot: Bool {
        guard let status = router.value, status.canReboot else { return false }
        if case .inProgress = rebootState { return false }
        return true
    }

    public func reboot() async {
        guard canReboot, let status = router.value else { return }
        rebootState = .inProgress(.rebooting)
        analytics.track(.routerRebooted)
        do {
            let recovered = try await monitor.rebootAndWait(routerId: status.routerId, serviceId: serviceId) { [weak self] state in
                await self?.observeRebootProgress(state)
            }
            router = .loaded(recovered)
            rebootState = .completed
            await loadDevices(routerId: recovered.routerId)
        } catch RouterRecoveryMonitor.RecoveryError.didNotRecover {
            rebootState = .failed(UserFacingError(kind: .server, titleKey: "wifi.reboot.notRecovered", isRetryable: true))
        } catch {
            rebootState = .failed(UserFacingError(error))
        }
    }

    private func observeRebootProgress(_ state: RouterState) {
        if case .inProgress = rebootState { rebootState = .inProgress(state) }
    }

    public func acknowledgeReboot() {
        rebootState = .idle
    }

    // MARK: Devices

    /// Optimistic: the row flips immediately and reverts on failure.
    public func setBlocked(_ device: ConnectedDevice, blocked: Bool) async {
        guard let routerId = router.value?.routerId, device.isBlocked != blocked else { return }
        await mutate(device, optimistic: device.with(blocked: blocked)) {
            let updated = try await self.routerRepository.setDeviceBlocked(routerId: routerId, deviceId: device.id, blocked: blocked)
            self.analytics.track(.deviceBlocked(blocked: blocked))
            return updated
        }
    }

    public func rename(_ device: ConnectedDevice, to name: String) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let routerId = router.value?.routerId, trimmed != device.name, !trimmed.isEmpty else { return }
        await mutate(device, optimistic: device.with(name: trimmed)) {
            try await self.routerRepository.renameDevice(routerId: routerId, deviceId: device.id, name: trimmed)
        }
    }

    private func mutate(_ device: ConnectedDevice, optimistic: ConnectedDevice,
                        operation: () async throws -> ConnectedDevice) async {
        guard !busyDeviceIds.contains(device.id) else { return }
        busyDeviceIds.insert(device.id)
        defer { busyDeviceIds.remove(device.id) }
        replace(optimistic)
        do {
            replace(try await operation())
        } catch {
            replace(device)
            actionError = UserFacingError(error)
        }
    }

    private func replace(_ device: ConnectedDevice) {
        guard var list = devices.value, let index = list.firstIndex(where: { $0.id == device.id }) else { return }
        list[index] = device
        devices = .loaded(list)
    }
}

extension ConnectedDevice {
    func with(blocked: Bool? = nil, name: String? = nil) -> ConnectedDevice {
        ConnectedDevice(id: id, name: name ?? self.name, macAddress: macAddress, ipAddress: ipAddress, band: band,
                        isWired: isWired, signalDBm: signalDBm, isBlocked: blocked ?? isBlocked, lastActive: lastActive)
    }
}
