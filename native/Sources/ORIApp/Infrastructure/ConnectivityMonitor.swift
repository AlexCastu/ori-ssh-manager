import Foundation
import Network
import SystemConfiguration

@MainActor
final class ConnectivityMonitor {
    private let path = NWPathMonitor()
    private var store: SCDynamicStore?
    private var callback: (@MainActor (Bool?) -> Void)?
    func start(_ callback: @escaping @MainActor (Bool?) -> Void) {
        self.callback = callback
        path.pathUpdateHandler = { [weak self] newPath in
            let available = newPath.status == .satisfied
            Task { @MainActor in self?.callback?(available) }
        }
        path.start(queue: DispatchQueue(label: "ori.network.path"))
        var context = SCDynamicStoreContext(
            version: 0, info: Unmanaged.passUnretained(self).toOpaque(), retain: nil, release: nil,
            copyDescription: nil)
        store = SCDynamicStoreCreate(
            nil, "ORI network notifications" as CFString,
            { _, _, info in
                guard let info else { return }
                let monitor = Unmanaged<ConnectivityMonitor>.fromOpaque(info).takeUnretainedValue()
                Task { @MainActor [weak monitor] in monitor?.callback?(nil) }
            }, &context)
        if let store {
            let patterns = [
                "State:/Network/Service/.*/IPv4",
                "State:/Network/Service/.*/IPv6", "State:/Network/Service/.*/DNS",
                "State:/Network/Global/IPv4", "State:/Network/Global/IPv6",
                "State:/Network/Global/DNS",
                "State:/Network/Interface/.*/IPv4", "State:/Network/Interface/.*/IPv6",
                "State:/Network/Interface/.*/Link", "State:/Network/Interface",
                "Setup:/Network/Service/.*",
            ]
            SCDynamicStoreSetNotificationKeys(store, nil, patterns as CFArray)
            SCDynamicStoreSetDispatchQueue(store, DispatchQueue.main)
        }
    }
    func stop() {
        path.cancel()
        callback = nil
        if let store { SCDynamicStoreSetDispatchQueue(store, nil) }
        store = nil
    }
}
