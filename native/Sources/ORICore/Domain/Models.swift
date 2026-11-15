import Foundation

public enum ORIError: Error, LocalizedError, Sendable, Equatable {
    case invalid(String)
    case unavailable(String)
    case process(String)
    public var errorDescription: String? {
        switch self {
        case .invalid(let s), .unavailable(let s), .process(let s): s
        }
    }
}

public enum Authentication: String, Codable, CaseIterable, Sendable {
    case configuration, agent, key, interactive
}

public struct HostProfile: Codable, Identifiable, Sendable, Equatable {
    public var id = UUID().uuidString
    public var name = ""
    public var address = ""
    public var port: Int? = nil
    public var username = ""
    public var identityPath = ""
    public var authentication: Authentication = .configuration
    public var groupID: String? = nil
    public var tags: [String] = []
    public var favorite = false
    public var usableAsJump = false
    public var isJumpProfile: Bool? = nil
    public var color = "purple"
    public var icon = "server.rack"
    public var notes = ""
    public var createdAt = Date()
    public var updatedAt = Date()
    public init() {}
}

public struct JumpHop: Codable, Identifiable, Sendable, Equatable {
    public var id = UUID().uuidString
    public var hostID: String? = nil
    public var address = ""
    public var port: Int? = nil
    public var username = ""
    public var identityPath = ""
    public var authentication: Authentication = .configuration
    public var name = ""
    public init() {}
}

public struct JumpRoute: Codable, Identifiable, Sendable, Equatable {
    public var id = UUID().uuidString
    public var hops: [JumpHop] = []
    public init(hops: [JumpHop] = []) { self.hops = hops }
}

public struct ReconnectionPolicy: Codable, Sendable, Equatable {
    public var enabled = false
    public var maxAttempts = 5
    public var baseDelay: Double = 2
    public var maxDelay: Double = 60
    public init() {}
    public func delay(attempt: Int, jitter: Double = Double.random(in: 0.8...1.2)) -> Double? {
        guard enabled, attempt > 0, attempt <= maxAttempts else { return nil }
        return min(maxDelay, baseDelay * pow(2, Double(min(attempt - 1, 20))))
            * min(1.2, max(0.8, jitter))
    }
}

public enum UnknownVPNPolicy: String, Codable, CaseIterable, Sendable {
    case warn, requireVerification
}
public struct VPNRequirement: Codable, Identifiable, Sendable, Equatable {
    public var id = UUID().uuidString
    public var profileID: String
    public var mandatory = true
    public var unknownPolicy: UnknownVPNPolicy = .warn
    public init(profileID: String) { self.profileID = profileID }
}

public struct ConnectionProfile: Codable, Identifiable, Sendable, Equatable {
    public var id = UUID().uuidString
    public var hostID: String
    public var route = JumpRoute()
    public var timeout = 15
    public var keepalive = 15
    public var keepaliveCount = 4
    public var reconnect = ReconnectionPolicy()
    public var vpn: VPNRequirement? = nil
    // Trust only local, explicitly selected OpenSSH configuration. Import never enables it.
    public var useSSHConfig = true
    public var legacyAlgorithms = false
    public var knownHostsPath: String? = nil
    public init(hostID: String) { self.hostID = hostID }
}

public enum TunnelKind: String, Codable, CaseIterable, Sendable { case local, remote, dynamic }
public struct ConnectivityTarget: Codable, Sendable, Equatable {
    public var host: String
    public var port: Int
    public init(host: String, port: Int) {
        self.host = host
        self.port = port
    }
}
public struct TunnelProfile: Codable, Identifiable, Sendable, Equatable {
    public var id = UUID().uuidString
    public var name = ""
    public var kind: TunnelKind = .local
    public var connectionID = ""
    public var bindAddress = "127.0.0.1"
    public var listenPort = 8080
    public var destinationHost = "127.0.0.1"
    public var destinationPort = 80
    public var autoStart = false
    public var reconnect = ReconnectionPolicy()
    public var vpn: VPNRequirement? = nil
    public var healthTarget: ConnectivityTarget? = nil
    public init() {}
}
public enum VPNProvider: String, Codable, CaseIterable, Sendable { case ivanti, system, other }
public enum VPNState: String, Codable, CaseIterable, Sendable {
    case disconnected, connecting, connected, degraded, reconnecting, unknown
}
public enum EvidenceConfidence: String, Codable, Sendable { case confirmed, inferred, unknown }
public struct VPNProfile: Codable, Identifiable, Sendable, Equatable {
    public var id = UUID().uuidString
    public var name = ""
    public var provider: VPNProvider = .ivanti
    public var systemServiceID = ""
    public var gateway = ""
    public var expectedInterface = ""
    public var targets: [ConnectivityTarget] = []
    public var notes = ""
    public init() {}
}
public struct RouteObservation: Codable, Sendable, Equatable {
    public var address: String
    public var interface: String?
    public var gateway: String?
    public var available: Bool
    public init(address: String, interface: String?, gateway: String?, available: Bool) {
        self.address = address
        self.interface = interface
        self.gateway = gateway
        self.available = available
    }
}
public struct NetworkReachabilityResult: Codable, Sendable, Equatable {
    public var target: ConnectivityTarget
    public var addresses: [String]
    public var routes: [RouteObservation]
    public var tcpReachable: Bool?
    public var diagnostic: String
    public var checkedAt = Date()
    public var confidence: EvidenceConfidence
    public init(
        target: ConnectivityTarget, addresses: [String], routes: [RouteObservation],
        tcpReachable: Bool?, diagnostic: String, confidence: EvidenceConfidence
    ) {
        self.target = target
        self.addresses = addresses
        self.routes = routes
        self.tcpReachable = tcpReachable
        self.diagnostic = diagnostic
        self.confidence = confidence
    }
}
public enum SessionState: String, Codable, Sendable {
    case disconnected, connecting, authenticating, connected, reconnecting, disconnecting, failed
}
public enum TunnelState: String, Codable, Sendable {
    case stopped, starting, active, reconnecting, stopping, failed
}
public enum DiagnosticKind: String, Codable, Sendable {
    case ssh, authentication, hostKey, jump, dns, route, vpn, port, tunnel, disconnected, timeout,
        service
}
public struct ConnectionDiagnostic: Codable, Identifiable, Sendable, Equatable {
    public var id = UUID().uuidString
    public var kind: DiagnosticKind
    public var message: String
    public var createdAt = Date()
    public var retryable: Bool { [.dns, .route, .disconnected, .timeout, .service].contains(kind) }
    public init(kind: DiagnosticKind, message: String) {
        self.kind = kind
        self.message = message
    }
    public static func classify(_ text: String) -> Self {
        let s = text.lowercased()
        if s.contains("can't open user config file") || s.contains("bad configuration option")
            || s.contains("bad owner or permissions")
        {
            return .init(
                kind: .ssh,
                message:
                    "OpenSSH no puede leer su configuración local. Revisa la ruta y los permisos del archivo."
            )
        }
        if s.contains("host key verification failed")
            || s.contains("remote host identification has changed")
        {
            return .init(
                kind: .hostKey,
                message:
                    "No se pudo verificar la clave del servidor. Revísala fuera de la aplicación.")
        }
        if s.contains("permission denied") || s.contains("authentication failed") {
            return .init(
                kind: .authentication,
                message: "Autenticación rechazada. Revisa usuario, clave y agente.")
        }
        if s.contains("address already in use") || s.contains("cannot listen")
            || s.contains("forwarding failed")
        {
            return .init(
                kind: .port,
                message:
                    "No se pudo establecer el reenvío. Revisa el puerto y los permisos del servidor."
            )
        }
        if s.contains("resolve hostname") {
            return .init(kind: .dns, message: "No se puede resolver el nombre SSH.")
        }
        if s.contains("timed out") || s.contains("timeout") {
            return .init(kind: .timeout, message: "Tiempo de conexión agotado.")
        }
        if s.contains("no route") || s.contains("network is unreachable") {
            return .init(kind: .route, message: "No hay ruta hacia el destino.")
        }
        if s.contains("connection refused") || s.contains("connection reset")
            || s.contains("broken pipe")
        {
            return .init(
                kind: .disconnected,
                message: "El transporte SSH no está disponible o se ha interrumpido.")
        }
        if s.contains("stdio forwarding failed") {
            return .init(kind: .jump, message: "El bastión no puede alcanzar el siguiente salto.")
        }
        return .init(
            kind: .ssh,
            message:
                "OpenSSH finalizó con error. Consulta el diagnóstico local y revisa la configuración."
        )
    }
}
public struct HostGroup: Codable, Identifiable, Sendable, Equatable {
    public var id = UUID().uuidString
    public var name = ""
    public var parentID: String? = nil
    public var order = 0
    public var color = "purple"
    public var icon = "folder"
    public var notes = ""
    public var expanded = true
    public init() {}
}
public struct SavedCommand: Codable, Identifiable, Sendable, Equatable {
    public var id = UUID().uuidString
    public var hostID: String? = nil
    public var name = ""
    public var command = ""
    public var notes = ""
    public init() {}
}
public struct Workspace: Codable, Identifiable, Sendable, Equatable {
    public var id = UUID().uuidString
    public var name = ""
    public var hostIDs: [String] = []
    public var tunnelIDs: [String] = []
    public var vpn: VPNRequirement? = nil
    public init() {}
}
public struct AppSettings: Codable, Sendable, Equatable {
    public var appearance = "dark"
    public var terminalTheme = "dark"
    public var fontSize: Double = 14
    public var cursor = "block"
    public var scrollback = 10000
    public var logCommands = false
    public var selectedWorkspaceID: String? = nil
    public var scriptsFolder: String? = nil
    public var scriptFavorites: [String]? = nil
    public init() {}
}
public struct AuditEvent: Codable, Identifiable, Sendable, Equatable {
    public var id = UUID().uuidString
    public var hostID: String?
    public var createdAt = Date()
    public var kind = "event"
    public var message: String
    public init(hostID: String?, message: String) {
        self.hostID = hostID
        self.message = message
    }
}
public struct Configuration: Codable, Sendable, Equatable {
    public var formatVersion = 1
    public var revision = 0
    public var hosts: [HostProfile] = []
    public var connections: [ConnectionProfile] = []
    public var tunnels: [TunnelProfile] = []
    public var vpns: [VPNProfile] = []
    public var groups: [HostGroup] = []
    public var commands: [SavedCommand] = []
    public var workspaces: [Workspace] = []
    public var organization: ConnectionOrganization? = nil
    public var repositoryRoots: [RepositoryRoot]? = nil
    public var settings = AppSettings()
    public init() {}
    public func connection(for hostID: String) -> ConnectionProfile? {
        connections.first { $0.hostID == hostID }
    }
    public func host(_ id: String) -> HostProfile? { hosts.first { $0.id == id } }
    public var jumpHosts: [HostProfile] { hosts.filter { $0.isJumpProfile == true } }
}

public struct TerminalSession: Identifiable, Sendable, Equatable {
    public var id = UUID().uuidString
    public var connectionID: String
    public var hostID: String
    public var state: SessionState = .disconnected
    public var createdAt = Date()
    public var connectedAt: Date? = nil
    public var endedAt: Date? = nil
    public var diagnostic: ConnectionDiagnostic? = nil
    public var exitCode: Int32? = nil
    public init(connectionID: String, hostID: String) {
        self.connectionID = connectionID
        self.hostID = hostID
    }
}
