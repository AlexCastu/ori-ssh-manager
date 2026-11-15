import AppKit
import Network
import ORICore
import OSLog
import Observation
import SwiftUI

@MainActor @Observable
final class AppContainer {
    enum Section: String, CaseIterable, Identifiable {
        case dashboard = "Inicio"
        case hosts = "Conexiones"
        case terminals = "Terminales"
        case tunnels = "Túneles"
        case repositories = "Repositorios"
        case scripts = "Scripts"
        case diagnostics = "Diagnósticos"
        case settings = "Ajustes"
        var id: String { rawValue }
        var icon: String {
            switch self {
            case .dashboard: "square.grid.2x2.fill"
            case .hosts: "server.rack"
            case .terminals: "terminal.fill"
            case .tunnels: "point.3.connected.trianglepath.dotted"
            case .repositories: "arrow.triangle.branch"
            case .scripts: "scroll"
            case .diagnostics: "waveform.path.ecg"
            case .settings: "slider.horizontal.3"
            }
        }
    }
    var section: Section = .dashboard
    var configuration = Configuration()
    var initialized = false
    var startupError: String?
    var message: String?
    var messageIsError = false
    var online = false
    var sessions = SessionRegistry()
    var repositories = RepositoryController()
    var scripts = ScriptsController()
    var tunnelInstances: [TunnelInstance] = []
    var reachability: [String: NetworkReachabilityResult] = [:]
    var diagnostics: [ConnectionDiagnostic] = []
    var auditEvents: [AuditEvent] = []
    var commandPalette = false
    var editingHost: HostProfile?
    var hostEditor = false
    var diagramHostID: String?
    var editingTunnel: TunnelProfile?
    var tunnelEditor = false
    var importPreview: ImportPreview?
    var operationCount = 0
    var isBusy: Bool { operationCount > 0 }
    var connectionHosts: [HostProfile] {
        configuration.hosts.filter { $0.isJumpProfile != true }
    }
    // Búsqueda difusa por nombre, dirección y etiquetas (⌘K e Inicio)
    func buscarHosts(_ texto: String) -> [HostProfile] {
        connectionHosts.compactMap { host -> (HostProfile, Int)? in
            guard
                let score = TerminalText.fuzzyScore(
                    texto,
                    in: host.name + " " + host.address + " " + host.tags.joined(separator: " "))
            else { return nil }
            return (host, score)
        }.sorted { $0.1 > $1.1 }.map(\.0)
    }
    @ObservationIgnored private(set) var store: ConfigurationStore?
    @ObservationIgnored let importer = ConfigurationImportService()
    @ObservationIgnored let supervisor = ProcessSupervisor()
    @ObservationIgnored private(set) var tunnelManager: TunnelManager?
    @ObservationIgnored private(set) var runtimeRoot: URL?
    @ObservationIgnored private(set) var dataDirectory: URL?
    @ObservationIgnored private(set) var passwordStore: SSHPasswordStore?
    @ObservationIgnored private var accessImportDirectory: URL?
    @ObservationIgnored private var importPasswords: [StoredSSHPassword] = []
    @ObservationIgnored private let connectivityMonitor = ConnectivityMonitor()
    @ObservationIgnored private var tunnelTask: Task<Void, Never>?
    @ObservationIgnored private var startupTask: Task<Void, Never>?
    @ObservationIgnored private let logger = Logger(
        subsystem: "com.ori.sshmanager.native", category: "application")

    init() {
        startupTask = Task { await initialize() }
    }
    private func initialize() async {
        do {
            let override = ProcessInfo.processInfo.environment["ORI_DATA_DIRECTORY"]
            let dataURL =
                override.map { URL(fileURLWithPath: $0, isDirectory: true) }
                ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[
                    0
                ].appendingPathComponent("ORI-Native", isDirectory: true)
            dataDirectory = dataURL
            let dbPath = dataURL.appendingPathComponent("ori.sqlite").path
            let repository = try await Task.detached { try ConfigurationStore(path: dbPath) }.value
            try Task.checkCancellation()
            store = repository
            passwordStore = SSHPasswordStore(dataDirectory: dataURL)
            configuration = try await repository.load()
            var organized = configuration
            ConnectionCatalogMigration.apply(to: &organized)
            if organized != configuration {
                configuration = try await repository.replace(organized)
            }
            try Validation.configuration(configuration)
            let root = dataURL.appendingPathComponent(
                "Runtime/\(UUID().uuidString)", isDirectory: true)
            runtimeRoot = root
            tunnelManager = TunnelManager(supervisor: supervisor, runtimeRoot: root)
            if let tunnelManager {
                tunnelTask = Task { [weak self] in
                    for await values in await tunnelManager.updates() {
                        guard !Task.isCancelled else { break }
                        self?.tunnelInstances = values
                    }
                }
            }
            initialized = true
            connectivityMonitor.start { [weak self] available in
                guard let self else { return }
                if let available { self.online = available }
                self.reachability = [:]
            }
            await loadAudit()
            for profile in configuration.tunnels where profile.autoStart {
                await startTunnel(profile)
            }
        } catch {
            startupError = error.localizedDescription
            logger.error("No se pudo inicializar el almacén nativo.")
        }
    }
    func show(_ text: String, error: Bool = false) {
        message = text
        messageIsError = error
    }
    func report(_ error: any Error) {
        show(error.localizedDescription, error: true)
        diagnostics.insert(.init(kind: .ssh, message: error.localizedDescription), at: 0)
        if diagnostics.count > 100 { diagnostics.removeLast() }
        logger.error("La operación solicitada falló; detalle disponible solo en la interfaz local.")
    }
    func save(_ change: @escaping @Sendable (inout Configuration) throws -> Void) async throws {
        guard let store else {
            throw ORIError.unavailable("El almacén todavía no está disponible.")
        }
        let value = try await store.mutate(change)
        if value.revision >= configuration.revision { configuration = value }
        for session in sessions.sessions { session.apply(configuration.settings) }
    }
    func saveHost(_ host: HostProfile, connection: ConnectionProfile) async throws {
        try await save { c in
            if let i = c.hosts.firstIndex(where: { $0.id == host.id }) {
                c.hosts[i] = host
            } else {
                c.hosts.append(host)
            }
            if let i = c.connections.firstIndex(where: { $0.hostID == host.id }) {
                c.connections[i] = connection
            } else {
                c.connections.append(connection)
            }
        }
    }
    func deleteHost(_ host: HostProfile) async throws {
        guard
            !sessions.sessions.contains(where: {
                $0.host.id == host.id && $0.terminal.process.running
            })
        else {
            throw ORIError.invalid("Cierra primero las sesiones activas de este servidor.")
        }
        let linked = configuration.connections.filter {
            $0.route.hops.contains { $0.hostID == host.id }
        }
        guard linked.isEmpty else {
            throw ORIError.invalid(
                "\(linked.count) perfiles usan este servidor como salto. Cambia sus rutas antes de eliminarlo."
            )
        }
        guard
            !configuration.tunnels.contains(where: { t in
                configuration.connection(for: host.id)?.id == t.connectionID
            })
        else {
            throw ORIError.invalid("Elimina o reasigna primero sus túneles.")
        }
        try await save { c in
            c.hosts.removeAll { $0.id == host.id }
            c.connections.removeAll { $0.hostID == host.id }
            c.commands.removeAll { $0.hostID == host.id }
            for i in c.workspaces.indices { c.workspaces[i].hostIDs.removeAll { $0 == host.id } }
        }
    }
    func record(_ event: AuditEvent) {
        guard let store else { return }
        Task {
            do {
                try await store.append(event)
                await loadAudit()
            } catch { report(error) }
        }
    }
    func loadAudit() async {
        guard let store else { return }
        do { auditEvents = try await store.events() } catch { report(error) }
    }
    func connect(_ host: HostProfile) async {
        guard let connection = configuration.connection(for: host.id), let root = runtimeRoot else {
            return
        }
        operationCount += 1
        defer { operationCount -= 1 }
        let session = TerminalSessionController(
            host: host, connection: connection, configuration: configuration, root: root,
            passwordStore: passwordStore)
        session.eventHandler = { [weak self] event in self?.record(event) }
        sessions.insert(session)
        section = .terminals
        do { try session.start() } catch {
            session.model.state = .failed
            report(error)
        }
    }
    func abrirTerminalLocal() {
        guard let root = runtimeRoot else { return }
        var host = HostProfile()
        host.name = "Terminal local"
        host.address = "este Mac"
        let session = TerminalSessionController(
            host: host, connection: ConnectionProfile(hostID: host.id),
            configuration: configuration, root: root, local: true)
        sessions.insert(session)
        section = .terminals
        do { try session.start() } catch {
            session.model.state = .failed
            report(error)
        }
    }
    func startTunnel(_ profile: TunnelProfile) async {
        guard
            configuration.connections.contains(where: {
                $0.id == profile.connectionID
            }), let tunnelManager
        else { return }
        operationCount += 1
        defer { operationCount -= 1 }
        do { try await tunnelManager.start(profile, configuration: configuration) } catch {
            report(error)
        }
    }
    func stopTunnel(_ id: String) async { await tunnelManager?.stop(id) }
    func inspect(_ host: HostProfile) async {
        guard let connection = configuration.connection(for: host.id), let root = runtimeRoot else {
            return
        }
        operationCount += 1
        defer { operationCount -= 1 }
        do {
            let files = try SSHRuntimeFiles(root: root)
            defer { files.remove() }
            let plan = try SSHArgumentBuilder.build(
                connection: connection, configuration: configuration,
                configurationPath: files.configuration.path)
            try files.write(plan)
            let hops = try Validation.resolvedHops(connection, configuration: configuration)
            var endpoint = plan.firstHop
            var one = configuration
            if !hops.isEmpty { one.hosts = [endpoint] }
            let cp = hops.isEmpty ? connection : ConnectionProfile(hostID: endpoint.id)
            let firstPlan = try SSHArgumentBuilder.build(
                connection: cp, configuration: one, configurationPath: files.configuration.path)
            try files.write(firstPlan)
            let resolved = try await SSHConfigResolver().resolve(plan: firstPlan)
            if resolved.proxyCommandPresent || resolved.proxyJump != nil {
                show(
                    "El recorrido contiene un proxy definido en OpenSSH. Usa la conexión SSH; no se sondea directamente el servidor interno."
                )
                return
            }
            endpoint.address = resolved.hostname
            endpoint.port = resolved.port
            let result = await ConnectivityInspector().inspect(
                .init(host: endpoint.address, port: endpoint.port ?? 22))
            reachability[host.id] = result
            section = .diagnostics
            show(result.diagnostic)
        } catch { report(error) }
    }
    func previewImport() {
        accessImportDirectory = nil
        importPasswords = []
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json, .commaSeparatedText, .database, .data]
        panel.message =
            "Selecciona una exportación JSON/CSV o una copia del data.db original. No se sobrescribe el original."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            if url.pathExtension.lowercased() == "json" {
                let data = try Data(contentsOf: url)
                if PortableArchive.recognizes(data) {
                    guard let password = archivePassword(confirm: false) else { return }
                    Task {
                        do {
                            let payload = try await Task.detached {
                                try PortableArchive.decode(data, password: password)
                            }.value
                            var restored = payload.configuration
                            for index in restored.connections.indices {
                                restored.connections[index].useSSHConfig = false
                                restored.connections[index].knownHostsPath = nil
                                restored.connections[index].legacyAlgorithms = false
                            }
                            for index in restored.tunnels.indices {
                                restored.tunnels[index].autoStart = false
                            }
                            importPasswords = payload.passwords
                            importPreview = ImportPreview(
                                configuration: restored,
                                warnings: [
                                    "Archivo completo: \(payload.passwords.count) contraseñas incluidas. Revisa la configuración SSH local y el inicio automático de túneles antes de activarlos."
                                ])
                        } catch { report(error) }
                    }
                    return
                }
            }
            Task {
                do { importPreview = try await importer.preview(url: url) } catch { report(error) }
            }
        } catch { report(error) }
    }
    func previewAccessBastions() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.message =
            "Selecciona la carpeta Acceso bastiones que contiene datos.json. Podrás revisar los recuentos antes de importar."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        importPasswords = []
        accessImportDirectory = url
        Task {
            do {
                importPreview = try await Task.detached {
                    try AccessBastionsImporter.preview(directory: url)
                }.value
            } catch { report(error) }
        }
    }
    func commitImport() async {
        guard let preview = importPreview, let store else { return }
        do {
            let result = try await importer.merge(preview, into: store)
            configuration = result
            if let directory = accessImportDirectory {
                importPasswords = try await Task.detached {
                    try AccessBastionsImporter.passwords(directory: directory).map {
                        StoredSSHPassword(host: $0.host, password: $0.password)
                    }
                }.value
            }
            if let passwordStore {
                let passwords = matchingPasswords(importPasswords)
                try await Task.detached { try passwordStore.save(passwords) }.value
            }
            importPasswords = []
            accessImportDirectory = nil
            importPreview = nil
            await loadAudit()
            show("Configuración y contraseñas importadas.")
        } catch { report(error) }
    }
    func exportConfiguration() {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "ori-completo-cifrado.json"
        panel.allowedContentTypes = [.json]
        panel.message =
            "Incluye toda la configuración y las contraseñas. El archivo se cifra con la contraseña que elijas."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        guard let password = archivePassword(confirm: true), let passwordStore else { return }
        let config = configuration
        Task {
            do {
                let payload = PortablePayload(
                    configuration: config, passwords: matchingPasswords(try passwordStore.all()))
                try await Task.detached {
                    let bytes = try PortableArchive.encode(payload, password: password)
                    try bytes.write(to: url, options: .atomic)
                    try FileManager.default.setAttributes(
                        [.posixPermissions: 0o600], ofItemAtPath: url.path)
                }.value
                show("Archivo completo exportado: \(payload.passwords.count) contraseñas cifradas.")
            } catch { report(error) }
        }
    }

    private func matchingPasswords(_ passwords: [StoredSSHPassword]) -> [StoredSSHPassword] {
        passwords.filter { value in
            configuration.host(value.reference.hostID).map {
                SSHPasswordReference(host: $0) == value.reference
            } ?? false
        }
    }

    func importAccessPasswords() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.message =
            "Selecciona Acceso bastiones para añadir las contraseñas a los perfiles ya importados."
        guard panel.runModal() == .OK, let url = panel.url, let passwordStore else { return }
        Task {
            do {
                let values = try await Task.detached {
                    try AccessBastionsImporter.passwords(directory: url).map {
                        StoredSSHPassword(host: $0.host, password: $0.password)
                    }
                }.value
                let passwords = matchingPasswords(values)
                guard !passwords.isEmpty else {
                    throw ORIError.invalid(
                        "No hay contraseñas para los perfiles actuales en esa carpeta.")
                }
                try await Task.detached { try passwordStore.save(passwords) }.value
                show(
                    "\(passwords.count) contraseñas guardadas en el almacén propio. Reconecta para usarlas."
                )
            } catch { report(error) }
        }
    }

    private func archivePassword(confirm: Bool) -> String? {
        let alert = NSAlert()
        alert.messageText = confirm ? "Proteger el archivo completo" : "Abrir archivo cifrado"
        alert.informativeText =
            confirm
            ? "Elige al menos 12 caracteres. Necesitarás esta contraseña para recuperar conexiones y credenciales en otra instalación."
            : "Introduce la contraseña de este archivo de ORI."
        let password = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 360, height: 26))
        password.placeholderString = "Contraseña del archivo"
        let repeated = NSSecureTextField(frame: password.frame)
        repeated.placeholderString = "Repetir contraseña"
        let stack = NSStackView(views: confirm ? [password, repeated] : [password])
        stack.orientation = .vertical
        stack.spacing = 8
        stack.frame = NSRect(x: 0, y: 0, width: 360, height: confirm ? 60 : 26)
        alert.accessoryView = stack
        alert.addButton(withTitle: confirm ? "Exportar cifrado" : "Abrir")
        alert.addButton(withTitle: "Cancelar")
        alert.window.initialFirstResponder = password
        guard alert.runModal() == .alertFirstButtonReturn else { return nil }
        guard !password.stringValue.isEmpty,
            !confirm
                || (password.stringValue.count >= 12
                    && password.stringValue == repeated.stringValue)
        else {
            show("Las contraseñas deben coincidir y tener al menos 12 caracteres.", error: true)
            return nil
        }
        return password.stringValue
    }
    func exportDiagnostics() {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "ori-diagnostico-redactado.json"
        panel.allowedContentTypes = [.json]
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try ConfigurationExport.redactedReport(
                diagnostics: diagnostics + sessions.sessions.compactMap { $0.model.diagnostic },
                tunnels: tunnelInstances
            ).write(to: url, options: .atomic)
            show(
                "Informe exportado con recuentos y categorías; sin direcciones, usuarios, nombres ni logs."
            )
        } catch { report(error) }
    }
    func shutdown() async {
        startupTask?.cancel()
        await startupTask?.value
        connectivityMonitor.stop()
        await sessions.stopAll()
        await repositories.shutdown()
        await scripts.detenerTodo()
        await tunnelManager?.stopAll()
        await supervisor.stopAll()
        tunnelTask?.cancel()
        if let runtimeRoot { try? FileManager.default.removeItem(at: runtimeRoot) }
    }
}
