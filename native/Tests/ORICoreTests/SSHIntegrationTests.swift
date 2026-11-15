import Foundation
import Testing

@testable import ORICore

@Suite(.serialized, .enabled(if: ProcessInfo.processInfo.environment["ORI_SSH_FIXTURES"] != nil))
struct SSHIntegrationTests {
    private var fixtures: URL {
        URL(fileURLWithPath: ProcessInfo.processInfo.environment["ORI_SSH_FIXTURES"]!)
    }
    private func configuration(jumps: Int = 0) -> (Configuration, ConnectionProfile) {
        var host = HostProfile()
        host.name = "SSH aislado"
        host.username = "ori"
        host.authentication = .key
        host.identityPath = fixtures.appendingPathComponent("id_test").path
        host.address = jumps == 0 ? "127.0.0.1" : "ori-native-test-c"
        host.port = jumps == 0 ? 22401 : 2222
        var c = Configuration()
        c.hosts = [host]
        var cp = ConnectionProfile(hostID: host.id)
        cp.useSSHConfig = false
        cp.knownHostsPath = fixtures.appendingPathComponent("known_hosts").path
        if jumps > 0 {
            var a = JumpHop()
            a.address = "127.0.0.1"
            a.port = 22401
            a.username = "ori"
            a.identityPath = host.identityPath
            cp.route.hops.append(a)
        }
        if jumps > 1 {
            var b = JumpHop()
            b.address = "ori-native-test-b"
            b.port = 2222
            b.username = "ori"
            b.identityPath = host.identityPath
            cp.route.hops.append(b)
        }
        c.connections = [cp]
        return (c, cp)
    }
    private func root() throws -> URL {
        let root = fixtures.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }
    private func waitActive(_ manager: TunnelManager, id: String) async throws -> TunnelInstance {
        for _ in 0..<120 {
            if let snapshot = await manager.snapshots.first(where: { $0.id == id }) {
                if snapshot.state == .active { return snapshot }
                if snapshot.state == .failed {
                    throw ORIError.process(snapshot.lastError?.message ?? "Túnel fallido")
                }
            }
            try await Task.sleep(for: .milliseconds(100))
        }
        throw ORIError.unavailable("El túnel no se ha activado a tiempo.")
    }
    @Test(arguments: [0, 1, 2]) func localForwardAcrossJumpRoutes(_ jumps: Int) async throws {
        let (config, cp) = configuration(jumps: jumps)
        let directory = try root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let supervisor = ProcessSupervisor()
        let manager = TunnelManager(supervisor: supervisor, runtimeRoot: directory)
        var tunnel = TunnelProfile()
        tunnel.name = "L"
        tunnel.connectionID = cp.id
        tunnel.listenPort = 22501 + jumps
        tunnel.destinationHost = "127.0.0.1"
        tunnel.destinationPort = 8080
        try await manager.start(tunnel, configuration: config)
        do {
            let snapshot = try await waitActive(manager, id: tunnel.id)
            #expect(snapshot.authenticated)
            #expect(snapshot.forwardingEstablished)
            #expect(snapshot.serviceReachable == nil)
            let response = try await SystemCommandRunner().run(
                "/usr/bin/curl",
                [
                    "--noproxy", "*", "--fail", "--max-time", "5",
                    "http://127.0.0.1:\(tunnel.listenPort)/",
                ])
            #expect(response.status == 0)
            #expect(response.output.contains("ORI_SERVICE_OK"))
            try await manager.start(tunnel, configuration: config)
            #expect(await supervisor.runningCount == 1)
        } catch {
            await manager.stopAll()
            throw error
        }
        await manager.stop(tunnel.id)
        await manager.stop(tunnel.id)
        #expect(await supervisor.runningCount == 0)
        #expect(try PortConflictDetector.isAvailable(address: "127.0.0.1", port: tunnel.listenPort))
    }
    @Test func socksForward() async throws {
        let (config, cp) = configuration()
        let directory = try root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let supervisor = ProcessSupervisor()
        let manager = TunnelManager(supervisor: supervisor, runtimeRoot: directory)
        var t = TunnelProfile()
        t.name = "SOCKS"
        t.kind = .dynamic
        t.connectionID = cp.id
        t.listenPort = 22510
        try await manager.start(t, configuration: config)
        do {
            _ = try await waitActive(manager, id: t.id)
            let response = try await SystemCommandRunner().run(
                "/usr/bin/curl",
                [
                    "--noproxy", "", "--socks5-hostname", "127.0.0.1:22510", "--fail", "--max-time",
                    "5", "http://127.0.0.1:8080/",
                ])
            #expect(response.status == 0)
            #expect(response.output.contains("ORI_SERVICE_OK"))
        } catch {
            await manager.stopAll()
            throw error
        }
        await manager.stopAll()
        #expect(await supervisor.runningCount == 0)
    }
    @Test func remoteForward() async throws {
        let (config, cp) = configuration()
        let directory = try root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let supervisor = ProcessSupervisor()
        let manager = TunnelManager(supervisor: supervisor, runtimeRoot: directory)
        // Remote -> Mac -> independent local tunnel -> controlled HTTP service.
        var local = TunnelProfile()
        local.name = "L for R"
        local.connectionID = cp.id
        local.listenPort = 22511
        local.destinationPort = 8080
        try await manager.start(local, configuration: config)
        do {
            _ = try await waitActive(manager, id: local.id)
            var remote = TunnelProfile()
            remote.name = "R"
            remote.kind = .remote
            remote.connectionID = cp.id
            remote.listenPort = 22512
            remote.destinationPort = 22511
            try await manager.start(remote, configuration: config)
            let snapshot = try await waitActive(manager, id: remote.id)
            #expect(snapshot.serviceReachable == nil)
            let response = try await SystemCommandRunner().run(
                "/usr/local/bin/docker",
                [
                    "exec", "ori-native-test-a", "curl", "--fail", "--max-time", "5",
                    "http://127.0.0.1:22512/",
                ])
            #expect(response.status == 0)
            #expect(response.output.contains("ORI_SERVICE_OK"))
        } catch {
            await manager.stopAll()
            throw error
        }
        await manager.stopAll()
        #expect(await supervisor.runningCount == 0)
    }
    @Test func unknownAndChangedKeysAreRejectedWithoutRetry() async throws {
        var (config, cp) = configuration()
        let directory = try root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let emptyKeys = directory.appendingPathComponent("known_hosts")
        try Data().write(to: emptyKeys)
        cp.knownHostsPath = emptyKeys.path
        config.connections = [cp]
        let supervisor = ProcessSupervisor()
        let manager = TunnelManager(supervisor: supervisor, runtimeRoot: directory)
        var t = TunnelProfile()
        t.name = "Unknown key"
        t.connectionID = cp.id
        t.listenPort = 22515
        t.reconnect.enabled = true
        try await manager.start(t, configuration: config)
        for _ in 0..<60 {
            if await manager.snapshots.first?.state == .failed { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        #expect(await manager.snapshots.first?.state == .failed)
        #expect(await manager.snapshots.first?.lastError?.kind == .hostKey)
        #expect(await manager.snapshots.first?.attempts == 0)
        await manager.stopAll()
        let original = try String(
            contentsOf: fixtures.appendingPathComponent("known_hosts"), encoding: .utf8)
        let other = original.components(separatedBy: .newlines).first {
            $0.hasPrefix("[127.0.0.1]:22402 ")
        }!
        let wrong = other.replacingOccurrences(of: "[127.0.0.1]:22402", with: "[127.0.0.1]:22401")
        try Data((wrong + "\n").utf8).write(to: emptyKeys)
        try await manager.start(t, configuration: config)
        for _ in 0..<60 {
            if await manager.snapshots.first?.state == .failed { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        #expect(await manager.snapshots.first?.state == .failed)
        #expect(await manager.snapshots.first?.lastError?.kind == .hostKey)
        #expect(await manager.snapshots.first?.attempts == 0)
        await manager.stopAll()
    }
    @Test func stopDuringStartAndConcurrentStartLeaveNoChild() async throws {
        let (config, cp) = configuration()
        let directory = try root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let supervisor = ProcessSupervisor()
        let manager = TunnelManager(supervisor: supervisor, runtimeRoot: directory)
        var profile = TunnelProfile()
        profile.name = "Concurrent"
        profile.connectionID = cp.id
        profile.listenPort = 22516
        let tunnel = profile
        try await withThrowingTaskGroup(of: Void.self) { group in
            for _ in 0..<8 {
                group.addTask { try await manager.start(tunnel, configuration: config) }
            }
            group.addTask { await manager.stop(tunnel.id) }
            try await group.waitForAll()
        }
        await manager.stopAll()
        #expect(await supervisor.runningCount == 0)
    }
    @Test func boundedReconnectionAndCancelBackoff() async throws {
        var (config, cp) = configuration()
        cp.keepalive = 1
        cp.keepaliveCount = 1
        config.connections = [cp]
        let directory = try root()
        defer { try? FileManager.default.removeItem(at: directory) }
        let supervisor = ProcessSupervisor()
        let manager = TunnelManager(supervisor: supervisor, runtimeRoot: directory)
        var t = TunnelProfile()
        t.name = "Reconnect"
        t.connectionID = cp.id
        t.listenPort = 22530
        t.destinationPort = 8080
        t.reconnect.enabled = true
        t.reconnect.baseDelay = 1
        t.reconnect.maxDelay = 4
        t.reconnect.maxAttempts = 3
        try await manager.start(t, configuration: config)
        let runner = SystemCommandRunner()
        do {
            _ = try await waitActive(manager, id: t.id)
            _ = try await runner.run(
                "/usr/local/bin/docker", ["stop", "-t", "1", "ori-native-test-a"])
            for _ in 0..<60 {
                if await manager.snapshots.first?.state == .reconnecting { break }
                try await Task.sleep(for: .milliseconds(50))
            }
            #expect(await manager.snapshots.first?.state == .reconnecting)
            _ = try await runner.run("/usr/local/bin/docker", ["start", "ori-native-test-a"])
            let active = try await waitActive(manager, id: t.id)
            #expect(active.attempts >= 1 && active.attempts <= 3)
            _ = try await runner.run(
                "/usr/local/bin/docker", ["stop", "-t", "1", "ori-native-test-a"])
            for _ in 0..<60 {
                if await manager.snapshots.first?.state == .reconnecting { break }
                try await Task.sleep(for: .milliseconds(50))
            }
            await manager.stopAll()
            _ = try await runner.run("/usr/local/bin/docker", ["start", "ori-native-test-a"])
            try await Task.sleep(for: .seconds(2))
            #expect(await supervisor.runningCount == 0)
            #expect(await manager.snapshots.first?.state == .stopped)
        } catch {
            _ = try? await runner.run("/usr/local/bin/docker", ["start", "ori-native-test-a"])
            await manager.stopAll()
            throw error
        }
        await manager.stopAll()
    }

}
