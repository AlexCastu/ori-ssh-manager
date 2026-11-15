import ORICore
import SwiftUI

private let ANCHO_BARRA_LATERAL: CGFloat = 220

struct RootView: View {
    @Bindable var app: AppContainer
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let palette = SectionPalette.graphite
    var body: some View {
        // Barra lateral y contenido sobre el mismo fondo, separados por una línea fina
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 24) {
                HStack(spacing: 12) {
                    Image(systemName: "terminal.fill").font(.system(size: 24, weight: .bold))
                        .foregroundStyle(palette.gradient)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("ORI").font(.system(size: 25, weight: .heavy, design: .rounded))
                        Text("INFRASTRUCTURE").font(.system(size: 9, weight: .semibold)).tracking(2)
                            .foregroundStyle(Theme.secondary)
                    }
                }.padding(.horizontal, 20).padding(.top, 20)
                ScrollView {
                    VStack(spacing: 5) {
                        ForEach(
                            AppContainer.Section.allCases.filter {
                                ![.diagnostics, .settings].contains($0)
                            }
                        ) { section in
                            navigationLabel(section)
                        }
                        DisclosureGroup("Herramientas") {
                            ForEach([AppContainer.Section.diagnostics, .settings]) {
                                section in
                                navigationLabel(section)
                            }
                        }
                    }.padding(.horizontal, 12)
                }
                VStack(alignment: .leading, spacing: 10) {
                    Label(
                        app.online ? "Red disponible" : "Red no disponible",
                        systemImage: app.online ? "wifi" : "wifi.slash"
                    )
                    .font(.caption).foregroundStyle(Theme.secondary)
                    HStack {
                        Image(systemName: "lock.shield").foregroundStyle(palette.accent)
                        Text("OpenSSH · macOS").font(.caption).foregroundStyle(Theme.secondary)
                    }
                }.padding(20)
            }.frame(width: ANCHO_BARRA_LATERAL)
            LineaDivisoria()
            VStack(spacing: 0) {
                if let startupError = app.startupError {
                    EmptyPanel(
                        title: "No se pudo abrir la configuración", subtitle: startupError,
                        icon: "externaldrive.badge.exclamationmark")
                } else if !app.initialized {
                    ProgressView("Abriendo configuración local…").frame(
                        maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    content
                }
                if let message = app.message {
                    HStack(spacing: 10) {
                        Image(
                            systemName: app.messageIsError
                                ? "exclamationmark.triangle.fill" : "info.circle.fill")
                        Text(message).font(.callout).textSelection(.enabled)
                        Spacer()
                        Button {
                            app.message = nil
                        } label: {
                            Image(systemName: "xmark")
                        }.buttonStyle(.plain).pointerStyle(.link).accessibilityLabel("Cerrar aviso")
                    }.padding(14).foregroundStyle(app.messageIsError ? Theme.error : Theme.blue)
                        .background(palette.surface).overlay(alignment: .top) { Divider() }
                }
            }.foregroundStyle(Theme.text)
        }
        .background { FondoSeccion(palette: palette) }
        .toolbarBackgroundVisibility(.hidden, for: .windowToolbar)
        .tint(palette.accent)
        // Los degradados solo funcionan con texto claro: tema oscuro siempre
        .preferredColorScheme(.dark)
        .frame(minWidth: 960, minHeight: 640)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.18), value: app.section)
        .sheet(isPresented: $app.hostEditor) { HostEditor(app: app, initial: app.editingHost) }
        .sheet(isPresented: $app.tunnelEditor) {
            TunnelEditor(app: app, initial: app.editingTunnel)
        }
        .sheet(isPresented: $app.commandPalette) { CommandPalette(app: app) }
        .sheet(
            isPresented: Binding(
                get: { app.importPreview != nil }, set: { if !$0 { app.importPreview = nil } })
        ) {
            ImportReview(app: app)
        }
        // Todos los botones sin estilo propio usan la cápsula de la app
        .buttonStyle(SecondaryButtonStyle())
        .environment(\.sectionPalette, palette)
    }
    private func navigationLabel(_ section: AppContainer.Section) -> some View {
        Button {
            app.section = section
        } label: {
            HStack(spacing: 10) {
                Image(systemName: section.icon).foregroundStyle(palette.accent).frame(
                    width: 22)
                Text(section.rawValue).foregroundStyle(Theme.text)
                Spacer(minLength: 0)
            }.font(.system(size: 14, weight: app.section == section ? .semibold : .medium))
                .padding(.horizontal, 12).padding(.vertical, 12)
                .background(
                    app.section == section ? palette.accent.opacity(0.18) : .clear,
                    in: RoundedRectangle(cornerRadius: 12)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12).stroke(
                        app.section == section ? palette.accent.opacity(0.3) : .clear)
                )
                .contentShape(Rectangle())
        }.buttonStyle(.plain).pointerStyle(.link).accessibilityIdentifier("nav-\(section.id)")
            .accessibilityValue(app.section == section ? "Seleccionado" : "")
    }
    @ViewBuilder private var content: some View {
        switch app.section {
        case .dashboard: DashboardView(app: app)
        case .hosts: HostsView(app: app)
        case .terminals: TerminalWorkspaceView(app: app)
        case .tunnels: TunnelsView(app: app)
        case .repositories: RepositoriesView(app: app)
        case .scripts: ScriptsView(app: app)
        case .diagnostics: DiagnosticsView(app: app)
        case .settings: SettingsView(app: app)
        }
    }
}

// Panel de arranque: conectar escribiendo, retomar lo abierto y ver favoritos y repos pendientes
struct DashboardView: View {
    @Bindable var app: AppContainer
    @Environment(\.sectionPalette) private var palette
    @State private var query = ""
    private var coincidencias: [HostProfile] { Array(app.buscarHosts(query).prefix(6)) }
    private var tunelesAbiertos: [TunnelInstance] {
        app.tunnelInstances.filter { [.active, .starting, .reconnecting].contains($0.state) }
    }
    private var reposPendientes: [RepositoryStatus] {
        app.repositories.repositories.filter {
            $0.dirty || $0.ahead > 0 || $0.behind > 0 || $0.error != nil
        }
    }
    private var espacioGit: RepositoryRoot? { app.configuration.repositoryRoots?.first }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                PageHeader(
                    title: "Inicio", subtitle: "Conecta, retoma lo abierto y revisa tus repos.")
                CampoBusqueda(ayuda: "Conectar a… servidor, alias o etiqueta", texto: $query)
                    .font(.system(size: 15))
                    .onSubmit { if let primero = coincidencias.first { conectar(primero) } }
                if !query.isEmpty { resultados }
                if IvantiVPN.instalado {
                    encabezado("VPN")
                    Card { PanelIvanti() }
                }
                encabezado("Abierto ahora")
                abiertoAhora
                if !app.scriptsFavoritos.isEmpty {
                    encabezado("Scripts", enlace: "Todos los scripts", destino: .scripts)
                    scriptsFavoritos
                }
                encabezado("Favoritos", enlace: "Todos los servidores", destino: .hosts)
                let favorites = app.connectionHosts.filter(\.favorite)
                if favorites.isEmpty {
                    Card {
                        Label(
                            "Marca servidores con la estrella para acceder a ellos desde aquí.",
                            systemImage: "star"
                        )
                        .foregroundStyle(Theme.secondary).padding(.vertical, 10)
                    }
                } else {
                    LazyVGrid(
                        columns: [GridItem(.adaptive(minimum: 270), spacing: 16)], spacing: 16
                    ) {
                        ForEach(favorites) { HostCard(app: app, host: $0) }
                    }
                }
                if espacioGit != nil {
                    encabezado(
                        "Repositorios pendientes", enlace: "Todos los repositorios",
                        destino: .repositories)
                    repositorios
                }
            }.padding(30)
        }
        .onAppear {
            // La lista de repos se rellena al entrar en Repositorios; si aún no se ha hecho, aquí
            if app.repositories.repositories.isEmpty, let espacioGit {
                Task { await app.repositories.scan(espacioGit) }
            }
        }
    }
    private var resultados: some View {
        Card {
            if coincidencias.isEmpty {
                Text("Ningún servidor coincide.").foregroundStyle(Theme.secondary)
            }
            ForEach(coincidencias) { host in
                HStack(spacing: 10) {
                    Image(systemName: Theme.profileIcon(host.icon))
                        .foregroundStyle(Theme.profileColor(host.color)).frame(width: 22)
                    Text(host.name).font(.callout.weight(.medium))
                    Text(host.address).font(Theme.monospaced).foregroundStyle(Theme.secondary)
                    Spacer()
                    HostConnectButton(app: app, host: host, compact: true)
                }
            }
        }
    }
    private var abiertoAhora: some View {
        Card {
            if app.sessions.sessions.isEmpty && tunelesAbiertos.isEmpty {
                Text("No hay sesiones ni túneles abiertos.").foregroundStyle(Theme.secondary)
            }
            ForEach(app.sessions.sessions) { sesion in
                HStack(spacing: 10) {
                    Image(systemName: "terminal").foregroundStyle(palette.accent).frame(width: 22)
                    Text(sesion.title).font(.callout.weight(.medium))
                    Text(sesion.host.address).font(Theme.monospaced)
                        .foregroundStyle(Theme.secondary)
                    Spacer()
                    StatusBadge(state: sesion.model.state.rawValue)
                    Button("Ir a la sesión") {
                        app.sessions.selectedID = sesion.id
                        app.section = .terminals
                    }
                }
            }
            ForEach(tunelesAbiertos) { instancia in
                let perfil = app.configuration.tunnels.first { $0.id == instancia.id }
                HStack(spacing: 10) {
                    Image(systemName: "point.3.connected.trianglepath.dotted")
                        .foregroundStyle(palette.accent).frame(width: 22)
                    Text(perfil?.name ?? "Túnel").font(.callout.weight(.medium))
                    if let perfil {
                        Text(
                            "\(perfil.bindAddress):\(perfil.listenPort) → \(perfil.destinationHost):\(perfil.destinationPort)"
                        ).font(Theme.monospaced).foregroundStyle(Theme.secondary)
                    }
                    Spacer()
                    StatusBadge(state: instancia.state.rawValue)
                    Button("Detener") { Task { await app.stopTunnel(instancia.id) } }
                }
            }
        }
    }
    // Un clic lanza el script; debajo, la última línea de su salida
    private var scriptsFavoritos: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 260), spacing: 12)], spacing: 12) {
            ForEach(app.scriptsFavoritos, id: \.self) { script in
                let ejecucion = app.scripts.ejecuciones[script]
                HStack(spacing: 10) {
                    IconoEjecucion(ejecucion: ejecucion).frame(width: 22)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(script.deletingPathExtension().lastPathComponent)
                            .font(.callout.weight(.medium)).lineLimit(1)
                        if let ultima = ejecucion?.salida.split(separator: "\n").last {
                            Text(ultima).font(.caption).foregroundStyle(Theme.secondary)
                                .lineLimit(1)
                        }
                    }.help(ejecucion?.salida ?? script.path)
                    Spacer()
                    if ejecucion?.enCurso == true {
                        Button("Detener", role: .destructive) { app.scripts.detener(script) }
                    } else {
                        Button {
                            app.scripts.ejecutar(script)
                        } label: {
                            Image(systemName: "play.fill")
                        }.buttonStyle(PrimaryButtonStyle(compact: true))
                            .accessibilityLabel("Ejecutar \(script.lastPathComponent)")
                    }
                }.padding(12).background(palette.surface, in: RoundedRectangle(cornerRadius: 12))
            }
        }
    }
    private var repositorios: some View {
        Card {
            if reposPendientes.isEmpty {
                Text(
                    app.repositories.busy
                        ? "Consultando repositorios…" : "Todo al día: sin cambios ni pulls pendientes."
                ).foregroundStyle(Theme.secondary)
            }
            ForEach(reposPendientes) { repo in
                HStack(spacing: 10) {
                    Image(
                        systemName: repo.error != nil
                            ? "exclamationmark.circle.fill" : "pencil.circle.fill"
                    )
                    .foregroundStyle(repo.error != nil ? Theme.error : Theme.warning)
                    .frame(width: 22)
                    Text(repo.name).font(.callout.weight(.medium)).help(repo.path)
                    Text(
                        repo.error
                            ?? "\(repo.branch) · \(repo.changed + repo.untracked) cambios · ↑\(repo.ahead) ↓\(repo.behind)"
                    ).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
                    Spacer()
                    BotonApp(
                        icono: IconoApp.claude, simbolo: "terminal.fill",
                        etiqueta: "Claude Code en iTerm"
                    ) {
                        do {
                            try ConsoleLauncher.openClaude(repo.path, runtimeRoot: app.runtimeRoot)
                        } catch { app.report(error) }
                    }
                    BotonApp(
                        icono: IconoApp.vscode, simbolo: "chevron.left.forwardslash.chevron.right",
                        etiqueta: "Abrir en VS Code"
                    ) {
                        do {
                            try VSCodeLauncher.open(
                                repo.path, claude: false, runtimeRoot: app.runtimeRoot)
                        } catch { app.report(error) }
                    }
                }
            }
        }
    }
    private func encabezado(
        _ titulo: String, enlace: String? = nil, destino: AppContainer.Section = .dashboard
    ) -> some View {
        HStack {
            Text(titulo).font(Theme.section)
            Spacer()
            if let enlace {
                Button(enlace) { app.section = destino }
            }
        }
    }
    private func conectar(_ host: HostProfile) {
        query = ""
        Task { await app.connect(host) }
    }
}

struct CommandPalette: View {
    @Bindable var app: AppContainer
    @State private var query = ""
    @FocusState private var focused: Bool
    private var matches: [HostProfile] { app.buscarHosts(query) }
    private var scriptsCoincidentes: [URL] {
        guard !query.isEmpty else { return app.scriptsFavoritos }
        return Array(
            app.scripts.scripts.filter {
                TerminalText.fuzzyScore(query, in: $0.deletingPathExtension().lastPathComponent)
                    != nil
            }.prefix(5))
    }
    private var muestraTerminalLocal: Bool {
        query.isEmpty || TerminalText.fuzzyScore(query, in: "terminal local") != nil
    }
    var body: some View {
        VStack(spacing: 16) {
            TextField("Buscar servidor, alias o etiqueta…", text: $query).textFieldStyle(
                .roundedBorder
            ).focused($focused)
                .onSubmit { if let first = matches.first { open(first) } }
            List {
                if muestraTerminalLocal {
                    Button {
                        app.commandPalette = false
                        app.abrirTerminalLocal()
                    } label: {
                        HStack {
                            Image(systemName: "apple.terminal")
                            Text("Terminal local")
                            Spacer()
                            Text("sin conexión").foregroundStyle(Theme.secondary)
                        }.padding(7)
                    }.buttonStyle(.plain).pointerStyle(.link)
                }
                ForEach(matches) { host in
                    Button {
                        open(host)
                    } label: {
                        HStack {
                            Image(systemName: "terminal")
                            Text(host.name)
                            Spacer()
                            Text(host.address).foregroundStyle(Theme.secondary)
                        }.padding(7)
                    }.buttonStyle(.plain).pointerStyle(.link)
                }
                ForEach(scriptsCoincidentes, id: \.self) { script in
                    Button {
                        app.commandPalette = false
                        app.scripts.ejecutar(script)
                        app.show("\(script.lastPathComponent) en marcha; su salida está en Scripts.")
                    } label: {
                        HStack {
                            Image(systemName: "scroll")
                            Text(script.deletingPathExtension().lastPathComponent)
                            Spacer()
                            Text("ejecutar script").foregroundStyle(Theme.secondary)
                        }.padding(7)
                    }.buttonStyle(.plain).pointerStyle(.link)
                }
            }.frame(height: 300)
            HStack {
                Text("↩ Conectar · Esc Cerrar").font(.caption).foregroundStyle(Theme.secondary)
                Spacer()
                Button("Cerrar") { app.commandPalette = false }.keyboardShortcut(.cancelAction)
            }
        }.padding(24).frame(width: 560).onAppear {
            focused = true
            if app.scripts.scripts.isEmpty, let carpeta = app.configuration.settings.scriptsFolder {
                app.scripts.cargar(carpeta)
            }
        }
    }
    private func open(_ host: HostProfile) {
        app.commandPalette = false
        Task { await app.connect(host) }
    }
}

struct ImportReview: View {
    @Bindable var app: AppContainer
    @State private var importing = false
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Revisar importación").font(.title2.bold())
            if let preview = app.importPreview {
                Text(
                    "\(preview.configuration.hosts.count) conexiones · \(preview.configuration.groups.count) carpetas · \(preview.configuration.commands.count) comandos · \(preview.events.count) eventos · \(preview.configuration.repositoryRoots?.count ?? 0) espacios Git"
                )
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(preview.warnings, id: \.self) {
                            Text($0).font(.callout).foregroundStyle(Theme.secondary)
                        }
                        ForEach(preview.configuration.hosts) {
                            Label($0.name, systemImage: "server.rack")
                        }
                    }
                }.frame(maxHeight: 300)
            }
            HStack {
                Button("Cancelar") { app.importPreview = nil }.keyboardShortcut(.cancelAction)
                Spacer()
                Button(importing ? "Importando…" : "Importar en la base nativa") {
                    importing = true
                    Task {
                        await app.commitImport()
                        importing = false
                    }
                }.buttonStyle(PrimaryButtonStyle(compact: true)).disabled(importing)
            }
        }.padding(28).frame(width: 600)
    }
}
