import ORICore
import SwiftUI

// === Ficheros y comandos que lee Diagnósticos ===
private let CMD_SSH_ADD = "/usr/bin/ssh-add"
private let RUTA_CONFIG_SSH = NSHomeDirectory() + "/.ssh/config"
private let RUTA_KNOWN_HOSTS = NSHomeDirectory() + "/.ssh/known_hosts"

struct SettingsView: View {
    @Bindable var app: AppContainer
    @State private var settings = AppSettings()
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            PageHeader(
                title: "Ajustes",
                subtitle:
                    "Preferencias locales. Autenticación y host keys permanecen bajo control de OpenSSH."
            )
            Form {
                Section("Terminal") {
                    Picker("Tema del terminal", selection: $settings.terminalTheme) {
                        Text("Oscuro").tag("dark")
                        Text("Claro").tag("light")
                    }
                    Stepper(
                        "Tamaño de fuente: \(Int(settings.fontSize)) pt", value: $settings.fontSize,
                        in: 10...28)
                    Picker("Cursor", selection: $settings.cursor) {
                        Text("Bloque").tag("block")
                        Text("Barra").tag("bar")
                        Text("Subrayado").tag("underline")
                    }
                    Picker("Scrollback para nuevas sesiones", selection: $settings.scrollback) {
                        Text("1.000 líneas").tag(1000)
                        Text("10.000 líneas").tag(10000)
                        Text("50.000 líneas").tag(50000)
                    }
                    Text(
                        "El terminal conserva selección, copia/pegado nativo y búsqueda. El teclado y las transcripciones no se registran. Los cambios de scrollback se aplican al abrir nuevas sesiones."
                    ).font(.caption).foregroundStyle(Theme.secondary)
                }
                Section("SSH y seguridad") {
                    LabeledContent("Transporte", value: "/usr/bin/ssh · PTY SwiftTerm")
                    LabeledContent(
                        "Host keys",
                        value: "Preguntar en terminal · exigir claves conocidas en túneles")
                    LabeledContent(
                        "Túneles automáticos",
                        value: "Claves y ssh-agent; sin contraseñas en segundo plano")
                    LabeledContent(
                        "Salida de ORI", value: "Detiene sesiones y túneles administrados")
                    Text(
                        "Cerrar la ventana conserva conexiones mientras ORI siga ejecutándose. Cerrar una pestaña explícitamente desconecta su sesión. Cada perfil controla timeout y reconexión."
                    ).font(.caption).foregroundStyle(Theme.secondary)
                }
                Section("Datos y diagnósticos") {
                    HStack {
                        Button("Importar JSON / CSV / SQLite anterior") { app.previewImport() }
                        Button("Exportar todo cifrado") { app.exportConfiguration() }
                    }
                    Button("Exportar diagnóstico redactado") { app.exportDiagnostics() }
                    Button("Importar contraseñas de Acceso bastiones") {
                        app.importAccessPasswords()
                    }
                    Text(
                        "El archivo completo incluye configuración y contraseñas cifradas con la contraseña que elijas. El diagnóstico compartible contiene solo categorías y recuentos."
                    ).font(.caption).foregroundStyle(Theme.secondary)
                }
                Section("ORI Native · 2.0.0") {
                    Text("macOS 15+ · Swift 6 · SwiftUI · AppKit · OpenSSH · SwiftTerm · GRDB")
                        .font(.caption).foregroundStyle(Theme.secondary)
                }
            }.formStyle(.grouped).scrollContentBackground(.hidden)
            HStack {
                Spacer()
                Button("Guardar preferencias") {
                    var value = settings
                    value.logCommands = false
                    let saved = value
                    Task {
                        do {
                            try await app.save { $0.settings = saved }
                            app.show("Preferencias guardadas.")
                        } catch { app.report(error) }
                    }
                }.buttonStyle(PrimaryButtonStyle())
            }
        }.padding(28).onAppear { settings = app.configuration.settings }
    }
}

struct DiagnosticsView: View {
    @Bindable var app: AppContainer
    @State private var selectedHost = ""
    @State private var clearing = false
    @State private var equipo = EstadoEquipo()
    @State private var hostComprobar = ""
    private var events: [AuditEvent] {
        app.auditEvents.filter { selectedHost.isEmpty || $0.hostID == selectedHost }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack {
                    PageHeader(
                        title: "Diagnósticos",
                        subtitle: "Errores accionables, rutas por destino y actividad local.")
                    Button("Actualizar estado") { Task { equipo = await EstadoEquipo.leer() } }
                    Button("Exportar informe redactado") { app.exportDiagnostics() }
                }
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 300), spacing: 16, alignment: .top)],
                    spacing: 16
                ) {
                    tarjetaRed
                    tarjetaSSH
                    tarjetaDatos
                }
                sesionesYTuneles
                ForEach(app.diagnostics + app.sessions.sessions.compactMap { $0.model.diagnostic })
                { diagnostic in
                    Card {
                        Label(
                            diagnostic.kind.rawValue.capitalized,
                            systemImage: "exclamationmark.triangle"
                        ).foregroundStyle(Theme.warning)
                        Text(diagnostic.message).font(.callout).textSelection(.enabled)
                        Text(diagnostic.createdAt, style: .time).font(.caption).foregroundStyle(
                            Theme.secondary)
                    }
                }
                HStack {
                    Text("Comprobar primer salto").font(Theme.section)
                    Spacer()
                    Picker("Servidor", selection: $hostComprobar) {
                        Text("Elige servidor").tag("")
                        ForEach(app.connectionHosts) { Text($0.name).tag($0.id) }
                    }.frame(maxWidth: 250)
                    Button("Comprobar") {
                        if let host = app.connectionHosts.first(where: { $0.id == hostComprobar }) {
                            Task { await app.inspect(host) }
                        }
                    }.disabled(hostComprobar.isEmpty || app.isBusy)
                }
                ForEach(app.configuration.hosts.filter { app.reachability[$0.id] != nil }) { host in
                    if let result = app.reachability[host.id] {
                        Card {
                            Text("\(host.name) · primer destino comprobado").font(Theme.section)
                            Text("\(result.target.host):\(result.target.port)").font(
                                Theme.monospaced
                            ).textSelection(.enabled)
                            Text(result.diagnostic).font(.callout).foregroundStyle(Theme.secondary)
                            Text("DNS: \(result.addresses.joined(separator: ", "))").font(
                                Theme.monospaced
                            ).textSelection(.enabled)
                            ForEach(Array(result.routes.enumerated()), id: \.offset) { _, route in
                                Text(
                                    "\(route.address) → \(route.interface ?? "sin interfaz") · gateway \(route.gateway ?? "sin dato")"
                                ).font(Theme.monospaced).textSelection(.enabled)
                            }
                            Text("Comprobado: \(result.checkedAt.formatted())").font(.caption)
                                .foregroundStyle(Theme.secondary)
                        }
                    }
                }
                HStack {
                    Text("Registro local").font(Theme.section)
                    Spacer()
                    Picker("Servidor", selection: $selectedHost) {
                        Text("Todos").tag("")
                        ForEach(app.configuration.hosts) { Text($0.name).tag($0.id) }
                    }.frame(maxWidth: 250)
                    Button("Actualizar") { Task { await app.loadAudit() } }
                    Button("Exportar registro local") { exportAudit() }
                    Button("Borrar registro", role: .destructive) { clearing = true }
                }
                Card {
                    if events.isEmpty {
                        Text(
                            "Sin eventos. Puedes diagnosticar el primer salto desde las acciones de un servidor."
                        ).foregroundStyle(Theme.secondary)
                    }
                    ForEach(events) { event in
                        HStack(alignment: .top) {
                            Text(event.createdAt.formatted(date: .abbreviated, time: .standard))
                                .font(.caption).foregroundStyle(Theme.secondary).frame(
                                    width: 170, alignment: .leading)
                            Text(event.hostID.flatMap { app.configuration.host($0)?.name } ?? "—")
                                .font(.callout.weight(.medium)).lineLimit(1)
                                .frame(width: 160, alignment: .leading)
                            Text(event.message).font(
                                event.kind == "command" ? Theme.monospaced : .callout
                            ).textSelection(.enabled)
                        }.padding(.vertical, 5)
                    }
                }
            }.padding(28)
        }
        .task { equipo = await EstadoEquipo.leer() }
        .confirmationDialog("Borrar registro local seleccionado", isPresented: $clearing) {
            Button("Borrar registro", role: .destructive) {
                Task {
                    do {
                        try await app.store?.clearEvents(
                            hostID: selectedHost.isEmpty ? nil : selectedHost)
                        await app.loadAudit()
                    } catch { app.report(error) }
                }
            }
        }
    }
    private var tarjetaRed: some View {
        Card {
            Label("Red y VPN", systemImage: "network").font(Theme.section)
            fila("Conectividad", app.online ? "Red disponible" : "Sin red")
            ForEach(equipo.interfaces) { interfaz in
                fila(interfaz.name, interfaz.addresses.filter { !$0.contains(":") }.joined(separator: ", "))
            }
            if equipo.vpns.isEmpty { fila("VPN", "Ninguna configurada en macOS") }
            ForEach(equipo.vpns) { vpn in
                HStack {
                    Text(vpn.name).font(.callout)
                    Spacer()
                    StatusBadge(state: vpn.state.rawValue)
                }
            }
            if IvantiVPN.instalado {
                Divider()
                PanelIvanti()
            }
        }
    }
    private var tarjetaSSH: some View {
        Card {
            Label("OpenSSH", systemImage: "lock.shield").font(Theme.section)
            fila("Versión", equipo.versionSSH)
            fila("ssh-agent", equipo.agente)
            fila("~/.ssh/config", equipo.bloquesHost.map { "\($0) bloques Host" } ?? "No existe")
            fila("known_hosts", equipo.hostsConocidos.map { "\($0) entradas" } ?? "No existe")
        }
    }
    private var tarjetaDatos: some View {
        Card {
            Label("Datos de ORI", systemImage: "externaldrive").font(Theme.section)
            fila(
                "Versión",
                Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
                    ?? "—")
            fila(
                "Conexiones",
                "\(app.connectionHosts.count) · \(app.configuration.hosts.count - app.connectionHosts.count) bastiones"
            )
            fila(
                "Carpetas · túneles",
                "\(app.configuration.groups.count) · \(app.configuration.tunnels.count)")
            fila("Espacios Git", "\(app.configuration.repositoryRoots?.count ?? 0)")
            fila("Base de datos", tamanoBase)
            if let ruta = app.dataDirectory?.path {
                Text(ruta).font(Theme.monospaced).foregroundStyle(Theme.secondary)
                    .textSelection(.enabled)
            }
        }
    }
    private var sesionesYTuneles: some View {
        Card {
            Label("Sesiones y túneles", systemImage: "point.3.connected.trianglepath.dotted")
                .font(Theme.section)
            if app.sessions.sessions.isEmpty && app.tunnelInstances.isEmpty {
                Text("Nada abierto ahora mismo.").foregroundStyle(Theme.secondary)
            }
            ForEach(app.sessions.sessions) { sesion in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(sesion.title).font(.callout.weight(.medium))
                        Text(sesion.host.address).font(Theme.monospaced)
                            .foregroundStyle(Theme.secondary)
                        Spacer()
                        StatusBadge(state: sesion.model.state.rawValue)
                    }
                    if let error = sesion.model.diagnostic {
                        Text(error.message).font(.caption).foregroundStyle(Theme.error)
                            .textSelection(.enabled)
                    }
                }
            }
            ForEach(app.tunnelInstances) { tunel in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(app.configuration.tunnels.first { $0.id == tunel.id }?.name ?? "Túnel")
                            .font(.callout.weight(.medium))
                        Spacer()
                        StatusBadge(state: tunel.state.rawValue)
                    }
                    Text(detalleTunel(tunel)).font(.caption).foregroundStyle(Theme.secondary)
                    if let error = tunel.lastError {
                        Text(error.message).font(.caption).foregroundStyle(Theme.error)
                            .textSelection(.enabled)
                    }
                }
            }
        }
    }
    private var tamanoBase: String {
        guard let ruta = app.dataDirectory?.appendingPathComponent("ori.sqlite").path,
            let bytes = try? FileManager.default.attributesOfItem(atPath: ruta)[.size] as? Int64
        else { return "—" }
        return ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }
    private func detalleTunel(_ tunel: TunnelInstance) -> String {
        var partes = [
            tunel.authenticated ? "SSH autenticado" : "SSH sin autenticar",
            tunel.forwardingEstablished ? "reenvío confirmado" : "reenvío sin confirmar",
            "\(tunel.attempts) intentos",
        ]
        if let desde = tunel.startedAt {
            partes.append("desde \(desde.formatted(date: .omitted, time: .shortened))")
        }
        return partes.joined(separator: " · ")
    }
    private func fila(_ titulo: String, _ valor: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(titulo).font(.callout).foregroundStyle(Theme.secondary)
            Spacer()
            Text(valor).font(.callout.weight(.medium)).multilineTextAlignment(.trailing)
                .textSelection(.enabled)
        }
    }
    private func exportAudit() {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "ori-registro-local.json"
        panel.message =
            "Registro local sin redactar. Puede contener información corporativa y comandos históricos. No se trata del informe compartible."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        let hostID = selectedHost.isEmpty ? nil : selectedHost
        Task {
            do {
                guard let store = app.store else { return }
                let completeEvents = try await store.events(hostID: hostID, limit: nil)
                try await Task.detached {
                    let encoder = JSONEncoder()
                    encoder.outputFormatting = [.prettyPrinted]
                    try encoder.encode(completeEvents).write(to: url, options: .atomic)
                    try FileManager.default.setAttributes(
                        [.posixPermissions: 0o600], ofItemAtPath: url.path)
                }.value
                app.show(
                    "Registro completo exportado. La lista visible muestra hasta 1.000 eventos recientes."
                )
            } catch { app.report(error) }
        }
    }
}

// Foto del Mac para diagnosticar: interfaces, VPN y estado de OpenSSH
struct EstadoEquipo {
    var interfaces: [InterfaceObservation] = []
    var vpns: [SystemVPNService] = []
    var versionSSH = "—"
    var agente = "—"
    var bloquesHost: Int?
    var hostsConocidos: Int?

    static func leer() async -> EstadoEquipo {
        var estado = EstadoEquipo()
        estado.interfaces = InterfaceInspector().interfaces().filter { interfaz in
            interfaz.isUp && interfaz.name != "lo0" && interfaz.addresses.contains { !$0.contains(":") }
        }
        estado.vpns = await SystemVPNDetector().services()
        let runner = SystemCommandRunner()
        // Sin ssh o sin agente se queda en "—": es justo lo que hay que ver aquí
        if let salida = try? await runner.run(SSHArgumentBuilder.executable, ["-V"]) {
            estado.versionSSH = salida.output.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let salida = try? await runner.run(CMD_SSH_ADD, ["-l"]) {
            estado.agente =
                switch salida.status {
                case 0: "\(salida.output.split(separator: "\n").count) claves cargadas"
                case 1: "Activo, sin claves"
                default: "No disponible"
                }
        }
        estado.bloquesHost = contarLineas(RUTA_CONFIG_SSH) { $0.hasPrefix("Host ") }
        estado.hostsConocidos = contarLineas(RUTA_KNOWN_HOSTS) { !$0.isEmpty && !$0.hasPrefix("#") }
        return estado
    }
    // nil si el fichero no existe
    private static func contarLineas(_ ruta: String, _ cuenta: (String) -> Bool) -> Int? {
        guard let texto = try? String(contentsOfFile: ruta, encoding: .utf8) else { return nil }
        return texto.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }
            .filter(cuenta).count
    }
}
