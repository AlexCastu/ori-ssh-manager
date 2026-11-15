import Darwin
import Foundation

public enum Validation {
    public static func text(_ value: String, field: String, allowEmpty: Bool = false) throws {
        guard allowEmpty || !value.isEmpty, value.utf8.count <= 8192,
            !value.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) })
        else {
            throw ORIError.invalid(
                "\(field): valor vacío, demasiado largo o con caracteres de control.")
        }
    }
    public static func address(_ value: String) throws {
        try text(value, field: "Host")
        // OpenSSH can substitute addresses into a ProxyCommand shell. Reject shell syntax
        // even though our own process API never invokes a shell.
        let allowed = CharacterSet(
            charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-:")
        guard !value.hasPrefix("-"), value.unicodeScalars.allSatisfy(allowed.contains),
            value.count <= 253
        else {
            throw ORIError.invalid(
                "Host no válido. Usa un nombre, alias SSH o una dirección IP sin opciones.")
        }
        if value.contains(":") {
            var ip = in6_addr()
            guard inet_pton(AF_INET6, value, &ip) == 1 else {
                throw ORIError.invalid("IPv6 no válida.")
            }
        }
    }
    public static func port(_ port: Int) throws {
        guard (1...65535).contains(port) else {
            throw ORIError.invalid("El puerto debe estar entre 1 y 65535.")
        }
    }
    public static func username(_ value: String) throws {
        try text(value, field: "Usuario", allowEmpty: true)
        let allowed = CharacterSet(
            charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-\\")
        guard !value.hasPrefix("-"), value.unicodeScalars.allSatisfy(allowed.contains) else {
            throw ORIError.invalid(
                "Usuario no válido: no se permiten opciones, espacios ni metacaracteres.")
        }
    }
    public static func identity(_ value: String) throws {
        try text(value, field: "Ruta de identidad", allowEmpty: true)
        guard !value.contains("%"), !value.contains("\""), !value.contains("\\") else {
            throw ORIError.invalid(
                "La ruta de identidad no admite tokens, comillas ni barras inversas.")
        }
    }
    public static func host(_ h: HostProfile) throws {
        try text(h.name, field: "Nombre")
        try address(h.address)
        try username(h.username)
        if let p = h.port { try port(p) }
        try identity(h.identityPath)
        if h.authentication == .key && h.identityPath.isEmpty {
            throw ORIError.invalid("Selecciona la clave privada.")
        }
    }
    public static func bindAddress(_ value: String) throws {
        var v4 = in_addr()
        var v6 = in6_addr()
        guard inet_pton(AF_INET, value, &v4) == 1 || inet_pton(AF_INET6, value, &v6) == 1 else {
            throw ORIError.invalid("La dirección de escucha debe ser una IP explícita.")
        }
    }
    public static func tunnel(_ t: TunnelProfile) throws {
        try text(t.name, field: "Nombre")
        try bindAddress(t.bindAddress)
        try port(t.listenPort)
        if t.kind != .dynamic {
            try address(t.destinationHost)
            try port(t.destinationPort)
        }
        if let target = t.healthTarget {
            try address(target.host)
            try port(target.port)
        }
        try reconnection(t.reconnect)
    }
    public static func reconnection(_ r: ReconnectionPolicy) throws {
        guard (1...20).contains(r.maxAttempts), r.baseDelay.isFinite, r.maxDelay.isFinite,
            r.baseDelay >= 1, r.maxDelay >= r.baseDelay, r.maxDelay <= 3600
        else {
            throw ORIError.invalid("Política de reconexión no válida.")
        }
    }
    public static func resolvedHops(_ c: ConnectionProfile, configuration: Configuration) throws
        -> [HostProfile]
    {
        guard let target = configuration.host(c.hostID) else {
            throw ORIError.invalid("El perfil SSH no existe.")
        }
        var visited = Set([target.address.lowercased() + ":" + String(target.port ?? 22)])
        var aliases = Set([target.address.lowercased()])
        var result: [HostProfile] = []
        for hop in c.route.hops {
            var h: HostProfile
            if let ref = hop.hostID {
                guard ref != c.hostID, let found = configuration.host(ref) else {
                    throw ORIError.invalid("La máquina de salto ya no existe o apunta a sí misma.")
                }
                h = found
            } else {
                h = HostProfile()
                h.name = hop.name.isEmpty ? hop.address : hop.name
                h.address = hop.address
                h.port = hop.port
                h.username = hop.username
                h.identityPath = hop.identityPath
                h.authentication = hop.authentication
            }
            try host(h)
            let key = h.address.lowercased() + ":" + String(h.port ?? 22)
            guard visited.insert(key).inserted else {
                throw ORIError.invalid("La ruta contiene saltos circulares o repetidos.")
            }
            guard aliases.insert(h.address.lowercased()).inserted else {
                throw ORIError.invalid(
                    "Usa alias SSH distintos para saltos y destino que comparten dirección; así cada identidad y puerto conserva su configuración."
                )
            }
            result.append(h)
        }
        guard result.count <= 16 else { throw ORIError.invalid("La ruta admite hasta 16 saltos.") }
        return result
    }
    public static func configuration(_ c: Configuration) throws {
        guard c.formatVersion == 1 else {
            throw ORIError.invalid("Versión de configuración no compatible.")
        }
        func unique<T: Identifiable>(_ items: [T]) throws where T.ID == String {
            guard Set(items.map(\.id)).count == items.count,
                items.allSatisfy({ !$0.id.isEmpty && $0.id.utf8.count < 256 })
            else {
                throw ORIError.invalid("Identificadores vacíos o duplicados.")
            }
        }
        try unique(c.hosts)
        try unique(c.connections)
        try unique(c.tunnels)
        try unique(c.vpns)
        try unique(c.groups)
        try unique(c.commands)
        try unique(c.workspaces)
        try unique(c.repositoryRoots ?? [])
        for root in c.repositoryRoots ?? [] {
            try text(root.name, field: "Espacio Git")
            try text(root.path, field: "Carpeta Git")
            guard (1...8).contains(root.maxDepth) else {
                throw ORIError.invalid("La profundidad Git debe estar entre 1 y 8.")
            }
        }
        if let organization = c.organization {
            guard Set(organization.hostOrder).count == organization.hostOrder.count,
                organization.positions.count <= 20_000,
                organization.positions.values.allSatisfy({
                    $0.x.isFinite && $0.y.isFinite && (0...10_000).contains($0.x)
                        && (0...10_000).contains($0.y)
                })
            else { throw ORIError.invalid("Organización del diagrama no válida.") }
        }
        let hosts = Set(c.hosts.map(\.id))
        let groups = Set(c.groups.map(\.id))
        let connections = Set(c.connections.map(\.id))
        let vpns = Set(c.vpns.map(\.id))
        func vpn(_ req: VPNRequirement?) throws {
            if let req, !vpns.contains(req.profileID) {
                throw ORIError.invalid("Falta el perfil VPN asociado.")
            }
        }
        for h in c.hosts {
            try host(h)
            if let g = h.groupID, !groups.contains(g) {
                throw ORIError.invalid("La carpeta del servidor no existe.")
            }
        }
        guard Set(c.connections.map(\.hostID)).count == c.connections.count else {
            throw ORIError.invalid("Solo se admite un perfil de conexión por servidor.")
        }
        for connection in c.connections {
            if let path = connection.knownHostsPath {
                try identity(path)
                guard !path.isEmpty else {
                    throw ORIError.invalid("La ruta known_hosts no puede estar vacía.")
                }
            }
            guard hosts.contains(connection.hostID), (1...120).contains(connection.timeout),
                (1...3600).contains(connection.keepalive),
                (1...10).contains(connection.keepaliveCount)
            else {
                throw ORIError.invalid("Parámetros del perfil SSH no válidos.")
            }
            _ = try resolvedHops(connection, configuration: c)
            try vpn(connection.vpn)
            try reconnection(connection.reconnect)
        }
        for t in c.tunnels {
            try tunnel(t)
            try vpn(t.vpn)
            guard connections.contains(t.connectionID) else {
                throw ORIError.invalid("Falta el perfil SSH del túnel.")
            }
        }
        for g in c.groups {
            try text(g.name, field: "Carpeta")
            var seen = Set([g.id])
            var current = g.parentID
            while let id = current {
                guard seen.insert(id).inserted, let parent = c.groups.first(where: { $0.id == id })
                else {
                    throw ORIError.invalid("Carpetas circulares o referencia inválida.")
                }
                current = parent.parentID
            }
        }
        for command in c.commands {
            try text(command.name, field: "Comando")
            guard !command.command.isEmpty, !command.command.contains("\0") else {
                throw ORIError.invalid("Comando vacío o no válido.")
            }
            if let id = command.hostID, !hosts.contains(id) {
                throw ORIError.invalid("Falta el servidor del comando.")
            }
        }
        for p in c.vpns {
            try text(p.name, field: "VPN")
            try text(p.systemServiceID, field: "Servicio VPN", allowEmpty: true)
            guard p.targets.count <= 8 else {
                throw ORIError.invalid("Cada perfil VPN admite hasta ocho objetivos autorizados.")
            }
            for t in p.targets {
                try address(t.host)
                try port(t.port)
            }
        }
        for w in c.workspaces {
            try text(w.name, field: "Workspace")
            try vpn(w.vpn)
            guard Set(w.hostIDs).isSubset(of: hosts),
                Set(w.tunnelIDs).isSubset(of: Set(c.tunnels.map(\.id)))
            else {
                throw ORIError.invalid("El workspace tiene referencias no válidas.")
            }
        }
        guard c.settings.fontSize.isFinite, (10...28).contains(c.settings.fontSize),
            (1000...50000).contains(c.settings.scrollback)
        else { throw ORIError.invalid("Preferencias de terminal no válidas.") }
    }
}
