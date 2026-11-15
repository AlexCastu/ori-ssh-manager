import Darwin
import Foundation
import Testing

import class GRDB.DatabaseQueue

@testable import ORICore

func fixture() -> (Configuration, HostProfile, ConnectionProfile) {
    var host = HostProfile()
    host.name = "Prueba"
    host.address = "server.test"
    host.username = "tester"
    var connection = ConnectionProfile(hostID: host.id)
    connection.useSSHConfig = false
    var config = Configuration()
    config.hosts = [host]
    config.connections = [connection]
    return (config, host, connection)
}

struct ArgumentTests {
    @Test func directConnectionUsesArgumentsAndStrictHostKeys() throws {
        let (config, host, connection) = fixture()
        let plan = try SSHArgumentBuilder.build(
            connection: connection, configuration: config, configurationPath: "/tmp/ori/config")
        #expect(plan.arguments.suffix(2) == ["--", host.address])
        #expect(plan.arguments.contains("StrictHostKeyChecking=ask"))
        #expect(plan.arguments.contains("ForwardAgent=no"))
        #expect(!plan.managedConfiguration.contains("Include"))
        #expect(!plan.arguments.contains("-f"))
    }
    @Test(arguments: [
        "-oProxyCommand=whoami", "host;touch /tmp/injected", "$(id)", "a\nb", "x%h", "user@host",
        "https://host", "host name", "host|id", "`id`", "[::1]",
    ])
    func rejectsAddressInjection(_ address: String) {
        #expect(throws: (any Error).self) { try Validation.address(address) }
    }
    @Test(arguments: [-1, 0, 65536, Int.max]) func invalidPorts(_ port: Int) {
        #expect(throws: (any Error).self) { try Validation.port(port) }
    }
    @Test(arguments: ["prod", "192.0.2.1", "2001:db8::1", "::1", "host-with-dashes.example"])
    func validAddresses(_ address: String) throws { try Validation.address(address) }
    @Test func identityWithSpacesIsOneArgument() throws {
        var (c, h, cp) = fixture()
        h.authentication = .key
        h.identityPath = "/tmp/Claves de prueba/key"
        c.hosts = [h]
        cp.useSSHConfig = true
        let plan = try SSHArgumentBuilder.build(
            connection: cp, configuration: c, configurationPath: "/tmp/config")
        #expect(plan.arguments.contains(h.identityPath))
        #expect(plan.managedConfiguration.contains("Include"))
    }
    @Test(arguments: [1, 2])
    func proxyJumpReadsConfigurationWhenDataDirectoryContainsSpaces(_ jumps: Int) async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("ORI Regression \(UUID())/Application Support")
        let files = try SSHRuntimeFiles(root: root)
        defer {
            files.remove()
            try? FileManager.default.removeItem(at: root.deletingLastPathComponent())
        }
        let socketFD = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        #expect(socketFD >= 0)
        defer { Darwin.close(socketFD) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let bound = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(socketFD, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        #expect(bound == 0)
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let status = withUnsafeMutablePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                getsockname(socketFD, $0, &length)
            }
        }
        #expect(status == 0)
        let port = Int(UInt16(bigEndian: address.sin_port))
        var (configuration, _, connection) = fixture()
        connection.timeout = 1
        var first = JumpHop()
        first.address = "127.0.0.1"
        first.port = port
        first.username = "tester"
        connection.route.hops = [first]
        if jumps == 2 {
            var second = JumpHop()
            second.address = "middle.test"
            second.username = "tester"
            connection.route.hops.append(second)
        }
        configuration.connections = [connection]
        var tunnel = TunnelProfile()
        tunnel.name = "Prueba de ruta"
        tunnel.connectionID = connection.id
        let plan = try SSHArgumentBuilder.build(
            connection: connection, configuration: configuration,
            configurationPath: files.configuration.path, tunnel: tunnel)
        try files.write(plan)
        let result = try await SystemCommandRunner().run(
            SSHArgumentBuilder.executable, plan.arguments, timeout: .seconds(5))
        #expect(result.status != 0)
        #expect(!result.output.contains("Can't open user config file"))
        #expect(result.output.contains("Connecting to 127.0.0.1"))
    }
    @Test func rejectsUnsafeUsernamesAndConfigurationPaths() {
        for user in ["-lroot", "x;id", "$(id)", "x@host", "x\ny"] {
            #expect(throws: (any Error).self) { try Validation.username(user) }
        }
        for path in ["/tmp/key\nHost *", "/tmp/\"key", "/tmp/%h-key"] {
            #expect(throws: (any Error).self) { try Validation.identity(path) }
        }
    }
    @Test func multiJumpPreservesOrderUsersAndIdentities() throws {
        var (c, _, cp) = fixture()
        var a = JumpHop()
        a.address = "a.test"
        a.username = "alice"
        a.port = 2222
        a.identityPath = "/tmp/key a"
        var b = JumpHop()
        b.address = "2001:db8::10"
        b.username = "bob"
        b.port = 22
        b.identityPath = "/tmp/key b"
        cp.route.hops = [a, b]
        c.connections = [cp]
        let plan = try SSHArgumentBuilder.build(
            connection: cp, configuration: c, configurationPath: "/tmp/config")
        #expect(plan.arguments.contains("alice@a.test:2222,bob@[2001:db8::10]:22"))
        #expect(plan.managedConfiguration.contains("IdentityFile \"/tmp/key a\""))
        #expect(plan.managedConfiguration.contains("IdentityFile \"/tmp/key b\""))
        #expect(plan.firstHop.address == "a.test")
    }
    @Test func cycleAndMissingReferenceFail() {
        var (c, h, cp) = fixture()
        var hop = JumpHop()
        hop.hostID = "deleted"
        cp.route.hops = [hop]
        #expect(throws: (any Error).self) { try Validation.resolvedHops(cp, configuration: c) }
        hop.hostID = h.id
        cp.route.hops = [hop]
        #expect(throws: (any Error).self) { try Validation.resolvedHops(cp, configuration: c) }
        hop.hostID = nil
        hop.address = "jump.test"
        cp.route.hops = [hop, hop]
        c.connections = [cp]
        #expect(throws: (any Error).self) { try Validation.configuration(c) }
    }
    @Test(arguments: [TunnelKind.local, .remote, .dynamic]) func tunnelArguments(_ kind: TunnelKind)
        throws
    {
        let (c, _, cp) = fixture()
        var t = TunnelProfile()
        t.name = "T"
        t.connectionID = cp.id
        t.kind = kind
        let plan = try SSHArgumentBuilder.build(
            connection: cp, configuration: c, configurationPath: "/tmp/config", tunnel: t)
        #expect(plan.arguments.contains("-N"))
        #expect(plan.arguments.contains("-T"))
        #expect(plan.arguments.contains("BatchMode=yes"))
        #expect(plan.arguments.contains("ExitOnForwardFailure=yes"))
        #expect(plan.arguments.contains("StrictHostKeyChecking=yes"))
        #expect(!plan.arguments.contains("-f"))
        let flag = kind == .local ? "-L" : (kind == .remote ? "-R" : "-D")
        #expect(plan.arguments.contains(flag))
        #expect(!plan.arguments.contains("-tt"))
    }
    @Test func dynamicDoesNotValidateUnusedDestination() throws {
        var t = TunnelProfile()
        t.name = "SOCKS"
        t.kind = .dynamic
        t.destinationHost = ""
        t.destinationPort = 0
        try Validation.tunnel(t)
        t.kind = .local
        #expect(throws: (any Error).self) { try Validation.tunnel(t) }
    }
    @Test func parserDoesNotMarkLaunchOrAuthenticationAsReady() {
        var parser = SSHLogParser()
        #expect(parser.ingest("debug1: Connecting to test\n").isEmpty)
        #expect(
            parser.ingest("Authenticated to test ([127.0.0.1]:22) using \"publickey\".\n") == [
                .authenticated
            ])
        #expect(parser.ingest("debug1: Entering inter").isEmpty)
        #expect(parser.ingest("active session.\n") == [.transportReady])
        #expect(parser.ingest("debug2: shell request accepted on channel 0\n") == [.sessionReady])
        #expect(
            parser.ingest(
                "debug1: remote forward success for: listen 127.0.0.1:8080, connect test:80\n") == [
                    .remoteForwardReady
                ])
        #expect(parser.ingest("Authenticated to test using publickey.\r").isEmpty)
        #expect(parser.ingest("\n") == [.authenticated])
        #expect(parser.ingest("debug2: channel 0: read failed: Broken pipe\r\n").isEmpty)
    }
    @Test func permanentErrorsNeverRetry() {
        for text in [
            "Permission denied (publickey).", "Host key verification failed.",
            "REMOTE HOST IDENTIFICATION HAS CHANGED!", "Address already in use",
            "Can't open user config file /tmp/missing: No such file or directory",
        ] {
            #expect(!ConnectionDiagnostic.classify(text).retryable)
        }
        #expect(ConnectionDiagnostic.classify("Connection timed out").retryable)
    }
    @Test func boundedBackoffWithJitter() {
        var policy = ReconnectionPolicy()
        policy.enabled = true
        #expect(policy.delay(attempt: 1, jitter: 1) == 2)
        #expect(policy.delay(attempt: 5, jitter: 1) == 32)
        #expect(policy.delay(attempt: 6) == nil)
        #expect(policy.delay(attempt: 0) == nil)
        policy.enabled = false
        #expect(policy.delay(attempt: 1) == nil)
    }
}

struct PersistenceTests {
    @Test func updatePreservesCommandsAuditAndIDs() async throws {
        let store = try ConfigurationStore(path: ":memory:")
        var (c, h, _) = fixture()
        var command = SavedCommand()
        command.name = "Listar"
        command.command = "ls"
        command.hostID = h.id
        c.commands = [command]
        let event = AuditEvent(hostID: h.id, message: "Conectado")
        c = try await store.importConfiguration(c, events: [event])
        h.name = "Renombrado"
        c.hosts = [h]
        _ = try await store.replace(c)
        let loaded = try await store.load()
        let events = try await store.events(hostID: h.id)
        #expect(loaded.commands == [command])
        #expect(events == [event])
        #expect(loaded.hosts[0].id == h.id)
    }

    @Test func auditHistoryIsNotPurgedAndCompleteExportRemainsAvailable() async throws {
        let store = try ConfigurationStore(path: ":memory:")
        let (configuration, host, _) = fixture()
        let events = (0..<10001).map { index in
            AuditEvent(hostID: host.id, message: "Evento \(index)")
        }
        _ = try await store.importConfiguration(configuration, events: events)
        try await store.append(AuditEvent(hostID: host.id, message: "Nuevo"))
        #expect(try await store.events(hostID: host.id).count == 1000)
        #expect(try await store.events(hostID: host.id, limit: nil).count == 10002)
    }
    @Test func staleWritesAndInvalidImportsAreAtomic() async throws {
        let store = try ConfigurationStore(path: ":memory:")
        let (c, _, _) = fixture()
        _ = try await store.replace(c)
        await #expect(throws: (any Error).self) { try await store.replace(c) }
        var invalid = try await store.load()
        invalid.hosts[0].port = 0
        let input = invalid
        await #expect(throws: (any Error).self) { try await store.replace(input) }
        #expect(try await store.load().hosts[0].port == nil)
    }
    @Test func concurrentMutationsAreSerialized() async throws {
        let store = try ConfigurationStore(path: ":memory:")
        try await withThrowingTaskGroup(of: Void.self) { group in
            for i in 0..<20 {
                group.addTask {
                    _ = try await store.mutate { c in
                        var g = HostGroup()
                        g.name = "G\(i)"
                        c.groups.append(g)
                    }
                }
            }
            try await group.waitForAll()
        }
        #expect(try await store.load().groups.count == 20)
    }
    @Test func migrationReopenAndRuntimeStateIsNotPersisted() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let path = root.appendingPathComponent("profiles.sqlite").path
        let store = try ConfigurationStore(path: path)
        let (c, _, _) = fixture()
        _ = try await store.replace(c)
        let reopened = try ConfigurationStore(path: path)
        #expect(try await reopened.load().hosts == c.hosts)
        let bytes = try Data(contentsOf: URL(fileURLWithPath: path))
        #expect(!String(decoding: bytes, as: UTF8.self).contains("processIdentifier"))
    }
}

struct ImportAndSecurityTests {
    @Test func csvPreservesQuotedFieldsAndRejectsMalformedInput() throws {
        let rows = try CSVParser.records(
            "name,host,notes\r\n\"Uno, dos\",host.test,\"Nota\nmultilínea\"\r\n")
        #expect(rows.count == 1)
        #expect(rows[0]["name"] as? String == "Uno, dos")
        #expect(rows[0]["notes"] as? String == "Nota\nmultilínea")
        #expect(throws: (any Error).self) { try CSVParser.records("name,host\n\"sin cierre,host") }
        #expect(throws: (any Error).self) { try CSVParser.records("name,host\nuno,host,extra") }
    }
    @Test func exportOmitsPotentialSecretsAndReportIsRedacted() throws {
        var (c, h, _) = fixture()
        h.notes = "secret-notes"
        h.identityPath = "/secret/key"
        c.hosts = [h]
        var command = SavedCommand()
        command.name = "Secret"
        command.command = "token=secret-command"
        c.commands = [command]
        let export = String(decoding: try ConfigurationExport.encode(c), as: UTF8.self)
        #expect(!export.contains("secret-notes"))
        #expect(!export.contains("secret-command"))
        #expect(!export.contains("/secret/key"))
        let report = String(
            decoding: try ConfigurationExport.redactedReport(
                diagnostics: [.init(kind: .dns, message: "corp-secret.example")],
                tunnels: []), as: UTF8.self)
        #expect(!report.contains("corp-secret"))
        #expect(report.contains("dns"))
    }
    @Test func importerRejectsBadPortAndPreservesGroups() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let file = root.appendingPathComponent("sessions.csv")
        try Data(
            "name,host,port,username,groupName,authMethod\nA,a.test,22,alice,Corp/Prod,agent\nB,b.test,2222,bob,Lab/Prod,agent\n"
                .utf8
        ).write(to: file)
        let importer = ConfigurationImportService()
        let preview = try await importer.preview(url: file)
        #expect(preview.configuration.hosts.count == 2)
        #expect(preview.configuration.groups.count == 4)
        #expect(preview.configuration.hosts[0].groupID != preview.configuration.hosts[1].groupID)
        #expect(preview.configuration.hosts[0].authentication == .agent)
        try Data("name,host,port\nA,a.test,no-number\n".utf8).write(to: file)
        await #expect(throws: (any Error).self) { try await importer.preview(url: file) }
    }

    @Test func legacySQLitePreservesIDsHierarchyCommandsAndFractionalDates() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let file = root.appendingPathComponent("data.db")
        let database = try DatabaseQueue(path: file.path)
        try await database.write { db in
            try db.execute(
                sql:
                    "CREATE TABLE sessions(id TEXT,name TEXT,host TEXT,port INTEGER,username TEXT,auth_method TEXT,private_key_path TEXT,jump_chain TEXT,color TEXT,icon TEXT,notes TEXT,created_at TEXT,usable_as_jump INTEGER,group_id TEXT)"
            )
            try db.execute(
                sql:
                    "INSERT INTO sessions VALUES('stable-id','Legacy','host.test',2222,'ori','agent',NULL,NULL,'blue','terminal','nota','2026-11-14T12:34:56.789Z',1,'child')"
            )
            try db.execute(
                sql:
                    "CREATE TABLE groups(id TEXT,name TEXT,parent_id TEXT,sort_order INTEGER,color TEXT,icon TEXT,notes TEXT,is_expanded INTEGER)"
            )
            try db.execute(
                sql:
                    "INSERT INTO groups VALUES('root','Corp',NULL,0,'purple','folder',NULL,1),('child','Prod','root',1,'blue','cloud','nota carpeta',1)"
            )
            try db.execute(
                sql:
                    "CREATE TABLE commands(id TEXT,session_id TEXT,name TEXT,command TEXT,notes TEXT)"
            )
            try db.execute(
                sql: "INSERT INTO commands VALUES('cmd','stable-id','Listar','ls','nota comando')")
            try db.execute(
                sql:
                    "CREATE TABLE session_logs(id TEXT,session_id TEXT,ts TEXT,kind TEXT,message TEXT)"
            )
            try db.execute(
                sql:
                    "INSERT INTO session_logs VALUES('event','stable-id','2026-11-14T12:34:56.789Z','event','Conectado')"
            )
        }
        let before = try Data(contentsOf: file)
        let importer = ConfigurationImportService()
        let preview = try await importer.preview(url: file)
        #expect(preview.configuration.hosts[0].id == "stable-id")
        #expect(preview.configuration.hosts[0].usableAsJump)
        #expect(preview.configuration.hosts[0].groupID == "child")
        #expect(preview.configuration.groups[1].parentID == "root")
        #expect(preview.configuration.commands[0].hostID == "stable-id")
        #expect(preview.events[0].createdAt == preview.configuration.hosts[0].createdAt)
        #expect(preview.events[0].createdAt > .distantPast)
        #expect(try Data(contentsOf: file) == before)
        let store = try ConfigurationStore(path: ":memory:")
        _ = try await importer.merge(preview, into: store)
        #expect(try await store.events().count == 1)
    }

    @Test func importedNativeConfigurationNeverAuthorizesAutomaticAccess() async throws {
        var (configuration, _, cp) = fixture()
        cp.useSSHConfig = true
        cp.knownHostsPath = "/tmp/unreviewed-known-hosts"
        cp.legacyAlgorithms = true
        configuration.connections = [cp]
        var tunnel = TunnelProfile()
        tunnel.name = "Imported"
        tunnel.connectionID = cp.id
        tunnel.autoStart = true
        tunnel.bindAddress = "0.0.0.0"
        configuration.tunnels = [tunnel]
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(
            UUID().uuidString + ".json")
        defer { try? FileManager.default.removeItem(at: file) }
        try JSONEncoder().encode(configuration).write(to: file)
        let preview = try await ConfigurationImportService().preview(url: file)
        #expect(!preview.configuration.connections[0].useSSHConfig)
        #expect(preview.configuration.connections[0].knownHostsPath == nil)
        #expect(!preview.configuration.connections[0].legacyAlgorithms)
        #expect(!preview.configuration.tunnels[0].autoStart)
        #expect(!preview.warnings.isEmpty)
    }
    @Test func receiptPreventsDuplicateFileImport() async throws {
        let store = try ConfigurationStore(path: ":memory:")
        var (c, _, _) = fixture()
        c = try await store.importConfiguration(c, events: [], fingerprint: "fixture-hash")
        let repeated = c
        await #expect(throws: (any Error).self) {
            try await store.importConfiguration(repeated, events: [], fingerprint: "fixture-hash")
        }
        #expect(try await store.load().hosts.count == 1)
    }
    @Test func lastBlockMatchesOriginalBehavior() {
        let output = "alice@host:~$ echo uno\nuno\nalice@host:~$ ls\nfile\nalice@host:~$ \n"
        #expect(TerminalText.lastBlock(output) == "alice@host:~$ ls\nfile")
        #expect(TerminalText.fuzzyScore("bp", in: "Bastion Producción") != nil)
    }
}

struct ProcessTests {
    @Test func oversizedOutputIsAnErrorInsteadOfPartialConfiguration() async {
        await #expect(throws: (any Error).self) {
            try await SystemCommandRunner().run("/usr/bin/jot", ["-b", "X", "600000"])
        }
    }
    @Test func managedProcessOutputAndExit() async throws {
        let runner = SystemCommandRunner()
        let result = try await runner.run("/usr/bin/printf", ["ORI-UNICODE-ñ"])
        #expect(result.status == 0)
        #expect(result.output == "ORI-UNICODE-ñ")
    }
    @Test func cancellationTerminatesOnlyOwnedProcess() async throws {
        let supervisor = ProcessSupervisor()
        let process = try await supervisor.start(executable: "/bin/sleep", arguments: ["30"])
        #expect(await supervisor.runningCount == 1)
        await supervisor.stop(process.id)
        await supervisor.stop(process.id)
        #expect(await supervisor.runningCount == 0)
    }
    @Test func runnerTimeoutIsBounded() async {
        await #expect(throws: (any Error).self) {
            try await SystemCommandRunner().run("/bin/sleep", ["30"], timeout: .milliseconds(100))
        }
    }
    @Test func localPortConflictAndRelease() throws {
        let fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP)
        #expect(fd >= 0)
        defer { close(fd) }
        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        let bound = withUnsafeMutablePointer(to: &addr) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        #expect(bound == 0)
        var size = socklen_t(MemoryLayout<sockaddr_in>.size)
        _ = withUnsafeMutablePointer(to: &addr) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(fd, $0, &size) }
        }
        #expect(
            try !PortConflictDetector.isAvailable(
                address: "127.0.0.1", port: Int(UInt16(bigEndian: addr.sin_port))))
    }
}
