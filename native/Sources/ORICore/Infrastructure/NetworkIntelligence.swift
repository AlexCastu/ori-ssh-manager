import Darwin
import Foundation
import Network
import SystemConfiguration

private final class ProbePromise<T: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<T, any Error>?
    private var result: Result<T, any Error>?
    func install(_ continuation: CheckedContinuation<T, any Error>) {
        lock.lock()
        if let result {
            lock.unlock()
            continuation.resume(with: result)
        } else {
            self.continuation = continuation
            lock.unlock()
        }
    }
    func finish(_ result: Result<T, any Error>) {
        lock.lock()
        guard self.result == nil else {
            lock.unlock()
            return
        }
        self.result = result
        let callback = continuation
        continuation = nil
        lock.unlock()
        callback?.resume(with: result)
    }
}

public struct DNSInspector: Sendable {
    public init() {}
    public func resolve(_ host: String, timeout: TimeInterval = 4) async throws -> [String] {
        try Validation.address(host)
        let promise = ProbePromise<[String]>()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                promise.install(continuation)
                DispatchQueue.global(qos: .utility).async {
                    var hints = addrinfo()
                    hints.ai_family = AF_UNSPEC
                    hints.ai_socktype = SOCK_STREAM
                    hints.ai_protocol = IPPROTO_TCP
                    var list: UnsafeMutablePointer<addrinfo>?
                    let status = getaddrinfo(host, nil, &hints, &list)
                    guard status == 0 else {
                        promise.finish(
                            .failure(
                                ORIError.unavailable(
                                    "DNS: \(String(cString: gai_strerror(status)))")))
                        return
                    }
                    defer { if let list { freeaddrinfo(list) } }
                    var addresses: [String] = []
                    var cursor = list
                    while let item = cursor {
                        var buffer = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                        if getnameinfo(
                            item.pointee.ai_addr, item.pointee.ai_addrlen, &buffer,
                            socklen_t(buffer.count), nil, 0, NI_NUMERICHOST) == 0
                        {
                            let address = String(
                                decoding: buffer.prefix { $0 != 0 }.map { UInt8(bitPattern: $0) },
                                as: UTF8.self)
                            if !addresses.contains(address) { addresses.append(address) }
                        }
                        cursor = item.pointee.ai_next
                    }
                    promise.finish(.success(Array(addresses.prefix(8))))
                }
                DispatchQueue.global().asyncAfter(deadline: .now() + timeout) {
                    promise.finish(
                        .failure(
                            ORIError.unavailable(
                                "La resolución DNS ha agotado el tiempo de espera.")))
                }
            }
        } onCancel: {
            promise.finish(.failure(CancellationError()))
        }
    }
}

public struct TCPReachabilityProbe: Sendable {
    public init() {}
    public func check(_ target: ConnectivityTarget, timeout: TimeInterval = 4) async throws -> Bool
    {
        try Validation.address(target.host)
        try Validation.port(target.port)
        let promise = ProbePromise<Bool>()
        let connection = NWConnection(
            host: NWEndpoint.Host(target.host),
            port: NWEndpoint.Port(rawValue: UInt16(target.port))!, using: .tcp)
        let queue = DispatchQueue(label: "ori.tcp.\(UUID())")
        return try await withTaskCancellationHandler {
            defer {
                connection.stateUpdateHandler = nil
                connection.cancel()
            }
            return try await withCheckedThrowingContinuation { continuation in
                promise.install(continuation)
                connection.stateUpdateHandler = { state in
                    switch state {
                    case .ready: promise.finish(.success(true))
                    case .failed, .cancelled: promise.finish(.success(false))
                    default: break
                    }
                }
                connection.start(queue: queue)
                queue.asyncAfter(deadline: .now() + timeout) { promise.finish(.success(false)) }
            }
        } onCancel: {
            connection.cancel()
            promise.finish(.failure(CancellationError()))
        }
    }
}

public struct RouteInspector: Sendable {
    public init() {}
    public func route(to address: String) async throws -> RouteObservation {
        try Validation.address(address)
        let result = try await SystemCommandRunner().run(
            "/sbin/route", ["-n", "get", address.contains(":") ? "-inet6" : "-inet", address])
        var fields: [String: String] = [:]
        for line in result.output.split(separator: "\n") {
            let parts = line.split(separator: ":", maxSplits: 1)
            if parts.count == 2 {
                fields[parts[0].trimmingCharacters(in: .whitespaces)] = parts[1].trimmingCharacters(
                    in: .whitespaces)
            }
        }
        return .init(
            address: address, interface: fields["interface"], gateway: fields["gateway"],
            available: result.status == 0 && fields["interface"] != nil
                && !(fields["flags"] ?? "").contains("REJECT"))
    }
}

public struct InterfaceObservation: Sendable, Identifiable {
    public var name: String
    public var addresses: [String]
    public var isUp: Bool
    public var id: String { name }
}
public struct InterfaceInspector: Sendable {
    public init() {}
    public func interfaces() -> [InterfaceObservation] {
        var list: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&list) == 0 else { return [] }
        defer { freeifaddrs(list) }
        var result: [String: InterfaceObservation] = [:]
        var cursor = list
        while let item = cursor {
            defer { cursor = item.pointee.ifa_next }
            let name = String(cString: item.pointee.ifa_name)
            var observation =
                result[name]
                ?? .init(
                    name: name, addresses: [], isUp: (item.pointee.ifa_flags & UInt32(IFF_UP)) != 0)
            if let addr = item.pointee.ifa_addr,
                addr.pointee.sa_family == AF_INET || addr.pointee.sa_family == AF_INET6
            {
                var bytes = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                if getnameinfo(
                    addr, socklen_t(addr.pointee.sa_len), &bytes, socklen_t(bytes.count), nil, 0,
                    NI_NUMERICHOST) == 0
                {
                    observation.addresses.append(
                        String(
                            decoding: bytes.prefix { $0 != 0 }.map { UInt8(bitPattern: $0) },
                            as: UTF8.self))
                }
            }
            result[name] = observation
        }
        return result.values.sorted { $0.name < $1.name }
    }
}

public struct ConnectivityInspector: Sendable {
    public init() {}
    public func inspect(_ target: ConnectivityTarget, probeTCP: Bool = true) async
        -> NetworkReachabilityResult
    {
        do {
            let addresses = try await DNSInspector().resolve(target.host)
            guard !addresses.isEmpty else {
                throw ORIError.unavailable("DNS no ha devuelto direcciones.")
            }
            var routes: [RouteObservation] = []
            for ip in addresses {
                if let route = try? await RouteInspector().route(to: ip) { routes.append(route) }
            }
            let tcp = probeTCP ? try await TCPReachabilityProbe().check(target) : nil
            let message =
                tcp == true
                ? "El puerto TCP es accesible. Esto no identifica la VPN ni confirma autenticación SSH."
                : (tcp == false
                    ? "El puerto no responde. Puede ser red, firewall o servicio; no demuestra que la VPN esté desconectada."
                    : "Rutas observadas; TCP no comprobado.")
            return .init(
                target: target, addresses: addresses, routes: routes, tcpReachable: tcp,
                diagnostic: message, confidence: tcp == true ? .confirmed : .unknown)
        } catch {
            return .init(
                target: target, addresses: [], routes: [], tcpReachable: nil,
                diagnostic: error.localizedDescription
                    + " No se atribuye automáticamente a la VPN.", confidence: .unknown)
        }
    }
}

public struct SystemVPNService: Sendable, Identifiable {
    public var id: String
    public var name: String
    public var state: VPNState
    public var confidence: EvidenceConfidence = .confirmed
}

public struct VPNNetworkEvidence: Sendable {
    public var serviceID: String
    public var name: String
    public var interface: String
    public init(serviceID: String, name: String, interface: String) {
        self.serviceID = serviceID
        self.name = name
        self.interface = interface
    }
}

public actor SystemVPNDetector {
    public init() {}
    public func services() -> [SystemVPNService] {
        let prefs = SCPreferencesCreate(nil, "ORI read-only VPN observation" as CFString, nil)
        let services = prefs.flatMap { SCNetworkServiceCopyAll($0) as? [SCNetworkService] } ?? []
        var result: [SystemVPNService] = services.compactMap { service in
            guard let interface = SCNetworkServiceGetInterface(service),
                let type = SCNetworkInterfaceGetInterfaceType(interface) as String?,
                ["VPN", "PPP", "IPSec"].contains(type)
            else { return nil }
            guard let id = SCNetworkServiceGetServiceID(service) as String? else { return nil }
            let name = (SCNetworkServiceGetName(service) as String?) ?? id
            var state: VPNState = .unknown
            if let connection = SCNetworkConnectionCreateWithServiceID(
                nil, id as CFString, nil, nil)
            {
                switch SCNetworkConnectionGetStatus(connection) {
                case .connected: state = .connected
                case .connecting: state = .connecting
                case .disconnected: state = .disconnected
                case .disconnecting: state = .unknown
                default: break
                }
            }
            return .init(id: id, name: name, state: state)
        }
        for item in dynamicEvidence() where !result.contains(where: { $0.id == item.serviceID }) {
            result.append(
                .init(id: item.serviceID, name: item.name, state: .connected, confidence: .inferred)
            )
        }
        return result
    }
    public func dynamicEvidence() -> [VPNNetworkEvidence] {
        guard
            let store = SCDynamicStoreCreate(
                nil, "ORI runtime VPN observation" as CFString, nil, nil),
            let keys = SCDynamicStoreCopyKeyList(
                store, "State:/Network/Service/.*/IPv[46]" as CFString) as? [String]
        else { return [] }
        var result: [VPNNetworkEvidence] = []
        for key in keys {
            let parts = key.split(separator: "/")
            guard parts.count == 5,
                let runtime = SCDynamicStoreCopyValue(store, key as CFString) as? [String: Any],
                let interface = runtime["InterfaceName"] as? String,
                interface.hasPrefix("utun") || interface.hasPrefix("ppp")
                    || interface.hasPrefix("ipsec")
            else { continue }
            let id = String(parts[3])
            let setup =
                SCDynamicStoreCopyValue(store, "Setup:/Network/Service/\(id)" as CFString)
                as? [String: Any]
            let state =
                SCDynamicStoreCopyValue(store, "State:/Network/Service/\(id)/VPN" as CFString)
                as? [String: Any]
            let name =
                (setup?["UserDefinedName"] as? String) ?? (runtime["UserDefinedName"] as? String)
                ?? (state?["UserDefinedName"] as? String) ?? id
            if !result.contains(where: { $0.serviceID == id }) {
                result.append(.init(serviceID: id, name: name, interface: interface))
            }
        }
        return result
    }
}

public enum PortConflictDetector {
    /// A successful bind is only a preflight; OpenSSH's bind result remains authoritative.
    public static func isAvailable(address: String, port: Int) throws -> Bool {
        try Validation.bindAddress(address)
        try Validation.port(port)
        let family = address.contains(":") ? AF_INET6 : AF_INET
        let fd = socket(family, SOCK_STREAM, IPPROTO_TCP)
        guard fd >= 0 else { throw ORIError.unavailable("No se pudo comprobar el puerto local.") }
        defer { close(fd) }
        if family == AF_INET {
            var addr = sockaddr_in()
            addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
            addr.sin_family = sa_family_t(AF_INET)
            addr.sin_port = UInt16(port).bigEndian
            inet_pton(AF_INET, address, &addr.sin_addr)
            let status = withUnsafePointer(to: &addr) { ptr in
                ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
                }
            }
            return try bindResult(status, error: errno)
        }
        var addr = sockaddr_in6()
        addr.sin6_len = UInt8(MemoryLayout<sockaddr_in6>.size)
        addr.sin6_family = sa_family_t(AF_INET6)
        addr.sin6_port = UInt16(port).bigEndian
        inet_pton(AF_INET6, address, &addr.sin6_addr)
        let status = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in6>.size))
            }
        }
        return try bindResult(status, error: errno)
    }
    private static func bindResult(_ status: Int32, error: Int32) throws -> Bool {
        if status == 0 { return true }
        if error == EADDRINUSE { return false }
        if error == EACCES {
            throw ORIError.unavailable("No hay permiso para escuchar en ese puerto local.")
        }
        if error == EADDRNOTAVAIL {
            throw ORIError.invalid(
                "La dirección de escucha no pertenece a una interfaz local disponible.")
        }
        throw ORIError.unavailable(
            "No se pudo comprobar la escucha local: \(String(cString: strerror(error)))")
    }
}
