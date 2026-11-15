import CryptoKit
import Foundation

public enum AccessBastionsImporter {
    public static func preview(directory: URL) throws -> ImportPreview {
        try inventory(directory: directory).0
    }

    public static func passwords(directory: URL) throws -> [ImportedSSHPassword] {
        try inventory(directory: directory).1
    }

    private static func inventory(directory: URL) throws -> (ImportPreview, [ImportedSSHPassword]) {
        var digest = SHA256()
        func read(_ name: String, required: Bool = false) throws -> [String: Any] {
            let url = directory.appendingPathComponent(name)
            guard FileManager.default.fileExists(atPath: url.path) else {
                if required { throw ORIError.invalid("La carpeta no contiene \(name).") }
                return [:]
            }
            guard
                (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) <= 32 * 1024 * 1024
            else {
                throw ORIError.invalid("Archivo de importación demasiado grande.")
            }
            let data = try Data(contentsOf: url)
            digest.update(data: Data(name.utf8))
            digest.update(data: data)
            guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                throw ORIError.invalid("Estructura JSON no reconocida en \(name).")
            }
            return object
        }
        let data = try read("datos.json", required: true)
        let equipment = try read("equipos_local.json")
        let overrides = try read("overrides_local.json")
        let repositories = try read("gestor_repos_config.json")
        let extraURL = directory.appendingPathComponent("hosts_extra.json")
        var extras: [[String: Any]] = []
        if FileManager.default.fileExists(atPath: extraURL.path) {
            guard
                (try extraURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) <= 32 * 1024
                    * 1024
            else {
                throw ORIError.invalid("Archivo hosts_extra.json demasiado grande.")
            }
            let bytes = try Data(contentsOf: extraURL)
            extras = try JSONSerialization.jsonObject(with: bytes) as? [[String: Any]] ?? []
            digest.update(data: bytes)
        }
        return try configuration(
            data: data, equipment: equipment, overrides: overrides, repositories: repositories,
            extras: extras,
            fingerprint: digest.finalize().map { String(format: "%02x", $0) }.joined())
    }

    private static func configuration(
        data: [String: Any], equipment: [String: Any], overrides: [String: Any],
        repositories: [String: Any], extras: [[String: Any]], fingerprint: String
    ) throws -> (ImportPreview, [ImportedSSHPassword]) {
        func text(_ row: [String: Any], _ key: String) -> String { row[key] as? String ?? "" }
        func identifier(_ text: String) -> String {
            "accesos-"
                + SHA256.hash(data: Data(text.utf8)).prefix(16).map { String(format: "%02x", $0) }
                .joined()
        }
        func dictionary(_ row: [String: Any], _ key: String) -> [String: Any] {
            row[key] as? [String: Any] ?? [:]
        }
        let bastions = dictionary(data, "bastiones")
        let services = dictionary(data, "servicios")
        let plants = dictionary(services, "plantas")
        var bridges = dictionary(bastions, "jumps")
        for (key, value) in plants where bridges[key] == nil {
            bridges[key] = (value as? [String: Any])?["salto"]
        }
        for (key, value) in dictionary(equipment, "puentes") where bridges[key] == nil {
            bridges[key] = value
        }
        var config = Configuration()
        var passwords: [ImportedSSHPassword] = []
        var warnings = [
            "Las contraseñas se guardan por separado en el Llavero de macOS. No se incluyen en SQLite ni en las exportaciones."
        ]
        var groupIDs: [String: String] = [:]
        func group(_ path: String) -> String {
            if let id = groupIDs[path] { return id }
            var parent: String?
            var partial = ""
            for name in path.split(separator: "/").map(String.init) {
                partial += "/" + name
                let id = identifier("carpeta" + partial)
                if !config.groups.contains(where: { $0.id == id }) {
                    var value = HostGroup()
                    value.id = id
                    value.name = name
                    value.parentID = parent
                    value.order = config.groups.count
                    value.color = "green"
                    config.groups.append(value)
                }
                parent = id
            }
            groupIDs[path] = parent
            return parent!
        }
        func hops(_ name: String, visited: Set<String> = []) throws -> [JumpHop] {
            guard !name.isEmpty && name != "directo" else { return [] }
            guard !visited.contains(name), let bridge = bridges[name] as? [String: Any] else {
                throw ORIError.invalid(
                    "Un salto del inventario no está definido o contiene un ciclo. Revisa los datos originales."
                )
            }
            var seen = visited
            seen.insert(name)
            var result = try hops(text(bridge, "jump"), visited: seen)
            var hop = JumpHop()
            hop.id = identifier("salto-" + name)
            hop.hostID = identifier("puente-" + name)
            result.append(hop)
            return result
        }
        func append(
            _ row: [String: Any], key: String, folder: String, jump: String, isJump: Bool = false
        ) throws {
            var host = HostProfile()
            host.id = identifier(key)
            host.name = text(row, "name")
            host.address = text(row, "ip").trimmingCharacters(in: .whitespacesAndNewlines)
            if host.name.isEmpty { host.name = host.address }
            host.username = text(row, "user")
            if let value = row["port"], !(value is NSNull) {
                guard let port = Int(String(describing: value)) else {
                    throw ORIError.invalid("Puerto del inventario no válido.")
                }
                host.port = port
            }
            host.authentication = .interactive
            host.usableAsJump = isJump
            host.isJumpProfile = key.hasPrefix("puente-") ? true : nil
            host.groupID = group(folder)
            host.color = "green"
            host.notes = text(row, "nota")
            let alternate = text(row, "ip_alt")
            if !alternate.isEmpty { host.notes += "\nDirección alternativa: " + alternate }
            var connection = ConnectionProfile(hostID: host.id)
            connection.id = host.id + "-ssh"
            connection.useSSHConfig = false
            connection.route.hops = try hops(jump)
            config.hosts.append(host)
            config.connections.append(connection)
            let password = text(row, "password")
            if !password.isEmpty {
                passwords.append(ImportedSSHPassword(host: host, password: password))
            }
        }
        for name in bridges.keys.sorted() {
            guard var row = bridges[name] as? [String: Any] else { continue }
            row["name"] = name
            try append(
                row, key: "puente-" + name, folder: "Accesos/Pasarelas", jump: text(row, "jump"),
                isJump: true)
        }
        for (name, value) in dictionary(bastions, "groups").sorted(by: { $0.key < $1.key }) {
            for original in value as? [[String: Any]] ?? [] {
                var row = original
                let key = "bastion|\(name)|\(text(row, "name"))"
                let override = overrides[key] as? [String: Any] ?? [:]
                row.merge(override) { _, new in new }
                let dc = text(override, "dc").isEmpty ? name : text(override, "dc")
                try append(
                    row, key: key, folder: "Accesos/\(dc)/Bastiones", jump: text(row, "jump"),
                    isJump: true)
            }
        }
        for (name, value) in dictionary(services, "grupos").sorted(by: { $0.key < $1.key }) {
            guard let block = value as? [String: Any] else { continue }
            let plantName = text(block, "planta")
            let plant = plants[plantName] as? [String: Any] ?? [:]
            for original in block["nodos"] as? [[String: Any]] ?? [] {
                var row = original
                if text(row, "user").isEmpty { row["user"] = text(plant, "user") }
                if row["password"] == nil { row["password"] = plant["password"] }
                let key = "servicio|\(name)|\(text(row, "name"))"
                row.merge(overrides[key] as? [String: Any] ?? [:]) { _, new in new }
                let jump = row["jump"] == nil ? plantName : text(row, "jump")
                try append(row, key: key, folder: "Accesos/Servicios/\(name)", jump: jump)
            }
        }
        for category in ["stf", "execution"] {
            for (index, row) in (equipment[category] as? [[String: Any]] ?? []).enumerated() {
                try append(
                    row, key: "\(category)|\(index)|\(text(row, "name"))",
                    folder: "Accesos/\(category.uppercased())", jump: text(row, "puente"))
            }
        }
        for (index, row) in extras.enumerated() {
            try append(
                row, key: "manual|\(index)|\(text(row, "name"))", folder: "Accesos/Manuales",
                jump: text(row, "jump"))
        }
        var roots: [RepositoryRoot] = []
        for row in repositories["roots"] as? [[String: Any]] ?? [] {
            let path = text(row, "path")
            guard !path.isEmpty else { continue }
            var root = RepositoryRoot(name: text(row, "name"), path: path)
            if root.name.isEmpty { root.name = "Espacio importado" }
            root.id = identifier("repos-" + path)
            root.maxDepth = min(8, max(1, repositories["max_depth"] as? Int ?? 3))
            roots.append(root)
        }
        config.repositoryRoots = roots
        if roots.contains(where: { !$0.path.hasPrefix("/") }) {
            warnings.append(
                "Los espacios Git usan rutas Windows. En Repositorios pulsa Reubicar y elige sus carpetas macOS."
            )
        }
        ConnectionCatalogMigration.apply(to: &config)
        try Validation.configuration(config)
        return (
            ImportPreview(configuration: config, warnings: warnings, fingerprint: fingerprint),
            passwords
        )
    }
}

// Deliberately neither Codable nor part of Configuration/ImportPreview.
public struct ImportedSSHPassword: Sendable {
    public let host: HostProfile
    public let password: String
    public init(host: HostProfile, password: String) {
        self.host = host
        self.password = password
    }
}
