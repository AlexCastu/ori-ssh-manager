import Foundation
import GRDB

public protocol ConfigurationRepository: Sendable {
    func load() async throws -> Configuration
    func replace(_ value: Configuration) async throws -> Configuration
}

public actor ConfigurationStore: ConfigurationRepository {
    private let database: DatabaseQueue
    private static let collections = [
        "hosts", "connections", "tunnels", "vpns", "groups", "commands", "workspaces",
    ]
    public init(path: String) throws {
        if path != ":memory:" {
            let parent = URL(fileURLWithPath: path).deletingLastPathComponent()
            try FileManager.default.createDirectory(
                at: parent, withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o700])
        }
        var config = GRDB.Configuration()
        config.prepareDatabase { db in try db.execute(sql: "PRAGMA foreign_keys = ON") }
        database = try DatabaseQueue(path: path, configuration: config)
        var migrator = DatabaseMigrator()
        migrator.registerMigration("v1_profiles") { db in
            for table in Self.collections {
                try db.create(table: table) { t in
                    t.primaryKey("id", .text)
                    t.column("payload", .blob).notNull()
                }
            }
            try db.create(table: "metadata") { t in
                t.primaryKey("id", .integer)
                t.column("payload", .blob).notNull()
            }
            try db.create(table: "audit_events") { t in
                t.primaryKey("id", .text)
                t.column("host_id", .text).indexed()
                t.column("date", .double).notNull()
                t.column("payload", .blob).notNull()
            }
        }
        migrator.registerMigration("v2_import_receipts") { db in
            try db.create(table: "import_receipts") { t in
                t.primaryKey("fingerprint", .text)
                t.column("date", .double).notNull()
            }
        }
        try migrator.migrate(database)
        if path != ":memory:" {
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path)
        }
    }
    public func load() throws -> Configuration {
        try database.read { db in
            var c =
                try Data.fetchOne(db, sql: "SELECT payload FROM metadata WHERE id = 1")
                .map { try JSONDecoder().decode(Configuration.self, from: $0) } ?? Configuration()
            c.hosts = try Self.read(HostProfile.self, "hosts", db)
            c.connections = try Self.read(ConnectionProfile.self, "connections", db)
            c.tunnels = try Self.read(TunnelProfile.self, "tunnels", db)
            c.vpns = try Self.read(VPNProfile.self, "vpns", db)
            c.groups = try Self.read(HostGroup.self, "groups", db)
            c.commands = try Self.read(SavedCommand.self, "commands", db)
            c.workspaces = try Self.read(Workspace.self, "workspaces", db)
            return c
        }
    }
    public func replace(_ value: Configuration) throws -> Configuration {
        try commit(value, events: [], fingerprint: nil)
    }
    public func importConfiguration(
        _ value: Configuration, events: [AuditEvent], fingerprint: String? = nil
    ) throws -> Configuration {
        try commit(value, events: events, fingerprint: fingerprint)
    }
    private func commit(_ value: Configuration, events: [AuditEvent], fingerprint: String?) throws
        -> Configuration
    {
        var c = value
        let existing = try load()
        guard value.revision == existing.revision else {
            throw ORIError.invalid("La configuración ha cambiado. Vuelve a abrir el formulario.")
        }
        try Validation.configuration(c)
        c.revision += 1
        try database.write { db in
            if let fingerprint {
                let imported =
                    try Bool.fetchOne(
                        db, sql: "SELECT EXISTS(SELECT 1 FROM import_receipts WHERE fingerprint=?)",
                        arguments: [fingerprint]) ?? false
                guard !imported else {
                    throw ORIError.invalid("Este archivo ya fue importado. No se crean duplicados.")
                }
                try db.execute(
                    sql: "INSERT INTO import_receipts(fingerprint,date) VALUES(?,?)",
                    arguments: [fingerprint, Date().timeIntervalSince1970])
            }
            try Self.write(c.hosts, "hosts", db)
            try Self.write(c.connections, "connections", db)
            try Self.write(c.tunnels, "tunnels", db)
            try Self.write(c.vpns, "vpns", db)
            try Self.write(c.groups, "groups", db)
            try Self.write(c.commands, "commands", db)
            try Self.write(c.workspaces, "workspaces", db)
            var metadata = c
            metadata.hosts = []
            metadata.connections = []
            metadata.tunnels = []
            metadata.vpns = []
            metadata.groups = []
            metadata.commands = []
            metadata.workspaces = []
            try db.execute(
                sql:
                    "INSERT INTO metadata(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
                arguments: [try JSONEncoder().encode(metadata)])
            for event in events {
                try db.execute(
                    sql:
                        "INSERT INTO audit_events(id,host_id,date,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING",
                    arguments: [
                        event.id, event.hostID, event.createdAt.timeIntervalSince1970,
                        try JSONEncoder().encode(event),
                    ])
            }
        }
        return c
    }
    public func mutate(_ change: @Sendable (inout Configuration) throws -> Void) throws
        -> Configuration
    {
        var c = try load()
        try change(&c)
        return try replace(c)
    }
    public func append(_ event: AuditEvent) throws {
        try database.write { db in
            try db.execute(
                sql: "INSERT INTO audit_events(id,host_id,date,payload) VALUES(?,?,?,?)",
                arguments: [
                    event.id, event.hostID, event.createdAt.timeIntervalSince1970,
                    try JSONEncoder().encode(event),
                ])
        }
    }
    public func events(hostID: String? = nil, limit: Int? = 1000) throws -> [AuditEvent] {
        try database.read { db in
            let rows: [Data]
            if let hostID {
                rows = try Data.fetchAll(
                    db,
                    sql:
                        "SELECT payload FROM audit_events WHERE host_id=? ORDER BY date DESC LIMIT ?",
                    arguments: [hostID, limit ?? -1])
            } else {
                rows = try Data.fetchAll(
                    db, sql: "SELECT payload FROM audit_events ORDER BY date DESC LIMIT ?",
                    arguments: [limit ?? -1])
            }
            return try rows.map { try JSONDecoder().decode(AuditEvent.self, from: $0) }
        }
    }
    public func clearEvents(hostID: String? = nil) throws {
        try database.write { db in
            if let hostID {
                try db.execute(sql: "DELETE FROM audit_events WHERE host_id=?", arguments: [hostID])
            } else {
                try db.execute(sql: "DELETE FROM audit_events")
            }
        }
    }
    private static func read<T: Decodable>(_ type: T.Type, _ table: String, _ db: Database) throws
        -> [T]
    {
        try Data.fetchAll(db, sql: "SELECT payload FROM \(table) ORDER BY rowid").map {
            try JSONDecoder().decode(type, from: $0)
        }
    }
    private static func write<T: Encodable & Identifiable>(
        _ items: [T], _ table: String, _ db: Database
    ) throws where T.ID == String {
        // Tables are compile-time constants, never imported identifiers. Upserts preserve related audit history.
        let ids = items.map(\.id)
        if ids.isEmpty {
            try db.execute(sql: "DELETE FROM \(table)")
        } else {
            let marks = Array(repeating: "?", count: ids.count).joined(separator: ",")
            try db.execute(
                sql: "DELETE FROM \(table) WHERE id NOT IN (\(marks))",
                arguments: StatementArguments(ids))
        }
        for item in items {
            try db.execute(
                sql:
                    "INSERT INTO \(table)(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
                arguments: [item.id, try JSONEncoder().encode(item)])
        }
    }
}
