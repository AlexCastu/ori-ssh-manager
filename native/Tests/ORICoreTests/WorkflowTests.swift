import Foundation
import Testing

@testable import ORICore

struct WorkflowTests {
    @Test func environmentFoldersAndJumpCatalogPreserveRoutesAndSavedData() async throws {
        var config = Configuration()
        func group(_ name: String, _ id: String, _ parent: String? = nil) -> HostGroup {
            var value = HostGroup()
            value.id = "accesos-" + id
            value.name = name
            value.parentID = parent.map { "accesos-" + $0 }
            return value
        }
        config.groups = [
            group("Accesos", "root"), group("alc1", "alc", "root"),
            group("Bastiones", "alc-leaf", "alc"),
            group("mde1", "mde", "root"), group("Bastiones", "mde-leaf", "mde"),
            group("RIMA", "rima", "root"), group("Bastiones", "rima-leaf", "rima"),
            group("Pasarelas", "jumps", "root"), group("EXECUTION", "execution", "root"),
            group("STF", "stf", "root"), group("Servicios", "services", "root"),
            group("PRE · BAF", "baf", "services"),
        ]
        let rows = [
            ("ALC", "alc-leaf"), ("MDE", "mde-leaf"), ("arammt1-11", "rima-leaf"),
            ("Execution", "execution"), ("STF", "stf"), ("RIMA", "jumps"), ("BAF", "baf"),
        ]
        for (name, folder) in rows {
            var host = HostProfile()
            host.id = name
            host.name = name
            host.address = name.lowercased() + ".test"
            host.groupID = "accesos-" + folder
            host.usableAsJump = name == "RIMA"
            config.hosts.append(host)
            var cp = ConnectionProfile(hostID: host.id)
            cp.useSSHConfig = false
            if name != "RIMA" {
                var hop = JumpHop()
                hop.hostID = "RIMA"
                cp.route.hops = [hop]
            }
            config.connections.append(cp)
        }
        var command = SavedCommand()
        command.name = "Estado"
        command.command = "pwd"
        command.hostID = "ALC"
        config.commands = [command]
        let originalConnections = config.connections
        let store = try ConfigurationStore(path: ":memory:")
        _ = try await store.replace(config)
        try await store.append(.init(hostID: "ALC", message: "Evento conservado"))
        let migrated = try await store.mutate { ConnectionCatalogMigration.apply(to: &$0) }
        func path(_ hostID: String) -> String {
            var current = migrated.host(hostID)?.groupID
            var names: [String] = []
            while let id = current, let group = migrated.groups.first(where: { $0.id == id }) {
                names.insert(group.name, at: 0)
                current = group.parentID
            }
            return names.joined(separator: "/")
        }
        #expect(path("ALC") == "PRE/Bastiones/ALC1")
        #expect(path("MDE") == "PRO/Bastiones/MDE1")
        #expect(path("arammt1-11") == "PRE/Bastiones/Manuel Tobar")
        #expect(path("Execution") == "Maqueta/Execution")
        #expect(path("STF") == "Maqueta/STF")
        #expect(path("BAF") == "PRE/BAF")
        #expect(migrated.jumpHosts.map(\.id) == ["RIMA"])
        #expect(migrated.connections == originalConnections)
        #expect(migrated.commands == [command])
        #expect(try await store.events().count == 1)
        var repeated = migrated
        ConnectionCatalogMigration.apply(to: &repeated)
        #expect(repeated == migrated)
        let root = try #require(repeated.groups.firstIndex { $0.id == "ori-catalog-pre" })
        repeated.groups[root].name = "PRE personalizado"
        ConnectionCatalogMigration.apply(to: &repeated)
        try Validation.configuration(repeated)
        #expect(repeated.groups[root].name == "PRE personalizado")
    }
    @Test func organizationSurvivesReopenAndPreservesCommands() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
            UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try ConfigurationStore(
            path: directory.appendingPathComponent("ori.sqlite").path)
        var (config, host, _) = fixture()
        var second = host
        second.id = "second"
        second.name = "Segundo"
        config.hosts.append(second)
        var group = HostGroup()
        group.name = "Entorno"
        config.groups = [group]
        var command = SavedCommand()
        command.name = "Estado"
        command.command = "pwd"
        command.hostID = host.id
        config.commands = [command]
        config.repositoryRoots = [RepositoryRoot(name: "Trabajo", path: "/tmp/trabajo")]
        try ConnectionOrganizer.moveHost(second.id, to: group.id, before: nil, in: &config)
        try ConnectionOrganizer.moveHost(host.id, to: group.id, before: second.id, in: &config)
        config.organization?.positions["route|target"] = .init(x: 400, y: 200)
        _ = try await store.replace(config)
        let reopened = try ConfigurationStore(
            path: directory.appendingPathComponent("ori.sqlite").path)
        let saved = try await reopened.load()
        #expect(saved.organization?.hostOrder == [host.id, second.id])
        #expect(saved.organization?.positions["route|target"]?.x == 400)
        #expect(saved.host(host.id)?.groupID == group.id)
        #expect(saved.commands == [command])
        #expect(saved.repositoryRoots?.count == 1)
    }

    @Test func oldJSONWithoutNewFieldsDecodesAndInvalidMovesAreRejected() throws {
        let (config, _, _) = fixture()
        var object = try #require(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(config)) as? [String: Any])
        object.removeValue(forKey: "organization")
        object.removeValue(forKey: "repositoryRoots")
        var restored = try JSONDecoder().decode(
            Configuration.self, from: JSONSerialization.data(withJSONObject: object))
        #expect(restored.organization == nil)
        #expect(restored.repositoryRoots == nil)
        #expect(throws: (any Error).self) {
            try ConnectionOrganizer.moveHost("missing", to: nil, in: &restored)
        }
        #expect(throws: (any Error).self) {
            try ConnectionOrganizer.moveHost(restored.hosts[0].id, to: "missing", in: &restored)
        }
    }

    @Test func jumpInsertionReordersAndRejectsCyclesWithoutChangingDraft() throws {
        var (config, target, connection) = fixture()
        var a = HostProfile()
        a.name = "A"
        a.address = "a.test"
        a.usableAsJump = true
        var b = HostProfile()
        b.name = "B"
        b.address = "b.test"
        b.usableAsJump = true
        target.usableAsJump = true
        config.hosts = [target, a, b]
        try ConnectionOrganizer.insertJump(a.id, in: &connection, configuration: config)
        try ConnectionOrganizer.insertJump(
            b.id, before: connection.route.hops[0].id, in: &connection, configuration: config)
        #expect(connection.route.hops.compactMap(\.hostID) == [b.id, a.id])
        try ConnectionOrganizer.insertJump(b.id, in: &connection, configuration: config)
        #expect(connection.route.hops.compactMap(\.hostID) == [a.id, b.id])
        let original = connection
        #expect(throws: (any Error).self) {
            try ConnectionOrganizer.insertJump(target.id, in: &connection, configuration: config)
        }
        #expect(connection == original)
    }

    @Test func accessImportAppliesOverridesAndResolvesBridgesWithoutSecrets() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
            UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let data: [String: Any] = [
            "bastiones": [
                "jumps": [
                    "bridge": ["ip": "jump.test", "user": "operator", "password": "SECRET_FIXTURE"]
                ],
                "groups": [
                    "Site": [
                        [
                            "name": "Servidor", "ip": "host.test", "user": "old", "jump": "bridge",
                            "password": "SECRET_FIXTURE",
                        ]
                    ]
                ],
            ],
            "servicios": [
                "plantas": [
                    "PRO": [
                        "user": "tester", "password": "PLANT_FIXTURE",
                        "salto": ["ip": "plant.test"],
                    ]
                ],
                "grupos": [
                    "PRO · Servicio": [
                        "planta": "PRO", "nodos": [["name": "Servicio", "ip": "service.test"]],
                    ]
                ],
            ],
        ]
        try JSONSerialization.data(withJSONObject: data).write(
            to: directory.appendingPathComponent("datos.json"))
        try JSONSerialization.data(withJSONObject: [
            "bastion|Site|Servidor": ["user": "new", "ip": "override.test"]
        ]).write(to: directory.appendingPathComponent("overrides_local.json"))
        try JSONSerialization.data(withJSONObject: [
            "roots": [["name": "Trabajo", "path": "C:\\Repos"]]
        ]).write(to: directory.appendingPathComponent("gestor_repos_config.json"))
        let preview = try AccessBastionsImporter.preview(directory: directory)
        let host = try #require(preview.configuration.hosts.first { $0.name == "Servidor" })
        #expect(host.address == "override.test")
        #expect(host.username == "new")
        let route = try #require(preview.configuration.connection(for: host.id))
        #expect(
            try Validation.resolvedHops(route, configuration: preview.configuration).first?.address
                == "jump.test")
        #expect(
            !String(decoding: try JSONEncoder().encode(preview.configuration), as: UTF8.self)
                .contains("SECRET_FIXTURE"))
        #expect(preview.configuration.repositoryRoots?.count == 1)
        #expect(preview.warnings.contains { $0.contains("Windows") })
        let passwords = try AccessBastionsImporter.passwords(directory: directory)
        #expect(passwords.first { $0.host.name == "Servicio" }?.password == "PLANT_FIXTURE")
        #expect(passwords.first { $0.host.name == "Servidor" }?.host.username == "new")
        let store = try ConfigurationStore(path: ":memory:")
        _ = try await ConfigurationImportService().merge(preview, into: store)
        await #expect(throws: (any Error).self) {
            try await ConfigurationImportService().merge(preview, into: store)
        }
    }

    @Test(.enabled(if: ProcessInfo.processInfo.environment["ORI_ACCESS_DIRECTORY"] != nil))
    func actualInventoryPreviewValidatesWithoutWritingSource() throws {
        let path = try #require(ProcessInfo.processInfo.environment["ORI_ACCESS_DIRECTORY"])
        let preview = try AccessBastionsImporter.preview(directory: URL(fileURLWithPath: path))
        try Validation.configuration(preview.configuration)
        #expect(preview.configuration.hosts.count >= 144)
        #expect(preview.configuration.repositoryRoots?.count == 3)
        #expect(preview.configuration.hosts.allSatisfy { $0.identityPath.isEmpty })
        let passwords = try AccessBastionsImporter.passwords(directory: URL(fileURLWithPath: path))
        #expect(passwords.count == preview.configuration.hosts.count)
    }
}

struct RepositoryWorkflowTests {
    private func git(_ directory: URL, _ arguments: [String]) async throws {
        let result = try await SystemCommandRunner().run(
            "/usr/bin/git", ["-C", directory.path] + arguments, timeout: .seconds(15))
        guard result.status == 0 else {
            throw ORIError.process(
                "Falló la preparación del repositorio de prueba: \(arguments.first ?? "git")")
        }
    }
    @Test func realGitFetchPullDirtyProtectionAndDivergence() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
            "ori-git-\(UUID())")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let remote = directory.appendingPathComponent("remote.git")
        let source = directory.appendingPathComponent("source")
        let work = directory.appendingPathComponent("work with spaces")
        try await git(directory, ["init", "--bare", "--initial-branch=main", remote.path])
        try await git(directory, ["clone", remote.path, source.path])
        try await git(source, ["config", "user.name", "ORI Test"])
        try await git(source, ["config", "user.email", "test@example.invalid"])
        try Data("one".utf8).write(to: source.appendingPathComponent("sample.txt"))
        try await git(source, ["add", "."])
        try await git(source, ["commit", "-m", "Fixture inicial"])
        try await git(source, ["push", "-u", "origin", "main"])
        try await git(directory, ["clone", remote.path, work.path])
        let service = RepositoryService()
        let root = RepositoryRoot(name: "Pruebas", path: directory.path)
        let discovered = try await service.discover(root)
        #expect(discovered.contains(work.path))
        var status = await service.status(work.path)
        #expect(status.branch == "main" && !status.dirty && status.upstream == "origin/main")
        try Data("two".utf8).write(to: source.appendingPathComponent("sample.txt"))
        try await git(source, ["commit", "-am", "Cambio remoto de prueba"])
        try await git(source, ["push"])
        status = try await service.perform(.fetch, path: work.path)
        #expect(status.behind == 1 && status.ahead == 0)
        let local = work.appendingPathComponent("nuevo\narchivo.txt")
        try Data("local".utf8).write(to: local)
        status = await service.status(work.path)
        #expect(status.untracked == 1 && status.dirty)
        await #expect(throws: (any Error).self) {
            try await service.perform(.pull, path: work.path)
        }
        #expect(
            try String(contentsOf: work.appendingPathComponent("sample.txt"), encoding: .utf8)
                == "one")
        try FileManager.default.removeItem(at: local)
        status = try await service.perform(.pull, path: work.path)
        #expect(status.behind == 0 && !status.dirty)
        #expect(
            try String(contentsOf: work.appendingPathComponent("sample.txt"), encoding: .utf8)
                == "two")
        try await git(work, ["config", "user.name", "ORI Test"])
        try await git(work, ["config", "user.email", "test@example.invalid"])
        try Data("local commit".utf8).write(to: work.appendingPathComponent("local.txt"))
        try await git(work, ["add", "."])
        try await git(work, ["commit", "-m", "Cambio local de prueba"])
        try Data("remote commit".utf8).write(to: source.appendingPathComponent("remote.txt"))
        try await git(source, ["add", "."])
        try await git(source, ["commit", "-m", "Divergencia de prueba"])
        try await git(source, ["push"])
        status = try await service.perform(.fetch, path: work.path)
        #expect(status.ahead == 1 && status.behind == 1)
        await #expect(throws: (any Error).self) {
            try await service.perform(.pull, path: work.path)
        }
        #expect(
            FileManager.default.fileExists(atPath: work.appendingPathComponent("local.txt").path))
    }
    @Test func porcelainRenameDoesNotCountOldPathAsAnotherFile() {
        let output =
            "# branch.head main\0# branch.upstream origin/main\0# branch.ab +2 -3\02 R. N... 100644 100644 100644 abc abc R100 nuevo.txt\0? antiguo.txt\0? archivo.txt\0"
        let result = RepositoryStatus.parse(output, path: "/tmp/test")
        #expect(result.changed == 1 && result.untracked == 1)
        #expect(result.ahead == 2 && result.behind == 3)
    }
    @Test func shareableURLDropsCredentialsOnlyFromHTTP() {
        #expect(
            RepositoryService.shareableURL("https://user:token@bitbucket.org/ws/repo.git")
                == "https://bitbucket.org/ws/repo.git")
        #expect(
            RepositoryService.shareableURL("git@bitbucket.org:ws/repo.git")
                == "git@bitbucket.org:ws/repo.git")
        #expect(
            RepositoryService.shareableURL("ssh://git@host:7999/ws/repo.git")
                == "ssh://git@host:7999/ws/repo.git")
    }
}
