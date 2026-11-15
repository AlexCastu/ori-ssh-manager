import CryptoKit
import Foundation
import GRDB

public struct ImportPreview: Sendable {
    public var configuration: Configuration
    public var events: [AuditEvent] = []
    public var warnings: [String] = []
    public var fingerprint: String? = nil
    public init(
        configuration: Configuration, events: [AuditEvent] = [], warnings: [String] = [],
        fingerprint: String? = nil
    ) {
        self.configuration = configuration
        self.events = events
        self.warnings = warnings
        self.fingerprint = fingerprint
    }
}

public actor ConfigurationImportService {
    public init() {}
    public func preview(url: URL) throws -> ImportPreview {
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size <= 32 * 1024 * 1024 else {
            throw ORIError.invalid("El archivo supera el límite de 32 MB.")
        }
        if ["db", "sqlite", "sqlite3"].contains(url.pathExtension.lowercased()) {
            return try legacyDatabase(url)
        }
        let data = try Data(contentsOf: url)
        if url.pathExtension.lowercased() == "csv" {
            guard let text = String(data: data, encoding: .utf8) else {
                throw ORIError.invalid("El CSV debe estar en UTF-8.")
            }
            var preview = try legacyRows(CSVParser.records(text))
            preview.fingerprint = SHA256.hash(data: data).map { String(format: "%02x", $0) }
                .joined()
            return preview
        }
        let object = try JSONSerialization.jsonObject(with: data)
        if let dict = object as? [String: Any], dict["formatVersion"] != nil {
            var configuration = try JSONDecoder().decode(Configuration.self, from: data)
            for i in configuration.connections.indices {
                configuration.connections[i].useSSHConfig = false
                configuration.connections[i].knownHostsPath = nil
                configuration.connections[i].legacyAlgorithms = false
            }
            for i in configuration.tunnels.indices { configuration.tunnels[i].autoStart = false }
            configuration.settings.logCommands = false
            try Validation.configuration(configuration)
            var preview = ImportPreview(configuration: configuration)
            preview.warnings.append(
                "Se desactivan el inicio automático de túneles, la confianza en configuración SSH externa, known_hosts alternativos y algoritmos legacy. Revísalos y actívalos expresamente en sus editores."
            )
            preview.fingerprint = SHA256.hash(data: data).map { String(format: "%02x", $0) }
                .joined()
            return preview
        }
        let rows: [[String: Any]]
        if let array = object as? [[String: Any]] {
            rows = array
        } else if let dict = object as? [String: Any],
            let array = dict["sessions"] as? [[String: Any]]
        {
            rows = array
        } else {
            throw ORIError.invalid(
                "JSON no reconocido: se esperaba una exportación ORI o una lista de sesiones.")
        }
        var preview = try legacyRows(rows)
        preview.fingerprint = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        return preview
    }
    public func merge(_ preview: ImportPreview, into store: ConfigurationStore) async throws
        -> Configuration
    {
        // Validate and merge all records in one transaction; collisions never silently overwrite.
        let current = try await store.load()
        var merged = current
        func combine<T: Identifiable & Equatable>(_ a: [T], _ b: [T]) throws -> [T]
        where T.ID == String {
            var result = a
            for item in b {
                if let old = a.first(where: { $0.id == item.id }) {
                    guard old == item else {
                        throw ORIError.invalid(
                            "Hay un identificador existente con datos diferentes. No se sobrescribe."
                        )
                    }
                } else {
                    result.append(item)
                }
            }
            return result
        }
        merged.hosts = try combine(current.hosts, preview.configuration.hosts)
        merged.connections = try combine(current.connections, preview.configuration.connections)
        merged.groups = try combine(current.groups, preview.configuration.groups)
        merged.commands = try combine(current.commands, preview.configuration.commands)
        merged.tunnels = try combine(current.tunnels, preview.configuration.tunnels)
        merged.vpns = try combine(current.vpns, preview.configuration.vpns)
        merged.workspaces = try combine(current.workspaces, preview.configuration.workspaces)
        merged.repositoryRoots = try combine(
            current.repositoryRoots ?? [], preview.configuration.repositoryRoots ?? [])
        return try await store.importConfiguration(
            merged, events: preview.events, fingerprint: preview.fingerprint)
    }
    private func legacyRows(_ input: [[String: Any]]) throws -> ImportPreview {
        var config = Configuration()
        var warnings: [String] = []
        var secrets = false
        let aliases = [
            "ip": "host", "server": "host", "nombre": "name", "session": "name",
            "user": "username", "usuario": "username", "puerto": "port", "group": "groupname",
            "auth": "authmethod", "pass": "password",
        ]
        func normalized(_ row: [String: Any]) -> [String: Any] {
            var result: [String: Any] = [:]
            for (key, value) in row {
                let key = key.lowercased().replacingOccurrences(of: "_", with: "")
                result[aliases[key] ?? key] = value
            }
            return result
        }
        func string(_ row: [String: Any], _ key: String) -> String { (row[key] as? String) ?? "" }
        func port(_ value: Any?) throws -> Int? {
            guard let value, !(value is NSNull), String(describing: value) != "" else { return nil }
            guard let port = Int(String(describing: value)) else {
                throw ORIError.invalid("El puerto importado no es numérico.")
            }
            try Validation.port(port)
            return port
        }
        func auth(_ value: String) -> Authentication {
            switch value {
            case "password": .interactive
            case "key": .key
            case "agent": .agent
            default: .configuration
            }
        }
        for (index, raw) in input.enumerated() {
            let row = normalized(raw)
            var host = HostProfile()
            if !string(row, "id").isEmpty { host.id = string(row, "id") }
            host.address = string(row, "host").trimmingCharacters(in: .whitespacesAndNewlines)
            host.name = string(row, "name").trimmingCharacters(in: .whitespacesAndNewlines)
            if host.name.isEmpty { host.name = host.address }
            host.username = string(row, "username").trimmingCharacters(in: .whitespacesAndNewlines)
            host.port = try port(row["port"])
            host.authentication = auth(string(row, "authmethod"))
            host.identityPath = string(row, "privatekeypath")
            host.notes = string(row, "notes")
            host.color = string(row, "color")
            host.icon = string(row, "icon").isEmpty ? "server.rack" : string(row, "icon")
            host.usableAsJump =
                (row["usableasjump"] as? Bool)
                ?? ["true", "1"].contains(string(row, "usableasjump").lowercased())
            if let number = row["usableasjump"] as? NSNumber {
                host.usableAsJump = number.boolValue
            }
            if let date = LegacyDateParser.parse(string(row, "createdat")) {
                host.createdAt = date
                host.updatedAt = date
            }
            let groupPath = string(row, "groupname").split(separator: "/").map(String.init)
            var parent: String?
            for name in groupPath {
                if let group = config.groups.first(where: {
                    $0.name == name && $0.parentID == parent
                }) {
                    parent = group.id
                } else {
                    var group = HostGroup()
                    group.name = name
                    group.parentID = parent
                    group.order = config.groups.count
                    config.groups.append(group)
                    parent = group.id
                }
            }
            host.groupID = parent
            var connection = ConnectionProfile(hostID: host.id)
            connection.id = host.id + "-ssh"
            connection.useSSHConfig = false
            var hops = row["jumphops"] as? [[String: Any]] ?? []
            if let json = row["jumphops"] as? String, !json.isEmpty {
                guard let bytes = json.data(using: .utf8),
                    let decoded = try JSONSerialization.jsonObject(with: bytes) as? [[String: Any]]
                else {
                    throw ORIError.invalid("Fila \(index + 1): jumpHops no válido.")
                }
                hops = decoded
            }
            if hops.isEmpty, !string(row, "jumphost").isEmpty {
                hops = [
                    [
                        "host": string(row, "jumphost"), "port": row["jumpport"] ?? 22,
                        "username": string(row, "jumpusername"),
                        "password": string(row, "jumppassword"),
                    ]
                ]
            }
            for rawHop in hops {
                let hopRow = normalized(rawHop)
                var hop = JumpHop()
                hop.id = host.id + "-hop-" + String(connection.route.hops.count)
                hop.name = string(hopRow, "name")
                hop.address = string(hopRow, "host")
                hop.username = string(hopRow, "username")
                hop.port = try port(hopRow["port"])
                hop.identityPath = string(hopRow, "privatekeypath")
                hop.authentication = auth(string(hopRow, "authmethod"))
                if !string(hopRow, "refsessionid").isEmpty {
                    hop.hostID = string(hopRow, "refsessionid")
                }
                secrets =
                    secrets || !string(hopRow, "password").isEmpty
                    || !string(hopRow, "privatekeypassphrase").isEmpty
                connection.route.hops.append(hop)
            }
            secrets =
                secrets || !string(row, "password").isEmpty
                || !string(row, "privatekeypassphrase").isEmpty
            try Validation.host(host)
            config.hosts.append(host)
            config.connections.append(connection)
        }
        if secrets {
            warnings.append(
                "Las contraseñas y passphrases no se copian al nuevo SQLite. Se conservan en el original; OpenSSH las solicitará en la terminal. Usa claves/agente para túneles."
            )
        }
        warnings.append(
            "La configuración SSH externa queda desactivada para los perfiles importados. Actívala en el editor solo si confías en tu configuración local."
        )
        try Validation.configuration(config)
        return ImportPreview(configuration: config, warnings: warnings)
    }
    private func legacyDatabase(_ url: URL) throws -> ImportPreview {
        var options = GRDB.Configuration()
        options.readonly = true
        let database = try DatabaseQueue(path: url.path, configuration: options)
        return try database.read { db in
            let tables = try String.fetchAll(
                db, sql: "SELECT name FROM sqlite_master WHERE type='table'")
            guard tables.contains("sessions") else {
                throw ORIError.invalid("No es una base de datos del ORI original.")
            }
            var rows: [[String: Any]] = []
            for row in try Row.fetchAll(db, sql: "SELECT * FROM sessions") {
                func value(_ key: String) -> Any {
                    row.columnNames.contains(key)
                        ? (row[key] as DatabaseValue).storage.anyValue : NSNull()
                }
                rows.append([
                    "id": value("id"), "name": value("name"), "host": value("host"),
                    "port": value("port"),
                    "username": value("username"), "authMethod": value("auth_method"),
                    "privateKeyPath": value("private_key_path"),
                    "jumpHops": value("jump_chain"), "color": value("color"), "icon": value("icon"),
                    "notes": value("notes"),
                    "createdAt": value("created_at"), "usableAsJump": value("usable_as_jump"),
                ])
                rows[rows.count - 1]["jumpHost"] = value("jump_host")
                rows[rows.count - 1]["jumpPort"] = value("jump_port")
                rows[rows.count - 1]["jumpUsername"] = value("jump_username")
            }
            var preview = try legacyRows(rows)
            preview.warnings.append(
                "Base original abierta en modo de solo lectura. Los secretos cifrados y known_hosts siguen en su ubicación original."
            )
            if tables.contains("groups") {
                preview.configuration.groups = try Row.fetchAll(db, sql: "SELECT * FROM groups").map
                { row in
                    var group = HostGroup()
                    group.id = row["id"]
                    group.name = row["name"]
                    group.parentID = row.hasColumn("parent_id") ? row["parent_id"] : nil
                    group.order = row.hasColumn("sort_order") ? row["sort_order"] : 0
                    group.color = row["color"]
                    group.icon = row.hasColumn("icon") ? row["icon"] : "folder"
                    group.notes = row.hasColumn("notes") ? (row["notes"] ?? "") : ""
                    group.expanded = row.hasColumn("is_expanded") ? row["is_expanded"] : true
                    return group
                }
                for row in try Row.fetchAll(db, sql: "SELECT id,group_id FROM sessions") {
                    let id: String = row["id"]
                    if let index = preview.configuration.hosts.firstIndex(where: { $0.id == id }) {
                        preview.configuration.hosts[index].groupID = row["group_id"]
                    }
                }
            }
            if tables.contains("commands") {
                preview.configuration.commands = try Row.fetchAll(db, sql: "SELECT * FROM commands")
                    .map { row in
                        var command = SavedCommand()
                        command.id = row["id"]
                        command.hostID = row["session_id"]
                        command.name = row["name"]
                        command.command = row["command"]
                        command.notes = row.hasColumn("notes") ? (row["notes"] ?? "") : ""
                        return command
                    }
            }
            if tables.contains("session_logs") {
                preview.events = try Row.fetchAll(
                    db, sql: "SELECT * FROM session_logs ORDER BY ts DESC LIMIT 10000"
                ).map { row in
                    var event = AuditEvent(hostID: row["session_id"], message: row["message"])
                    event.id = row["id"]
                    event.kind = row["kind"]
                    event.createdAt = LegacyDateParser.parse(row["ts"]) ?? .distantPast
                    return event
                }
                preview.warnings.append(
                    "Se importarán hasta 10.000 entradas históricas, que podrían contener información sensible. Nunca se incluyen en el informe compartible."
                )
            }
            try Validation.configuration(preview.configuration)
            return preview
        }
    }
}

public enum LegacyDateParser {
    public static func parse(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}

extension DatabaseValue.Storage {
    fileprivate var anyValue: Any {
        switch self {
        case .null: NSNull()
        case .int64(let n): n
        case .double(let n): n
        case .string(let s): s
        case .blob(let d): d
        }
    }
}

public enum CSVParser {
    public static func records(_ text: String) throws -> [[String: Any]] {
        let text = text.hasPrefix("\u{FEFF}") ? String(text.dropFirst()) : text
        let firstLine = text.prefix { $0 != "\n" && $0 != "\r" }
        let separator: Character =
            firstLine.filter { $0 == ";" }.count > firstLine.filter { $0 == "," }.count ? ";" : ","
        var rows: [[String]] = []
        var row: [String] = []
        var field = ""
        var quoted = false
        var closedQuote = false
        let chars = Array(text)
        var i = 0
        while i < chars.count {
            let c = chars[i]
            if quoted {
                if c == "\"" {
                    if i + 1 < chars.count && chars[i + 1] == "\"" {
                        field.append("\"")
                        i += 1
                    } else {
                        quoted = false
                        closedQuote = true
                    }
                } else {
                    field.append(c)
                }
            } else if c == "\"" {
                guard field.isEmpty && !closedQuote else {
                    throw ORIError.invalid("Comillas CSV fuera de posición.")
                }
                quoted = true
            } else if c == separator {
                row.append(field)
                field = ""
                closedQuote = false
            } else if c == "\n" || c == "\r" || c == "\r\n" {
                row.append(field)
                if row.contains(where: { !$0.isEmpty }) { rows.append(row) }
                field = ""
                row = []
                closedQuote = false
                if c == "\r" && i + 1 < chars.count && chars[i + 1] == "\n" { i += 1 }
            } else {
                guard !closedQuote else {
                    throw ORIError.invalid("Caracteres después de cerrar comillas CSV.")
                }
                field.append(c)
            }
            i += 1
        }
        guard !quoted else { throw ORIError.invalid("El CSV tiene comillas sin cerrar.") }
        row.append(field)
        if row.contains(where: { !$0.isEmpty }) { rows.append(row) }
        guard let header = rows.first else { throw ORIError.invalid("El archivo está vacío.") }
        guard Set(header.map { $0.lowercased() }).count == header.count else {
            throw ORIError.invalid("Cabeceras CSV duplicadas.")
        }
        return try rows.dropFirst().map { values in
            guard values.count == header.count else {
                throw ORIError.invalid("El número de columnas no coincide con la cabecera CSV.")
            }
            return Dictionary(uniqueKeysWithValues: zip(header, values)).mapValues { $0 as Any }
        }
    }
}

public enum ConfigurationExport {
    public static func encode(_ configuration: Configuration) throws -> Data {
        var copy = configuration
        // Commands and free notes may contain secrets supplied by a user. They never leave by default.
        copy.commands = []
        copy.repositoryRoots = nil
        for i in copy.hosts.indices {
            copy.hosts[i].notes = ""
            copy.hosts[i].identityPath = ""
            if copy.hosts[i].authentication == .key {
                copy.hosts[i].authentication = .configuration
            }
        }
        for i in copy.groups.indices { copy.groups[i].notes = "" }
        for i in copy.vpns.indices { copy.vpns[i].notes = "" }
        for i in copy.connections.indices {
            copy.connections[i].useSSHConfig = false
            copy.connections[i].knownHostsPath = nil
            for j in copy.connections[i].route.hops.indices {
                copy.connections[i].route.hops[j].identityPath = ""
                if copy.connections[i].route.hops[j].authentication == .key {
                    copy.connections[i].route.hops[j].authentication = .configuration
                }
            }
        }
        copy.revision = 0
        copy.settings.logCommands = false
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(copy)
    }
    public static func redactedReport(
        diagnostics: [ConnectionDiagnostic], tunnels: [TunnelInstance]
    ) throws -> Data {
        struct Report: Encodable {
            var version = 1
            var generatedAt = Date()
            var diagnosticKinds: [String: Int]
            var tunnelStates: [String: Int]
        }
        let report = Report(
            diagnosticKinds: Dictionary(grouping: diagnostics, by: { $0.kind.rawValue }).mapValues(
                \.count),
            tunnelStates: Dictionary(grouping: tunnels, by: { $0.state.rawValue }).mapValues(
                \.count))
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(report)
    }
}
