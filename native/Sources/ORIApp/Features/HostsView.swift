import AppKit
import ORICore
import SwiftUI

struct HostsView: View {
    @Bindable var app: AppContainer
    @Environment(\.sectionPalette) private var palette
    @State private var groupsOpen = false
    private var filtered: [HostProfile] {
        app.connectionHosts.filter { host in
            (!app.conexiones.favoritesOnly || host.favorite)
                && belongsToSelectedGroup(host)
                && (app.conexiones.tag.isEmpty || host.tags.contains(app.conexiones.tag))
                && (app.conexiones.query.isEmpty
                    || (host.name + " " + host.address + " " + host.username + " "
                        + host.tags.joined(separator: " ")).localizedCaseInsensitiveContains(app.conexiones.query))
        }.sorted { a, b in
            let orden = app.configuration.settings.ordenConexiones
            if orden == "nombre" { return a.name.localizedStandardCompare(b.name) == .orderedAscending }
            let manual = app.configuration.organization?.hostOrder ?? []
            let clave = { (host: HostProfile) in
                (
                    orden == "favoritos" && host.favorite ? 0 : 1,
                    manual.firstIndex(of: host.id) ?? Int.max, host.name.localizedLowercase
                )
            }
            return clave(a) < clave(b)
        }
    }
    var body: some View {
        VStack(spacing: 16) {
            HStack(spacing: 16) {
                Text("Conexiones").font(Theme.title)
                Spacer()
                Picker("Vista", selection: $app.conexiones.viewMode) {
                    Text("Filas").tag("rows")
                    Text("Diagrama").tag("map")
                }.pickerStyle(.segmented).frame(width: 190)
                Button {
                    var host = HostProfile()
                    host.groupID = app.configuration.groups.first { $0.id == app.conexiones.groupID }?.id
                    app.editingHost = host
                    app.hostEditor = true
                } label: {
                    Label("Nueva conexión", systemImage: "plus")
                }.buttonStyle(PrimaryButtonStyle())
            }
            HStack(spacing: 12) {
                CampoBusqueda(ayuda: "Buscar servidor o etiqueta", texto: $app.conexiones.query)
                    .frame(maxWidth: 300)
                Picker("Etiqueta", selection: $app.conexiones.tag) {
                    Text("Todas").tag("")
                    ForEach(
                        Array(Set(app.configuration.hosts.flatMap(\.tags))).sorted(), id: \.self
                    ) { Text($0).tag($0) }
                }.frame(maxWidth: 180)
                Button {
                    app.conexiones.favoritesOnly.toggle()
                } label: {
                    Image(systemName: app.conexiones.favoritesOnly ? "star.fill" : "star")
                }.buttonStyle(SecondaryButtonStyle(activo: app.conexiones.favoritesOnly))
                    .help("Solo favoritos").accessibilityLabel("Solo favoritos")
                    .accessibilityAddTraits(app.conexiones.favoritesOnly ? .isSelected : [])
                Picker(
                    "Orden",
                    selection: Binding(
                        get: { app.configuration.settings.ordenConexiones ?? "manual" },
                        set: { guardarOrden($0 == "manual" ? nil : $0) })
                ) {
                    Text("Manual (arrastrar)").tag("manual")
                    Text("Por nombre").tag("nombre")
                    Text("Favoritos primero").tag("favoritos")
                }.frame(maxWidth: 230)
                Spacer()
                Button {
                    groupsOpen = true
                } label: {
                    Image(systemName: "folder.badge.gearshape")
                }.help("Gestionar carpetas").accessibilityLabel("Gestionar carpetas")
                Menu("Importar") {
                    Button("Configuración ORI / CSV / SQLite") { app.previewImport() }
                    Button("Acceso bastiones…") { app.previewAccessBastions() }
                }.menuStyle(.borderlessButton).pointerStyle(.link).fixedSize()
                    .foregroundStyle(Theme.text).capsulaControl()
                Button {
                    app.exportConfiguration()
                } label: {
                    Image(systemName: "square.and.arrow.up")
                }.help("Exportar todo cifrado").accessibilityLabel("Exportar todo cifrado")
            }
            HSplitView {
                ConnectionFolderTree(app: app, selection: app.conexiones.groupID, selectGroup: selectFolder)
                    .frame(minWidth: 190, idealWidth: 230, maxWidth: 320)
                VStack(alignment: .leading, spacing: 12) { results }
                    .padding(.leading, 14).frame(minWidth: 470)
            }
        }.padding(24).sheet(isPresented: $groupsOpen) { GroupManagerView(app: app) }
            .onAppear { openRequestedDiagram() }
            .onChange(of: app.diagramHostID) { openRequestedDiagram() }
    }
    @ViewBuilder private var results: some View {
        if filtered.isEmpty {
            EmptyPanel(
                title: app.connectionHosts.isEmpty
                    ? "Tu primera conexión"
                    : (app.conexiones.groupID.isEmpty ? "Sin coincidencias" : "Carpeta vacía"),
                subtitle:
                    "Añade un servidor o importa tu configuración anterior. No se crean conexiones de ejemplo.",
                icon: "server.rack")
        } else if app.conexiones.viewMode == "map" {
            Picker(
                "Destino",
                selection: Binding(
                    get: {
                        filtered.contains(where: { $0.id == app.conexiones.selectedHostID })
                            ? app.conexiones.selectedHostID : filtered.first?.id ?? ""
                    },
                    set: { app.conexiones.selectedHostID = $0 }
                )
            ) {
                ForEach(filtered) { Text($0.name).tag($0.id) }
            }.frame(maxWidth: 420, alignment: .leading)
            if let host = filtered.first(where: { $0.id == app.conexiones.selectedHostID }) ?? filtered.first {
                ConnectionDiagramView(app: app, host: host).id(host.id)
            }
        } else {
            HostRowsView(app: app, hosts: filtered) { hostID, target in
                move(hostID, to: target.groupID, before: target.id)
            }
        }
    }
    private func openRequestedDiagram() {
        guard let id = app.diagramHostID else { return }
        app.conexiones.selectedHostID = id
        app.conexiones.viewMode = "map"
        app.conexiones.groupID = ""
        app.conexiones.query = ""
        app.conexiones.tag = ""
        app.conexiones.favoritesOnly = false
        app.diagramHostID = nil
    }
    private func belongsToSelectedGroup(_ host: HostProfile) -> Bool {
        if app.conexiones.groupID.isEmpty { return true }
        if app.conexiones.groupID == "ungrouped" { return host.groupID == nil }
        let ids = ConnectionOrganizer.descendantGroupIDs(of: app.conexiones.groupID, in: app.configuration)
        return host.groupID.map(ids.contains) ?? false
    }
    private func selectFolder(_ id: String) {
        app.conexiones.groupID = id
        app.conexiones.query = ""
        app.conexiones.tag = ""
        app.conexiones.favoritesOnly = false
        app.conexiones.viewMode = "rows"
        app.conexiones.selectedHostID = ""
    }
    private func move(_ hostID: String, to groupID: String?, before targetID: String? = nil) {
        Task {
            do {
                try await app.save {
                    try ConnectionOrganizer.moveHost(hostID, to: groupID, before: targetID, in: &$0)
                    // Arrastrar es ordenar a mano: por nombre no se vería el cambio
                    if $0.settings.ordenConexiones == "nombre" { $0.settings.ordenConexiones = nil }
                }
            } catch { app.report(error) }
        }
    }
    private func guardarOrden(_ orden: String?) {
        Task {
            do { try await app.save { $0.settings.ordenConexiones = orden } } catch {
                app.report(error)
            }
        }
    }

}

struct HostCard: View {
    @Bindable var app: AppContainer
    let host: HostProfile
    var body: some View {
        Card {
            HStack(alignment: .top, spacing: 12) {
                Image(
                    systemName: host.usableAsJump
                        ? "arrow.triangle.branch" : Theme.profileIcon(host.icon)
                )
                .font(.title2).foregroundStyle(Theme.profileColor(host.color)).frame(
                    width: 42, height: 44
                ).background(
                    Theme.profileColor(host.color).opacity(0.1),
                    in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 5) {
                    Text(host.name).font(.system(size: 16, weight: .semibold)).lineLimit(2)
                    Text(
                        (host.username.isEmpty ? "" : host.username + "@") + host.address
                            + (host.port.map { ":\($0)" } ?? "")
                    )
                    .font(Theme.monospaced).foregroundStyle(Theme.secondary).textSelection(.enabled)
                    .lineLimit(2)
                }
                Spacer(minLength: 0)
                HostFavoriteButton(app: app, host: host)
            }
            if let connection = app.configuration.connection(for: host.id) {
                HStack {
                    Label(
                        connection.route.hops.isEmpty
                            ? "Directo / configuración SSH"
                            : "\(connection.route.hops.count) saltos",
                        systemImage: "point.topleft.down.to.point.bottomright.curvepath")
                    Spacer()
                }.font(.caption).foregroundStyle(Theme.secondary).padding(.vertical, 8)
            }
            if !host.tags.isEmpty {
                Text(host.tags.map { "#" + $0 }.joined(separator: "  ")).font(.caption)
                    .foregroundStyle(Theme.pink).lineLimit(2)
            }
            if let group = app.configuration.groups.first(where: { $0.id == host.groupID }) {
                Label(group.name, systemImage: "folder").font(.caption).foregroundStyle(
                    Theme.secondary)
            }
            if !host.notes.isEmpty {
                Text(host.notes).font(.caption).foregroundStyle(Theme.secondary).lineLimit(2).help(
                    host.notes)
            }
            HStack {
                HostConnectButton(app: app, host: host)
                Spacer()
                HostActionsMenu(app: app, host: host)
            }.padding(.top, 8)
        }
    }
}

struct HostEditor: View {
    @Bindable var app: AppContainer
    @Environment(\.dismiss) private var dismiss
    @State private var host: HostProfile
    @State private var connection: ConnectionProfile
    @State private var portText: String
    @State private var tagText: String
    @State private var error: String?
    @State private var saving = false
    @State private var password = ""
    @State private var hasPassword = false
    @State private var pestana = "conexion"
    @Environment(\.sectionPalette) private var palette
    private var isJump: Bool { host.isJumpProfile == true }
    init(app: AppContainer, initial: HostProfile?) {
        self.app = app
        let host = initial ?? HostProfile()
        _host = State(initialValue: host)
        _connection = State(
            initialValue: app.configuration.connection(for: host.id)
                ?? ConnectionProfile(hostID: host.id))
        _portText = State(initialValue: host.port.map(String.init) ?? "")
        _tagText = State(initialValue: host.tags.joined(separator: ", "))
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            cabecera
            Picker("Sección", selection: $pestana) {
                Text("Conexión").tag("conexion")
                if !isJump { Text("Saltos").tag("saltos") }
                Text("Organizar").tag("organizar")
            }.pickerStyle(.segmented).labelsHidden()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    switch pestana {
                    case "saltos": saltos
                    case "organizar": organizar
                    default: conexion
                    }
                }.padding(.vertical, 4).padding(.trailing, 6).toggleStyle(.switch)
            }.frame(height: 440)
            if let error {
                Text(error).font(.callout).foregroundStyle(Theme.error).textSelection(.enabled)
            }
            HStack {
                Button("Cancelar") { dismiss() }.keyboardShortcut(.cancelAction).disabled(saving)
                Spacer()
                Button(saving ? "Guardando…" : (isJump ? "Guardar salto" : "Guardar conexión")) {
                    save()
                }.keyboardShortcut(
                    .defaultAction
                ).buttonStyle(PrimaryButtonStyle(compact: true)).disabled(saving)
            }
        }.padding(24).frame(width: 660).foregroundStyle(Theme.text)
            .background { FondoSeccion(palette: palette) }
            .interactiveDismissDisabled(saving)
            .task {
                if let store = app.passwordStore {
                    hasPassword =
                        (try? store.password(for: SSHPasswordReference(host: host))) != nil
                }
            }
    }
    // Icono y color del perfil en vivo, para ver cómo quedará en la lista
    private var cabecera: some View {
        HStack(spacing: 14) {
            Image(systemName: isJump ? "arrow.triangle.branch" : Theme.profileIcon(host.icon))
                .font(.system(size: 22)).foregroundStyle(Theme.profileColor(host.color))
                .frame(width: 50, height: 50)
                .background(
                    Theme.profileColor(host.color).opacity(0.16),
                    in: RoundedRectangle(cornerRadius: 13))
            VStack(alignment: .leading, spacing: 3) {
                Text(isJump ? "Máquina de salto" : "Perfil SSH").font(.title2.bold())
                Text(host.name.isEmpty ? "Nueva conexión" : host.name).font(.callout)
                    .foregroundStyle(Theme.secondary).lineLimit(1)
            }
        }
    }
    @ViewBuilder private var conexion: some View {
        CampoFormulario(titulo: "Nombre") {
            CampoTexto(ayuda: "Ej. Base de datos producción", texto: $host.name)
                .accessibilityIdentifier("host-name")
        }
        HStack(alignment: .top, spacing: 12) {
            CampoFormulario(titulo: "Host, IP o alias SSH") {
                CampoTexto(ayuda: "10.0.0.5 o alias de ~/.ssh/config", texto: $host.address)
                    .accessibilityIdentifier("host-address")
            }
            CampoFormulario(titulo: "Puerto") { CampoTexto(ayuda: "22", texto: $portText) }
                .frame(width: 110)
        }
        CampoFormulario(titulo: "Usuario") {
            CampoTexto(ayuda: "Vacío: el de la configuración SSH", texto: $host.username)
        }
        CampoFormulario(titulo: "Autenticación", caja: false) {
            Picker("Autenticación", selection: $host.authentication) {
                Text("OpenSSH").tag(Authentication.configuration)
                Text("ssh-agent").tag(Authentication.agent)
                Text("Clave privada").tag(Authentication.key)
                Text("Contraseña").tag(Authentication.interactive)
            }.pickerStyle(.segmented).labelsHidden()
        }
        if host.authentication == .interactive || host.authentication == .configuration {
            CampoFormulario(titulo: "Contraseña") {
                CampoTexto(
                    ayuda: hasPassword ? "Nueva contraseña (vacío: conservar)" : "Contraseña",
                    texto: $password, secreto: true)
            }
            if hasPassword {
                Label("Contraseña guardada en el almacén propio", systemImage: "lock.fill")
                    .font(.caption).foregroundStyle(Theme.secondary)
            }
        }
        CampoFormulario(titulo: "Clave privada (opcional)") {
            HStack {
                CampoTexto(ayuda: "~/.ssh/id_ed25519", texto: $host.identityPath)
                Button("Elegir…") {
                    let panel = NSOpenPanel()
                    panel.canChooseDirectories = false
                    if panel.runModal() == .OK, let url = panel.url {
                        host.identityPath = url.path
                    }
                }
            }
        }
        Text("Avanzado").font(Theme.section).padding(.top, 8)
        Toggle(
            "Usar configuración OpenSSH local de confianza", isOn: $connection.useSSHConfig)
        CampoFormulario(titulo: "known_hosts (opcional)") {
            CampoTexto(
                ayuda: "Vacío: el de OpenSSH del usuario",
                texto: Binding(
                    get: { connection.knownHostsPath ?? "" },
                    set: { connection.knownHostsPath = $0.isEmpty ? nil : $0 }))
        }
        Text(
            "OpenSSH interpreta Include, Match y ProxyCommand. Match exec puede ejecutar comandos locales, incluso al resolver la configuración. No se modifica ~/.ssh/config."
        )
        .font(.caption).foregroundStyle(Theme.secondary)
        HStack(spacing: 24) {
            Stepper("Timeout: \(connection.timeout) s", value: $connection.timeout, in: 1...120)
            Stepper(
                "Keepalive: \(connection.keepalive) s", value: $connection.keepalive,
                in: 5...300, step: 5)
        }
        Toggle("Reconectar tras pérdida de transporte", isOn: $connection.reconnect.enabled)
        Toggle(
            "Compatibilidad legacy explícita (group14-sha1 / ssh-rsa)",
            isOn: $connection.legacyAlgorithms)
    }
    @ViewBuilder private var saltos: some View {
        Text(
            "Selecciona las máquinas configuradas en Túneles, en orden desde el Mac. Los cambios del salto se aplican a todas las conexiones que lo utilizan."
        ).font(.callout).foregroundStyle(Theme.secondary)
        ForEach($connection.route.hops) { $hop in
            VStack(alignment: .leading, spacing: 10) {
                Picker(
                    "Bastión",
                    selection: Binding(
                        get: { hop.hostID ?? "" },
                        set: { hop.hostID = $0.isEmpty ? nil : $0 })
                ) {
                    if hop.hostID == nil { Text("Salto heredado").tag("") }
                    if let ref = hop.hostID,
                        !app.configuration.jumpHosts.contains(where: { $0.id == ref })
                    {
                        Text(app.configuration.host(ref)?.name ?? "Referencia heredada").tag(ref)
                    }
                    ForEach(app.configuration.jumpHosts.filter { $0.id != host.id }) {
                        Text($0.name).tag($0.id)
                    }
                }
                if hop.hostID == nil {
                    Text("\(hop.name) · \(hop.address)").font(.caption)
                }
                HStack {
                    Button("Subir") { move(hop.id, -1) }
                    Button("Bajar") { move(hop.id, 1) }
                    Spacer()
                    Button("Quitar", role: .destructive) {
                        connection.route.hops.removeAll { $0.id == hop.id }
                    }
                }
            }.padding(14).background(palette.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(palette.border.opacity(0.6)))
        }
        HStack {
            Menu("Añadir salto") {
                ForEach(app.configuration.jumpHosts.filter { $0.id != host.id }) { jump in
                    Button(jump.name) {
                        var hop = JumpHop()
                        hop.hostID = jump.id
                        connection.route.hops.append(hop)
                    }
                }
            }.menuStyle(.borderlessButton).pointerStyle(.link).fixedSize()
                .foregroundStyle(Theme.text).capsulaControl()
                .disabled(app.configuration.jumpHosts.isEmpty)
            Button("Configurar en Túneles") {
                dismiss()
                app.section = .tunnels
            }
        }
    }
    @ViewBuilder private var organizar: some View {
        if !isJump {
            CampoFormulario(titulo: "Carpeta", caja: false) {
                Picker(
                    "Carpeta",
                    selection: Binding(
                        get: { host.groupID ?? "" },
                        set: { host.groupID = $0.isEmpty ? nil : $0 })
                ) {
                    Text("Sin carpeta").tag("")
                    ForEach(app.configuration.groups) { Text($0.name).tag($0.id) }
                }.labelsHidden().fixedSize()
            }
        }
        CampoFormulario(titulo: "Etiquetas") {
            CampoTexto(ayuda: "Separadas por comas: prod, bbdd", texto: $tagText)
        }
        Toggle("Favorito", isOn: $host.favorite)
        CampoFormulario(titulo: "Color", caja: false) { SelectorColor(color: $host.color) }
        CampoFormulario(titulo: "Icono", caja: false) {
            SelectorIcono(icono: $host.icon, color: Theme.profileColor(host.color))
        }
        CampoFormulario(titulo: "Notas sin secretos") {
            TextEditor(text: $host.notes).scrollContentBackground(.hidden)
                .font(.callout).frame(minHeight: 80)
        }
    }
    private func move(_ id: String, _ delta: Int) {
        guard let index = connection.route.hops.firstIndex(where: { $0.id == id }),
            connection.route.hops.indices.contains(index + delta)
        else { return }
        connection.route.hops.swapAt(index, index + delta)
    }
    private func save() {
        do {
            if portText.isEmpty {
                host.port = nil
            } else if let port = Int(portText) {
                try Validation.port(port)
                host.port = port
            } else {
                throw ORIError.invalid("El puerto no es numérico.")
            }
            host.tags = Array(
                Set(
                    tagText.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
                        .filter { !$0.isEmpty })
            ).sorted()
            host.updatedAt = Date()
            try Validation.host(host)
            let value = host
            let cp = connection
            saving = true
            Task {
                do {
                    try await app.saveHost(value, connection: cp)
                    if !password.isEmpty, let store = app.passwordStore {
                        let credential = StoredSSHPassword(host: value, password: password)
                        try await Task.detached { try store.save([credential]) }.value
                        password = ""
                    }
                    dismiss()
                } catch { self.error = error.localizedDescription }
                saving = false
            }
        } catch { self.error = error.localizedDescription }
    }
}

struct GroupManagerView: View {
    @Bindable var app: AppContainer
    @Environment(\.dismiss) private var dismiss
    @State private var draft = HostGroup()
    @State private var deleting: HostGroup?
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Carpetas").font(.title2.bold())
            List(app.configuration.groups.sorted { $0.order < $1.order }) { group in
                HStack {
                    Label(group.name, systemImage: Theme.profileIcon(group.icon)).foregroundStyle(
                        Theme.profileColor(group.color))
                    Spacer()
                    Button("↑") { reorder(group, -1) }.accessibilityLabel("Subir \(group.name)")
                    Button("↓") { reorder(group, 1) }.accessibilityLabel("Bajar \(group.name)")
                    Button("Editar") { draft = group }
                    Button("Eliminar", role: .destructive) { deleting = group }
                }
            }.frame(height: 210)
            Form {
                TextField("Nombre", text: $draft.name)
                Picker(
                    "Carpeta superior",
                    selection: Binding(
                        get: { draft.parentID ?? "" },
                        set: { draft.parentID = $0.isEmpty ? nil : $0 })
                ) {
                    Text("Raíz").tag("")
                    ForEach(app.configuration.groups.filter { $0.id != draft.id }) {
                        Text($0.name).tag($0.id)
                    }
                }
                TextField("Notas sin secretos", text: $draft.notes)
                TextField("Icono SF Symbol", text: $draft.icon)
                Picker("Color", selection: $draft.color) {
                    ForEach(
                        ["blue", "green", "purple", "orange", "red", "cyan", "pink", "yellow"],
                        id: \.self
                    ) { Text($0).tag($0) }
                }
                HStack {
                    Button("Nueva") { draft = HostGroup() }
                    Button("Guardar carpeta") {
                        let group = draft
                        Task {
                            do {
                                try await app.save { c in
                                    if let i = c.groups.firstIndex(where: { $0.id == group.id }) {
                                        c.groups[i] = group
                                    } else {
                                        var value = group
                                        value.order = c.groups.count
                                        c.groups.append(value)
                                    }
                                }
                                draft = HostGroup()
                            } catch { app.report(error) }
                        }
                    }.disabled(draft.name.isEmpty)
                }
            }
            HStack {
                Spacer()
                Button("Cerrar") { dismiss() }.keyboardShortcut(.cancelAction)
            }
        }.padding(24).frame(width: 580)
            .confirmationDialog(
                "Eliminar carpeta y mantener sus servidores",
                isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })
            ) {
                Button("Eliminar carpeta", role: .destructive) {
                    guard let group = deleting else { return }
                    Task {
                        do {
                            try await app.save { c in
                                c.groups.removeAll { $0.id == group.id }
                                for i in c.groups.indices where c.groups[i].parentID == group.id {
                                    c.groups[i].parentID = group.parentID
                                }
                                for i in c.hosts.indices where c.hosts[i].groupID == group.id {
                                    c.hosts[i].groupID = nil
                                }
                            }
                        } catch { app.report(error) }
                    }
                    deleting = nil
                }
            }
    }
    private func reorder(_ group: HostGroup, _ delta: Int) {
        let peers = app.configuration.groups.filter { $0.parentID == group.parentID }.sorted {
            $0.order < $1.order
        }
        guard let i = peers.firstIndex(where: { $0.id == group.id }),
            peers.indices.contains(i + delta)
        else { return }
        var ids = peers.map(\.id)
        ids.swapAt(i, i + delta)
        let order = ids
        Task {
            do {
                try await app.save { c in
                    for (index, id) in order.enumerated() {
                        if let row = c.groups.firstIndex(where: { $0.id == id }) {
                            c.groups[row].order = index
                        }
                    }
                }
            } catch { app.report(error) }
        }
    }
}
