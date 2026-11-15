import AppKit
import Darwin
import Foundation
import ORICore
import SwiftTerm
import Testing

@testable import ORIApp

@Suite(.serialized)
@MainActor
struct TerminalTests {
    @Test func realPTYUnicodeANSIResizeAndViewLifetime() async throws {
        _ = NSApplication.shared
        var options = TerminalOptions.default
        options.scrollback = 1000
        let view = LocalProcessTerminalView(
            frame: NSRect(x: 0, y: 0, width: 800, height: 500), options: options)
        let owner = NSView(frame: view.frame)
        owner.addSubview(view)
        view.startProcess(
            executable: "/bin/cat", args: [],
            environment: ["TERM=xterm-256color", "LANG=en_US.UTF-8"])
        #expect(view.process.running)
        let pid = view.process.shellPid
        let input = "ORI_UNICODE_ñ_界\r"
        view.send(source: view, data: Array(input.utf8)[...])
        for _ in 0..<50 {
            if String(decoding: view.getBufferAsData(), as: UTF8.self).contains("ORI_UNICODE_ñ_界") {
                break
            }
            try await Task.sleep(for: .milliseconds(50))
        }
        #expect(String(decoding: view.getBufferAsData(), as: UTF8.self).contains("ORI_UNICODE_ñ_界"))
        view.feed(text: "\u{1b}[31mRED\u{1b}[0m\r\n")
        #expect(String(decoding: view.getBufferAsData(), as: UTF8.self).contains("RED"))
        view.frame.size = CGSize(width: 1100, height: 650)
        let size = view.getWindowSize()
        #expect(size.ws_col > 80)
        #expect(size.ws_row > 24)
        view.removeFromSuperview()
        view.send(source: view, data: Array("BACKGROUND_MARKER\r".utf8)[...])
        try await Task.sleep(for: .milliseconds(200))
        owner.addSubview(view)
        #expect(view.process.shellPid == pid)
        #expect(
            String(decoding: view.getBufferAsData(), as: UTF8.self).contains("BACKGROUND_MARKER"))
        view.terminate()
        for _ in 0..<40 {
            if !view.process.running { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        #expect(!view.process.running)
    }
    // Terminal local: abre la shell del Mac en la carpeta personal y se cierra con exit
    @Test func localTerminalRunsLoginShellInHome() async throws {
        _ = NSApplication.shared
        var host = HostProfile()
        host.name = "Terminal local"
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let controller = TerminalSessionController(
            host: host, connection: ConnectionProfile(hostID: host.id),
            configuration: Configuration(), root: root, local: true)
        try controller.start()
        #expect(controller.model.state == .connected)
        controller.terminal.send(
            source: controller.terminal, data: Array("echo ORI_LOCAL_$PWD\r".utf8)[...])
        let esperado = "ORI_LOCAL_" + NSHomeDirectory()
        for _ in 0..<60 {
            if String(decoding: controller.terminal.getBufferAsData(), as: UTF8.self)
                .contains(esperado)
            { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        #expect(
            String(decoding: controller.terminal.getBufferAsData(), as: UTF8.self).contains(
                esperado))
        controller.terminal.send(source: controller.terminal, data: Array("exit\r".utf8)[...])
        for _ in 0..<60 {
            if controller.model.state == .disconnected { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        #expect(controller.model.state == .disconnected)
    }
    // Scripts: la salida aparece mientras corre y al final llegan código y resto de salida
    @Test func scriptOutputStreamsBeforeExit() async throws {
        let carpeta = FileManager.default.temporaryDirectory.appendingPathComponent(
            UUID().uuidString)
        try FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: carpeta) }
        let script = carpeta.appendingPathComponent("prueba.sh")
        try Data("#!/bin/bash\necho PRIMERA\nsleep 1\necho SEGUNDA\nexit 4\n".utf8).write(to: script)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: script.path)
        let controller = ScriptsController()
        controller.ejecutar(script)
        var vistaEnCurso = false
        for _ in 0..<40 {
            if let ejecucion = controller.ejecuciones[script], ejecucion.enCurso,
                ejecucion.salida.contains("PRIMERA")
            {
                vistaEnCurso = true
                break
            }
            try await Task.sleep(for: .milliseconds(50))
        }
        #expect(vistaEnCurso)
        for _ in 0..<100 {
            if controller.ejecuciones[script]?.enCurso == false { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        #expect(controller.ejecuciones[script]?.codigo == 4)
        #expect(controller.ejecuciones[script]?.salida.contains("SEGUNDA") == true)
    }
    @Test func registryOwnsViewAndRemoteClipboardReadIsDenied() {
        _ = NSApplication.shared
        var host = HostProfile()
        host.name = "Seguridad"
        host.address = "127.0.0.1"
        let cp = ConnectionProfile(hostID: host.id)
        var c = Configuration()
        c.hosts = [host]
        c.connections = [cp]
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let controller = TerminalSessionController(
            host: host, connection: cp, configuration: c, root: root)
        let registry = SessionRegistry()
        registry.insert(controller)
        let identity = ObjectIdentifier(controller.terminal)
        registry.selectedID = nil
        registry.selectedID = controller.id
        #expect(ObjectIdentifier(registry.selected!.terminal) == identity)
        #expect(
            controller.terminal.terminalDelegate?.clipboardRead(source: controller.terminal) == nil)
        #expect(!controller.terminal.process.running)
    }
    @Test(.enabled(if: ProcessInfo.processInfo.environment["ORI_SSH_FIXTURES"] != nil))
    func sshShellInteractiveScreenAndIndependentTunnel() async throws {
        _ = NSApplication.shared
        let fixtures = URL(
            fileURLWithPath: ProcessInfo.processInfo.environment["ORI_SSH_FIXTURES"]!)
        let root = fixtures.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        var host = HostProfile()
        host.name = "PTY SSH aislado"
        host.address = "127.0.0.1"
        host.port = 22403
        host.username = "ori"
        host.authentication = .key
        host.identityPath = fixtures.appendingPathComponent("id_test").path
        var cp = ConnectionProfile(hostID: host.id)
        cp.useSSHConfig = false
        cp.knownHostsPath = fixtures.appendingPathComponent("known_hosts").path
        var c = Configuration()
        c.hosts = [host]
        c.connections = [cp]
        let controller = TerminalSessionController(
            host: host, connection: cp, configuration: c, root: root)
        try controller.start()
        for _ in 0..<160 {
            if controller.model.state == .connected || controller.model.state == .failed { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        #expect(controller.model.state == .connected)
        let pid = controller.terminal.process.shellPid
        controller.terminal.send(
            source: controller.terminal,
            data: Array(
                "printf '\\123\\123\\110\\137\\120\\124\\131\\137\\303\\261\\137\\347\\225\\214\\n'; stty size\r"
                    .utf8)[...])
        try await Task.sleep(for: .milliseconds(400))
        #expect(
            String(decoding: controller.terminal.getBufferAsData(), as: UTF8.self).contains(
                "SSH_PTY_ñ_界"))
        // Alternate screen and a real full-screen editor via the same PTY.
        controller.terminal.send(
            source: controller.terminal, data: Array("vi /tmp/ori-pty-test\r".utf8)[...])
        try await Task.sleep(for: .milliseconds(300))
        controller.terminal.send(source: controller.terminal, data: Array("\u{1b}:q!\r".utf8)[...])
        controller.terminal.removeFromSuperview()
        try await Task.sleep(for: .milliseconds(300))
        #expect(controller.terminal.process.shellPid == pid)
        let supervisor = ProcessSupervisor()
        let manager = TunnelManager(supervisor: supervisor, runtimeRoot: root)
        var tunnel = TunnelProfile()
        tunnel.name = "Independent"
        tunnel.connectionID = cp.id
        tunnel.listenPort = 22525
        tunnel.destinationPort = 8080
        try await manager.start(tunnel, configuration: c)
        for _ in 0..<100 {
            if await manager.snapshots.first?.state == .active { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        await controller.disconnect()
        #expect(!controller.terminal.process.running)
        #expect(await manager.snapshots.first?.state == .active)
        let response = try await SystemCommandRunner().run(
            "/usr/bin/curl", ["--noproxy", "*", "--max-time", "5", "http://127.0.0.1:22525/"])
        #expect(response.output.contains("ORI_SERVICE_OK"))
        await manager.stopAll()
        #expect(await supervisor.runningCount == 0)
    }
    @Test(.enabled(if: ProcessInfo.processInfo.environment["ORI_SSH_FIXTURES"] != nil))
    func measureFivePTYsAndDescriptorCleanup() async throws {
        _ = NSApplication.shared
        func descriptors() -> Int {
            (try? FileManager.default.contentsOfDirectory(atPath: "/dev/fd").count) ?? -1
        }
        func cpu() -> Double {
            var usage = rusage()
            getrusage(RUSAGE_SELF, &usage)
            return Double(usage.ru_utime.tv_sec + usage.ru_stime.tv_sec) + Double(
                usage.ru_utime.tv_usec + usage.ru_stime.tv_usec) / 1_000_000
        }
        let beforeFDs = descriptors()
        let beforeCPU = cpu()
        let before = Date()
        var views: [LocalProcessTerminalView] = []
        for _ in 0..<5 {
            var options = TerminalOptions.default
            options.scrollback = 1000
            let view = LocalProcessTerminalView(
                frame: NSRect(x: 0, y: 0, width: 900, height: 550), options: options)
            view.startProcess(
                executable: "/bin/cat", args: [],
                environment: ["TERM=xterm-256color", "LANG=en_US.UTF-8"])
            views.append(view)
        }
        let payload = Array(String(repeating: "ORI_PERFORMANCE_ñ_界\r", count: 500).utf8)
        for view in views { view.send(source: view, data: payload[...]) }
        try await Task.sleep(for: .seconds(1))
        let activeFDs = descriptors()
        for view in views {
            #expect(view.process.running)
            #expect(
                String(decoding: view.getBufferAsData(), as: UTF8.self).contains(
                    "ORI_PERFORMANCE_ñ_界"))
            view.terminate()
        }
        for _ in 0..<40 {
            if views.allSatisfy({ !$0.process.running && !$0.process.windingDown }) { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        #expect(views.allSatisfy { !$0.process.running })
        views.removeAll()
        try await Task.sleep(for: .milliseconds(200))
        var usage = rusage()
        getrusage(RUSAGE_SELF, &usage)
        let report: [String: Any] = [
            "environment": "Swift Testing process, five real cat PTYs, no visible app window",
            "terminals": 5, "inputLines": 2500, "elapsedSeconds": Date().timeIntervalSince(before),
            "cpuSeconds": cpu() - beforeCPU, "peakProcessRSSBytes": usage.ru_maxrss,
            "fileDescriptorsBefore": beforeFDs, "fileDescriptorsActive": activeFDs,
            "fileDescriptorsAfter": descriptors(),
            "measuredAt": ISO8601DateFormatter().string(from: Date()),
        ]
        let directory = URL(
            fileURLWithPath: ProcessInfo.processInfo.environment["ORI_SSH_FIXTURES"]!
        ).deletingLastPathComponent()
        try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
            .write(to: directory.appendingPathComponent("performance.json"))
    }

}
