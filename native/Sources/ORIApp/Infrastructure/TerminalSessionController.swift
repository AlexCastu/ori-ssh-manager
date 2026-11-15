import AppKit
import ORICore
import Observation
import SwiftTerm
import SwiftUI

// === Lectura del log de ssh ===
// Mientras conecta se lee a menudo; ya conectada solo aporta errores (el cierre hace lectura final)
private let PAUSA_LOG_CONECTANDO = Duration.milliseconds(250)
private let PAUSA_LOG_CONECTADA = Duration.seconds(2)

private actor SSHLogReader {
    private let handle: FileHandle
    private var parser = SSHLogParser()
    init(url: URL) throws { handle = try FileHandle(forReadingFrom: url) }
    func poll() -> [SSHProgress] {
        guard let bytes = try? handle.read(upToCount: 65536), !bytes.isEmpty else { return [] }
        return parser.ingest(String(decoding: bytes, as: UTF8.self))
    }
    func close() { try? handle.close() }
}

// SwiftTerm's default local-process delegate permits OSC 52 clipboard reads/writes.
// Proxy only the needed transport hooks; remote clipboard protocols remain denied.
@MainActor
private final class TerminalSecurityDelegate: TerminalViewDelegate {
    weak var terminal: LocalProcessTerminalView?
    init(_ terminal: LocalProcessTerminalView) { self.terminal = terminal }
    func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
        terminal?.sizeChanged(source: source, newCols: newCols, newRows: newRows)
    }
    func setTerminalTitle(source: TerminalView, title: String) {}
    func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}
    func send(source: TerminalView, data: ArraySlice<UInt8>) {
        terminal?.send(source: source, data: data)
    }
    func scrolled(source: TerminalView, position: Double) {}
    func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}
    func bell(source: TerminalView) {}
    func clipboardCopy(source: TerminalView, content: Data) {}
    func clipboardRead(source: TerminalView) -> Data? { nil }
    func requestOpenLink(source: TerminalView, link: String, params: [String: String]) {
        guard let url = URL(string: link),
            ["https", "http"].contains(url.scheme?.lowercased() ?? "")
        else { return }
        let alert = NSAlert()
        alert.messageText = "Abrir enlace del terminal"
        alert.informativeText = url.absoluteString
        alert.addButton(withTitle: "Abrir")
        alert.addButton(withTitle: "Cancelar")
        if alert.runModal() == .alertFirstButtonReturn { NSWorkspace.shared.open(url) }
    }
}

@MainActor @Observable
final class TerminalSessionController: NSObject, Identifiable, LocalProcessTerminalViewDelegate {
    var model: TerminalSession
    var host: HostProfile
    var title: String { host.name }
    nonisolated let id: String
    let terminal: LocalProcessTerminalView
    private let securityDelegate: TerminalSecurityDelegate
    private var files: SSHRuntimeFiles?
    private var logReader: SSHLogReader?
    private var monitor: Task<Void, Never>?
    private var retryTask: Task<Void, Never>?
    private var intentional = false
    private var authenticated = false
    private var ready = false
    private var destino: String?
    private var generation = UUID()
    private var attempt = 0
    private let root: URL
    private var connection: ConnectionProfile
    private var configuration: Configuration
    private let passwordStore: SSHPasswordStore?
    // Terminal local: shell del Mac, sin ssh
    let local: Bool
    var eventHandler: ((AuditEvent) -> Void)?

    init(
        host: HostProfile, connection: ConnectionProfile, configuration: Configuration, root: URL,
        passwordStore: SSHPasswordStore? = nil, local: Bool = false
    ) {
        self.local = local
        self.host = host
        self.connection = connection
        self.configuration = configuration
        self.root = root
        self.passwordStore = passwordStore
        let initialModel = TerminalSession(connectionID: connection.id, hostID: host.id)
        model = initialModel
        id = initialModel.id
        var options = TerminalOptions.default
        options.termName = "xterm-256color"
        options.scrollback = configuration.settings.scrollback
        terminal = LocalProcessTerminalView(
            frame: CGRect(x: 0, y: 0, width: 960, height: 600),
            font: NSFont.monospacedSystemFont(
                ofSize: configuration.settings.fontSize, weight: .regular), options: options)
        securityDelegate = TerminalSecurityDelegate(terminal)
        super.init()
        terminal.terminalDelegate = securityDelegate
        terminal.processDelegate = self
        terminal.setAccessibilityLabel(local ? "Terminal local" : "Terminal SSH de \(host.name)")
        apply(configuration.settings)
    }
    // La ventana del terminal (relleno y pestaña activa) usa estos mismos colores
    static func colorFondo(_ settings: AppSettings) -> NSColor {
        settings.terminalTheme == "light"
            ? .init(srgbRed: 0.925, green: 0.937, blue: 0.957, alpha: 1)
            : .init(srgbRed: 0.055, green: 0.063, blue: 0.10, alpha: 1)
    }
    static func colorTexto(_ settings: AppSettings) -> NSColor {
        settings.terminalTheme == "light"
            ? .init(srgbRed: 0.18, green: 0.20, blue: 0.25, alpha: 1)
            : .init(srgbRed: 0.91, green: 0.93, blue: 0.97, alpha: 1)
    }
    func apply(_ settings: AppSettings) {
        terminal.font = .monospacedSystemFont(ofSize: settings.fontSize, weight: .regular)
        terminal.nativeBackgroundColor = Self.colorFondo(settings)
        terminal.nativeForegroundColor = Self.colorTexto(settings)
        terminal.setCursorStyle(
            settings.cursor == "bar"
                ? .steadyBar : (settings.cursor == "underline" ? .steadyUnderline : .steadyBlock))
    }
    func start() throws {
        guard !terminal.process.running, !terminal.process.windingDown else { return }
        intentional = false
        authenticated = false
        ready = false
        destino = nil
        generation = UUID()
        model.state = attempt > 0 ? .reconnecting : .connecting
        model.diagnostic = nil
        model.exitCode = nil
        model.endedAt = nil
        if local {
            abrirShellLocal()
            return
        }
        let files = try SSHRuntimeFiles(root: root)
        self.files = files
        do {
            let plan = try SSHArgumentBuilder.build(
                connection: connection, configuration: configuration,
                configurationPath: files.configuration.path, logPath: files.log.path)
            try files.write(plan)
            guard
                FileManager.default.createFile(
                    atPath: files.log.path, contents: nil, attributes: [.posixPermissions: 0o600])
            else {
                throw ORIError.unavailable("No se pudo crear el diagnóstico privado de OpenSSH.")
            }
            let reader = try SSHLogReader(url: files.log)
            self.logReader = reader
            var environment = ProcessInfo.processInfo.environment
            environment["TERM"] = "xterm-256color"
            environment["LANG"] = "en_US.UTF-8"
            environment["LC_ALL"] = "en_US.UTF-8"
            if let passwordStore, let executable = Bundle.main.executableURL {
                environment.merge(
                    try SSHAskpass.prepare(
                        files: files, connection: connection, configuration: configuration,
                        store: passwordStore, executable: executable)
                ) { _, value in value }
            }
            terminal.startProcess(
                executable: SSHArgumentBuilder.executable, args: plan.arguments,
                environment: environment.map { "\($0.key)=\($0.value)" })
            let token = generation
            monitor?.cancel()
            monitor = Task { [weak self] in
                while !Task.isCancelled {
                    let events = await reader.poll()
                    guard let self, self.generation == token else { break }
                    self.consume(events)
                    let pausa =
                        self.model.state == .connected ? PAUSA_LOG_CONECTADA : PAUSA_LOG_CONECTANDO
                    do { try await Task.sleep(for: pausa) } catch { break }
                }
            }
        } catch {
            files.remove()
            self.files = nil
            model.state = .failed
            throw error
        }
    }
    // Shell de login del usuario en su carpeta personal
    private func abrirShellLocal() {
        var entorno = ProcessInfo.processInfo.environment
        entorno["TERM"] = "xterm-256color"
        entorno["LANG"] = entorno["LANG"] ?? "en_US.UTF-8"
        let shell = entorno["SHELL"] ?? "/bin/zsh"
        terminal.startProcess(
            executable: shell, environment: entorno.map { "\($0.key)=\($0.value)" },
            execName: "-" + URL(fileURLWithPath: shell).lastPathComponent,
            currentDirectory: NSHomeDirectory())
        model.state = .connected
        model.connectedAt = Date()
    }
    private func consume(_ events: [SSHProgress]) {
        for event in events {
            switch event {
            case .authenticating: if !authenticated { model.state = .authenticating }
            case .authenticated: authenticated = true
            case .sessionReady: ready = true
            case .failure(let error): model.diagnostic = error
            case .destino(let texto): destino = texto
            default: break
            }
        }
        if authenticated && ready && model.state != .disconnecting && model.state != .connected {
            model.state = .connected
            model.connectedAt = Date()
            eventHandler?(
                AuditEvent(
                    hostID: host.id,
                    message: "Sesión SSH abierta: \(destino ?? host.address)\(rutaSaltos)"))
        }
    }
    // Nombres de los saltos en orden desde el Mac, para el registro
    private var rutaSaltos: String {
        let nombres = connection.route.hops.map { hop in
            hop.hostID.flatMap { configuration.host($0)?.name } ?? hop.name
        }
        return nombres.isEmpty ? "" : " · vía " + nombres.joined(separator: " → ")
    }
    func disconnect() async {
        intentional = true
        retryTask?.cancel()
        retryTask = nil
        monitor?.cancel()
        if terminal.process.running {
            model.state = .disconnecting
            terminal.terminate()
        }
        for _ in 0..<50 {
            if !terminal.process.running && !terminal.process.windingDown { break }
            try? await Task.sleep(for: .milliseconds(50))
        }
        generation = UUID()
        if let logReader { await logReader.close() }
        logReader = nil
        files?.remove()
        files = nil
        model.state = .disconnected
        model.endedAt = Date()
    }
    func reconnect() async throws {
        await disconnect()
        attempt = 0
        try start()
    }
    func copyOutput(lastBlock: Bool = false) {
        let text = String(decoding: terminal.getBufferAsData(), as: UTF8.self)
        let result = lastBlock ? TerminalText.lastBlock(text) : text
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(result, forType: .string)
    }
    func processTerminated(source: TerminalView, exitCode: Int32?) {
        let token = generation
        Task { [weak self] in
            guard let self else { return }
            if let reader = self.logReader {
                self.consume(await reader.poll())
                await reader.close()
            }
            guard self.generation == token else { return }
            self.monitor?.cancel()
            self.logReader = nil
            self.files?.remove()
            self.files = nil
            self.model.exitCode = exitCode
            self.model.endedAt = Date()
            if self.intentional || exitCode == 0 || self.local {
                self.model.state = .disconnected
                self.eventHandler?(
                    AuditEvent(
                        hostID: self.host.id,
                        message: "Sesión SSH cerrada: \(self.destino ?? self.host.address)"))
                return
            }
            self.model.state = .failed
            if self.model.diagnostic == nil {
                self.model.diagnostic = .init(
                    kind: .disconnected, message: "La conexión SSH se ha cerrado inesperadamente.")
            }
            self.eventHandler?(
                AuditEvent(hostID: self.host.id, message: self.model.diagnostic!.message))
            let next = self.attempt + 1
            guard self.model.diagnostic?.retryable == true,
                let delay = self.connection.reconnect.delay(attempt: next)
            else { return }
            self.attempt = next
            self.model.state = .reconnecting
            self.retryTask = Task { [weak self] in
                do {
                    try await Task.sleep(for: .seconds(delay))
                    try Task.checkCancellation()
                    guard let self, !self.intentional, self.generation == token else { return }
                    try self.start()
                } catch is CancellationError {} catch {
                    self?.model.state = .failed
                    self?.model.diagnostic = .init(kind: .ssh, message: error.localizedDescription)
                }
            }
        }
    }
    func processFailedToStart(source: TerminalView, error: LocalProcessError) {
        model.state = .failed
        model.diagnostic = .init(
            kind: .ssh,
            message: local
                ? "No se pudo abrir la shell local: \(error)"
                : "No se pudo iniciar OpenSSH en el PTY: \(error)")
    }
    func sizeChanged(source: LocalProcessTerminalView, newCols: Int, newRows: Int) {}
    func setTerminalTitle(source: LocalProcessTerminalView, title: String) {}
    func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}
}

@MainActor
private final class TerminalHostView: NSView {
    weak var terminal: LocalProcessTerminalView?
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if let terminal, let window { window.makeFirstResponder(terminal) }
    }
}

struct SwiftTermView: NSViewRepresentable {
    let session: TerminalSessionController
    func makeNSView(context: Context) -> NSView {
        let container = TerminalHostView()
        container.terminal = session.terminal
        session.terminal.removeFromSuperview()
        session.terminal.frame = container.bounds
        session.terminal.autoresizingMask = [.width, .height]
        container.addSubview(session.terminal)
        return container
    }
    func updateNSView(_ nsView: NSView, context: Context) {
        if session.terminal.superview !== nsView {
            session.terminal.removeFromSuperview()
            session.terminal.frame = nsView.bounds
            nsView.addSubview(session.terminal)
        }
    }
    static func dismantleNSView(_ nsView: NSView, coordinator: ()) {
        // View disposal has no authority to terminate the registry's session.
        for subview in nsView.subviews { subview.removeFromSuperview() }
    }
}

@MainActor @Observable
final class SessionRegistry {
    var sessions: [TerminalSessionController] = []
    var selectedID: String?
    var selected: TerminalSessionController? { sessions.first { $0.id == selectedID } }
    func insert(_ session: TerminalSessionController) {
        sessions.append(session)
        selectedID = session.id
    }
    func close(_ id: String) async {
        guard let session = sessions.first(where: { $0.id == id }) else { return }
        await session.disconnect()
        sessions.removeAll { $0.id == id }
        if selectedID == id { selectedID = sessions.last?.id }
    }
    func stopAll() async { for session in sessions { await session.disconnect() } }
}
