import ORICore
import SwiftUI

struct TunnelsView: View {
    @Bindable var app: AppContainer
    @State private var mode = "jumps"
    var body: some View {
        VStack(spacing: 0) {
            Picker("Configurar", selection: $mode) {
                Text("Máquinas de salto").tag("jumps")
                Text("Reenvíos de puertos").tag("forwards")
            }.pickerStyle(.segmented).frame(maxWidth: 430).padding(.top, 20)
            if mode == "jumps" { JumpHostsView(app: app) } else { PortForwardingView(app: app) }
        }
    }
}

private struct JumpHostsView: View {
    @Bindable var app: AppContainer
    @Environment(\.sectionPalette) private var palette
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                PageHeader(
                    title: "Máquinas de salto",
                    subtitle:
                        "Configura RIMA, THROW y tus pasarelas una vez. Después selecciónalas en Conexiones."
                )
                Button {
                    var host = HostProfile()
                    host.isJumpProfile = true
                    host.usableAsJump = true
                    host.authentication = .interactive
                    host.color = "blue"
                    app.editingHost = host
                    app.hostEditor = true
                } label: {
                    Label("Nuevo salto", systemImage: "plus")
                }.buttonStyle(PrimaryButtonStyle())
            }
            if app.configuration.jumpHosts.isEmpty {
                EmptyPanel(
                    title: "Define el primer salto",
                    subtitle:
                        "Añade nombre, dirección y usuario. Las conexiones usarán este perfil guardado.",
                    icon: "arrow.triangle.branch")
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(
                            app.configuration.jumpHosts.sorted {
                                $0.name.localizedStandardCompare($1.name) == .orderedAscending
                            }
                        ) { host in
                            HStack(spacing: 16) {
                                Image(systemName: "arrow.triangle.branch").font(.title2)
                                    .foregroundStyle(palette.accent)
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(host.name).font(.headline)
                                    Text(
                                        (host.username.isEmpty ? "" : host.username + "@")
                                            + host.address + (host.port.map { ":\($0)" } ?? "")
                                    )
                                    .font(Theme.monospaced).foregroundStyle(Theme.secondary)
                                }
                                Spacer()
                                let uses = app.configuration.connections.filter {
                                    $0.route.hops.contains { $0.hostID == host.id }
                                }.count
                                Text("\(uses) conexiones").font(.caption).foregroundStyle(
                                    Theme.secondary)
                                Button("Editar") {
                                    app.editingHost = host
                                    app.hostEditor = true
                                }
                                HostConnectButton(app: app, host: host, compact: true)
                                HostActionsMenu(app: app, host: host)
                            }.padding(16).background(
                                palette.surface, in: RoundedRectangle(cornerRadius: 12))
                        }
                    }
                }
            }
        }.padding(28)
    }
}

struct PortForwardingView: View {
    @Bindable var app: AppContainer
    @Environment(\.sectionPalette) private var palette
    @State private var deleting: TunnelProfile?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack {
                    PageHeader(
                        title: "Reenvíos de puertos",
                        subtitle:
                            "Reenvíos independientes de las terminales, bajo supervisión de OpenSSH."
                    )
                    Button {
                        app.editingTunnel = nil
                        app.tunnelEditor = true
                    } label: {
                        Label("Nuevo túnel", systemImage: "plus")
                    }.buttonStyle(PrimaryButtonStyle()).disabled(
                        app.configuration.connections.isEmpty)
                }
                if app.configuration.tunnels.isEmpty {
                    EmptyPanel(
                        title: "Abre un camino a tus servicios",
                        subtitle:
                            "Crea un servidor y configura un reenvío local, remoto o un proxy SOCKS. La escucha usa loopback por defecto.",
                        icon: "point.3.connected.trianglepath.dotted")
                }
                ForEach(app.configuration.tunnels) { profile in
                    let instance =
                        app.tunnelInstances.first { $0.id == profile.id }
                        ?? TunnelInstance(id: profile.id)
                    Card {
                        HStack(alignment: .top) {
                            Image(
                                systemName: profile.kind == .dynamic
                                    ? "network" : "arrow.left.arrow.right"
                            ).font(.title).foregroundStyle(palette.accent)
                            VStack(alignment: .leading, spacing: 6) {
                                Text(profile.name).font(Theme.section)
                                Text(
                                    "\(profile.kind.rawValue.uppercased()) · \(profile.bindAddress):\(profile.listenPort)"
                                        + (profile.kind == .dynamic
                                            ? " · SOCKS"
                                            : " → \(profile.destinationHost):\(profile.destinationPort)")
                                )
                                .font(Theme.monospaced).foregroundStyle(Theme.secondary)
                                .textSelection(.enabled)
                                if let connection = app.configuration.connections.first(where: {
                                    $0.id == profile.connectionID
                                }), let host = app.configuration.host(connection.hostID) {
                                    Text(
                                        "SSH: \(host.name) · \(connection.route.hops.count) saltos"
                                    ).font(.caption).foregroundStyle(Theme.secondary)
                                }
                            }
                            Spacer()
                            StatusBadge(state: instance.state.rawValue)
                        }
                        HStack(spacing: 18) {
                            Label(
                                instance.authenticated ? "Autenticado" : "Sin autenticar",
                                systemImage: instance.authenticated ? "checkmark.circle" : "circle")
                            Label(
                                instance.forwardingEstablished
                                    ? "Reenvío confirmado por SSH" : "Reenvío sin confirmar",
                                systemImage: "arrow.left.arrow.right")
                            if let health = instance.serviceReachable {
                                Label(
                                    health
                                        ? "Objetivo TCP accesible" : "Objetivo TCP sin respuesta",
                                    systemImage: health
                                        ? "checkmark.circle.fill" : "exclamationmark.circle")
                            } else {
                                Text("Objetivo TCP: no comprobado")
                            }
                        }.font(.caption).foregroundStyle(Theme.secondary).padding(.vertical, 12)
                        if let date = instance.startedAt {
                            Text(
                                "Iniciado \(date.formatted(date: .omitted, time: .shortened)) · reintentos: \(instance.attempts)"
                            ).font(.caption).foregroundStyle(Theme.secondary)
                        }
                        if let error = instance.lastError {
                            Text(error.message).foregroundStyle(Theme.error).font(.callout)
                                .textSelection(.enabled)
                        }
                        if profile.kind == .remote {
                            Text(
                                "El listener remoto depende de GatewayPorts y los permisos del servidor. Una sonda local no prueba ese listener."
                            ).font(.caption).foregroundStyle(Theme.warning)
                        }
                        if !["127.0.0.1", "::1"].contains(profile.bindAddress) {
                            Text(
                                "La escucha configurada puede quedar accesible desde otros equipos. Revisa la dirección antes de iniciar."
                            )
                            .font(.caption).foregroundStyle(Theme.warning)
                        }
                        HStack {
                            if [.active, .starting, .reconnecting].contains(instance.state) {
                                Button("Detener") { Task { await app.stopTunnel(profile.id) } }
                                Button("Reiniciar") {
                                    Task {
                                        await app.stopTunnel(profile.id)
                                        await app.startTunnel(profile)
                                    }
                                }
                            } else {
                                Button("Iniciar") { Task { await app.startTunnel(profile) } }
                                    .buttonStyle(PrimaryButtonStyle()).disabled(
                                        app.isBusy || instance.state == .stopping)
                            }
                            if profile.healthTarget != nil {
                                Button("Probar objetivo TCP") {
                                    Task {
                                        do {
                                            try await app.tunnelManager?.checkService(profile.id)
                                        } catch { app.report(error) }
                                    }
                                }.disabled(instance.state != .active)
                            }
                            Spacer()
                            Button("Editar") {
                                app.editingTunnel = profile
                                app.tunnelEditor = true
                            }.disabled(
                                [.active, .starting, .reconnecting, .stopping].contains(
                                    instance.state))
                            Button("Eliminar", role: .destructive) { deleting = profile }
                        }.padding(.top, 8)
                    }
                }
            }.padding(28)
        }
        .confirmationDialog(
            "Eliminar túnel",
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })
        ) {
            Button("Detener y eliminar", role: .destructive) {
                guard let profile = deleting else { return }
                deleting = nil
                Task {
                    await app.stopTunnel(profile.id)
                    do {
                        try await app.save { c in
                            c.tunnels.removeAll { $0.id == profile.id }
                            for i in c.workspaces.indices {
                                c.workspaces[i].tunnelIDs.removeAll { $0 == profile.id }
                            }
                        }
                    } catch { app.report(error) }
                }
            }
        }
    }
}

struct TunnelEditor: View {
    @Bindable var app: AppContainer
    @Environment(\.dismiss) private var dismiss
    @State private var profile: TunnelProfile
    @State private var listenPort: String
    @State private var targetPort: String
    @State private var healthHost: String
    @State private var healthPort: String
    @State private var error: String?
    @State private var saving = false
    @State private var exposureAccepted = false
    init(app: AppContainer, initial: TunnelProfile?) {
        self.app = app
        var profile = initial ?? TunnelProfile()
        if profile.connectionID.isEmpty {
            profile.connectionID = app.configuration.connections.first?.id ?? ""
        }
        _profile = State(initialValue: profile)
        _listenPort = State(initialValue: String(profile.listenPort))
        _targetPort = State(initialValue: String(profile.destinationPort))
        _healthHost = State(initialValue: profile.healthTarget?.host ?? "")
        _healthPort = State(initialValue: profile.healthTarget.map { String($0.port) } ?? "")
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Perfil de túnel").font(.title2.bold())
            Form {
                TextField("Nombre", text: $profile.name)
                Picker("Conexión SSH", selection: $profile.connectionID) {
                    ForEach(app.configuration.connections) { cp in
                        Text(app.configuration.host(cp.hostID)?.name ?? cp.hostID).tag(cp.id)
                    }
                }
                Picker("Tipo", selection: $profile.kind) {
                    Text("Local · -L").tag(TunnelKind.local)
                    Text("Remoto · -R").tag(TunnelKind.remote)
                    Text("Dinámico / SOCKS · -D").tag(TunnelKind.dynamic)
                }
                TextField(
                    profile.kind == .remote
                        ? "Dirección de escucha remota" : "Dirección de escucha local",
                    text: $profile.bindAddress)
                TextField("Puerto de escucha", text: $listenPort)
                if profile.kind != .dynamic {
                    TextField(
                        profile.kind == .local
                            ? "Destino visto desde el servidor SSH"
                            : "Destino visto desde este Mac", text: $profile.destinationHost)
                    TextField("Puerto de destino", text: $targetPort)
                }
                if !["127.0.0.1", "::1"].contains(profile.bindAddress) {
                    Toggle(
                        "Entiendo que la escucha puede quedar expuesta a otros equipos",
                        isOn: $exposureAccepted
                    ).foregroundStyle(.orange)
                }
                Toggle(
                    "Inicio automático al abrir ORI (solo claves/agente)", isOn: $profile.autoStart)
                Toggle("Reconexión limitada con backoff y jitter", isOn: $profile.reconnect.enabled)
                if profile.reconnect.enabled {
                    Stepper(
                        "Máximo \(profile.reconnect.maxAttempts) intentos",
                        value: $profile.reconnect.maxAttempts, in: 1...20)
                }
                Section("Sonda de servicio opcional desde este Mac") {
                    TextField("Host autorizado (vacío: desactivada)", text: $healthHost)
                    TextField("Puerto", text: $healthPort)
                    Text(
                        "Esta sonda confirma un puerto TCP, no la salud del servicio. Probar el listener local no demuestra que el destino remoto funcione."
                    ).font(.caption).foregroundStyle(Theme.secondary)
                }
                Text(
                    "Los túneles usan BatchMode=yes. Prepara la clave en ssh-agent y verifica antes las host keys mediante una terminal. No se solicita ni almacena una contraseña en segundo plano."
                ).font(.caption).foregroundStyle(Theme.secondary)
            }.formStyle(.grouped).frame(height: 500)
            if let error { Text(error).foregroundStyle(.red) }
            HStack {
                Button("Cancelar") { dismiss() }.keyboardShortcut(.cancelAction).disabled(saving)
                Spacer()
                Button("Guardar túnel") { save() }.keyboardShortcut(.defaultAction).buttonStyle(PrimaryButtonStyle(compact: true)).disabled(saving)
            }
        }.padding(24).frame(width: 660).interactiveDismissDisabled(saving)
    }
    private func save() {
        do {
            guard let listen = Int(listenPort) else {
                throw ORIError.invalid("Puerto de escucha no numérico.")
            }
            profile.listenPort = listen
            if profile.kind != .dynamic {
                guard let destination = Int(targetPort) else {
                    throw ORIError.invalid("Puerto de destino no numérico.")
                }
                profile.destinationPort = destination
            }
            if !healthHost.isEmpty {
                guard let port = Int(healthPort) else {
                    throw ORIError.invalid("Puerto de salud no numérico.")
                }
                profile.healthTarget = .init(host: healthHost, port: port)
            } else {
                profile.healthTarget = nil
            }
            guard ["127.0.0.1", "::1"].contains(profile.bindAddress) || exposureAccepted else {
                throw ORIError.invalid("Confirma la exposición de la dirección de escucha.")
            }
            try Validation.tunnel(profile)
            let value = profile
            saving = true
            Task {
                do {
                    try await app.save { c in
                        if let i = c.tunnels.firstIndex(where: { $0.id == value.id }) {
                            c.tunnels[i] = value
                        } else {
                            c.tunnels.append(value)
                        }
                    }
                    dismiss()
                } catch { self.error = error.localizedDescription }
                saving = false
            }
        } catch { self.error = error.localizedDescription }
    }
}
