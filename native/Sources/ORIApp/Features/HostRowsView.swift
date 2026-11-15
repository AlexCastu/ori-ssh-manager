import AppKit
import ORICore
import SwiftUI

private struct HostColumns {
    var width: CGFloat
    var showsRoute: Bool { width >= 800 }
    var showsFolder: Bool { width >= 1050 }
    var endpointWidth: CGFloat { width >= 800 ? 220 : (width >= 650 ? 180 : 145) }
    var controlsWidth: CGFloat { width >= 650 ? 68 : 40 }
    let routeWidth: CGFloat = 120
    let folderWidth: CGFloat = 140
    var actionsWidth: CGFloat { width >= 650 ? 180 : 110 }
}

struct HostRowsView: View {
    @Bindable var app: AppContainer
    let hosts: [HostProfile]
    var move: (String, HostProfile) -> Void
    @Environment(\.sectionPalette) private var palette

    var body: some View {
        GeometryReader { geometry in
            let columns = HostColumns(width: geometry.size.width)
            VStack(spacing: 0) {
                HStack(spacing: 16) {
                    Text("\(hosts.count)").frame(width: columns.controlsWidth, alignment: .leading)
                    Text("CONEXIÓN").frame(maxWidth: .infinity, alignment: .leading)
                    Text("DESTINO / USUARIO").frame(
                        width: columns.endpointWidth, alignment: .leading)
                    if columns.showsRoute {
                        Text("RECORRIDO").frame(width: columns.routeWidth, alignment: .leading)
                    }
                    if columns.showsFolder {
                        Text("CARPETA").frame(width: columns.folderWidth, alignment: .leading)
                    }
                    Text("ACCIONES").frame(width: columns.actionsWidth, alignment: .trailing)
                }.font(.system(size: 10, weight: .semibold)).tracking(0.8)
                    .foregroundStyle(Theme.secondary).padding(.horizontal, 16).padding(
                        .vertical, 12
                    )
                    .background(palette.elevated)
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(hosts.enumerated()), id: \.element.id) { index, host in
                            HostRow(
                                app: app, host: host, columns: columns,
                                alternate: index.isMultiple(of: 2), move: move)
                            if index < hosts.count - 1 {
                                palette.border.opacity(0.35).frame(height: 1).padding(
                                    .horizontal, 16)
                            }
                        }
                    }
                }.accessibilityIdentifier("connections-rows")
            }.background(palette.surface.opacity(0.55), in: RoundedRectangle(cornerRadius: 14))
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(palette.border.opacity(0.7)))
        }
    }
}

private struct HostRow: View {
    @Bindable var app: AppContainer
    let host: HostProfile
    let columns: HostColumns
    let alternate: Bool
    var move: (String, HostProfile) -> Void
    @Environment(\.sectionPalette) private var palette
    @State private var hovered = false
    @State private var targeted = false
    private var connection: ConnectionProfile? { app.configuration.connection(for: host.id) }
    private var session: TerminalSessionController? {
        app.sessions.sessions.last { $0.host.id == host.id && $0.model.state == .connected }
            ?? app.sessions.sessions.last { $0.host.id == host.id }
    }
    private var routeLabel: String {
        let count = connection?.route.hops.count ?? 0
        return count == 0 ? "Directo" : "\(count) \(count == 1 ? "salto" : "saltos")"
    }
    private var routeDetail: String {
        guard let connection else { return "Sin perfil SSH" }
        if connection.route.hops.isEmpty {
            return connection.useSSHConfig ? "Configuración SSH" : "Sin bastiones"
        }
        return connection.route.hops.map { hop in
            app.configuration.hosts.first { $0.id == hop.hostID }?.name
                ?? (hop.name.isEmpty ? hop.address : hop.name)
        }.joined(separator: " → ")
    }
    private var group: String {
        app.configuration.groups.first { $0.id == host.groupID }?.name ?? "Sin carpeta"
    }

    var body: some View {
        HStack(spacing: 16) {
            HStack(spacing: 8) {
                Image(systemName: "line.3.horizontal").font(.system(size: 10)).foregroundStyle(
                    Theme.secondary.opacity(0.7)
                )
                .help("Arrastra para ordenar o mover a una carpeta")
                HostFavoriteButton(app: app, host: host)
                if columns.width >= 650 {
                    Image(
                        systemName: host.usableAsJump
                            ? "arrow.triangle.branch" : Theme.profileIcon(host.icon)
                    )
                    .foregroundStyle(Theme.profileColor(host.color)).font(.system(size: 17))
                }
            }.frame(width: columns.controlsWidth, alignment: .leading)
            VStack(alignment: .leading, spacing: 5) {
                Text(host.name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    .truncationMode(.middle)
                HStack(spacing: 6) {
                    let state = session?.model.state.rawValue ?? "disconnected"
                    Circle().fill(Theme.stateColor(state)).frame(width: 5, height: 5)
                    Text(Theme.stateLabel(state))
                    if host.usableAsJump { Text("· Bastión").foregroundStyle(palette.accent) }
                    if !columns.showsRoute { Text("· " + routeLabel) }
                }.font(.system(size: 10)).foregroundStyle(Theme.secondary).lineLimit(1)
            }.frame(maxWidth: .infinity, alignment: .leading).help(host.name)
            VStack(alignment: .leading, spacing: 5) {
                Text(host.address + (host.port.map { ":\($0)" } ?? ""))
                    .font(Theme.monospaced).lineLimit(1).truncationMode(.middle)
                Text(host.username.isEmpty ? "Usuario de configuración SSH" : host.username)
                    .font(.system(size: 11)).foregroundStyle(Theme.secondary).lineLimit(1)
            }.frame(width: columns.endpointWidth, alignment: .leading)
                .help((host.username.isEmpty ? "" : host.username + "@") + host.address)
            if columns.showsRoute {
                VStack(alignment: .leading, spacing: 5) {
                    Label(
                        routeLabel, systemImage: "point.topleft.down.to.point.bottomright.curvepath"
                    )
                    .font(.system(size: 11, weight: .medium)).foregroundStyle(palette.accent)
                    Text(routeDetail).font(.system(size: 10)).foregroundStyle(Theme.secondary)
                        .lineLimit(1)
                }.frame(width: columns.routeWidth, alignment: .leading).help(routeDetail)
            }
            if columns.showsFolder {
                Label(group, systemImage: "folder").font(.system(size: 11)).foregroundStyle(
                    Theme.secondary
                )
                .frame(width: columns.folderWidth, alignment: .leading).lineLimit(1).help(group)
            }
            HStack(spacing: 10) {
                HostConnectButton(
                    app: app, host: host, compact: true, iconOnly: columns.width < 650)
                Button {
                    app.editingHost = host
                    app.hostEditor = true
                } label: {
                    Image(systemName: "slider.horizontal.3")
                }.buttonStyle(.plain).pointerStyle(.link).foregroundStyle(Theme.secondary)
                    .accessibilityLabel("Editar \(host.name)").help("Editar conexión")
                HostActionsMenu(app: app, host: host)
            }.frame(width: columns.actionsWidth, alignment: .trailing)
        }.padding(.horizontal, 16).padding(.vertical, 12)
            .background(
                targeted
                    ? palette.accent.opacity(0.23)
                    : (hovered ? palette.elevated : palette.surface.opacity(alternate ? 0.65 : 0.2))
            )
            .contentShape(Rectangle()).onHover { hovered = $0 }
            .draggable("ori-host:" + host.id)
            .dropDestination(for: String.self) { items, _ in
                guard items.count == 1, let item = items.first, item.hasPrefix("ori-host:") else {
                    return false
                }
                move(String(item.dropFirst(9)), host)
                return true
            } isTargeted: {
                targeted = $0
            }
            .accessibilityElement(children: .contain).accessibilityIdentifier(
                "connection-row-\(host.id)")
    }
}

struct HostConnectButton: View {
    @Bindable var app: AppContainer
    let host: HostProfile
    var compact = false
    var iconOnly = false
    var body: some View {
        Button {
            Task { await app.connect(host) }
        } label: {
            if iconOnly {
                Image(systemName: "terminal")
            } else {
                Label("Conectar", systemImage: "terminal").lineLimit(1).fixedSize()
            }
        }
        .buttonStyle(PrimaryButtonStyle(compact: compact)).disabled(app.isBusy)
        .accessibilityLabel("Conectar a \(host.name)")
    }
}

struct HostFavoriteButton: View {
    @Bindable var app: AppContainer
    let host: HostProfile
    var body: some View {
        Button {
            Task {
                do {
                    try await app.save { c in
                        if let i = c.hosts.firstIndex(where: { $0.id == host.id }) {
                            c.hosts[i].favorite.toggle()
                        }
                    }
                } catch { app.report(error) }
            }
        } label: {
            Image(systemName: host.favorite ? "star.fill" : "star")
                .foregroundStyle(host.favorite ? Theme.warning : Theme.secondary)
        }.buttonStyle(.plain).pointerStyle(.link).accessibilityLabel(
            host.favorite ? "Quitar \(host.name) de favoritos" : "Marcar \(host.name) favorito")
    }
}

struct HostActionsMenu: View {
    @Bindable var app: AppContainer
    let host: HostProfile
    @State private var deleting = false
    var body: some View {
        Menu {
            Button("Editar") {
                app.editingHost = host
                app.hostEditor = true
            }
            Button("Duplicar") { duplicate() }
            if host.isJumpProfile != true {
                Button("Editar diagrama") {
                    app.diagramHostID = host.id
                    app.section = .hosts
                }
            }
            Button("Copiar dirección") {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(host.address, forType: .string)
            }
            Button("Diagnosticar primer salto") { Task { await app.inspect(host) } }
            Button("Crear túnel") {
                var tunnel = TunnelProfile()
                tunnel.name = host.name
                tunnel.connectionID = app.configuration.connection(for: host.id)?.id ?? ""
                app.editingTunnel = tunnel
                app.tunnelEditor = true
            }
            Divider()
            Button("Eliminar", role: .destructive) { deleting = true }
        } label: {
            Image(systemName: "ellipsis.circle").font(.title3)
        }
        .menuStyle(.borderlessButton).pointerStyle(.link)
            .fixedSize().accessibilityLabel("Acciones de \(host.name)")
        .confirmationDialog("Eliminar \(host.name)", isPresented: $deleting) {
            Button("Eliminar servidor", role: .destructive) {
                Task { do { try await app.deleteHost(host) } catch { app.report(error) } }
            }
        } message: {
            Text(
                "Se borrarán el perfil y sus comandos. Se bloqueará la eliminación si hay sesiones, túneles o saltos que dependan de él."
            )
        }
    }
    private func duplicate() {
        var copy = host
        copy.id = UUID().uuidString
        copy.name += " (copia)"
        copy.createdAt = Date()
        copy.updatedAt = Date()
        var connection =
            app.configuration.connection(for: host.id) ?? ConnectionProfile(hostID: host.id)
        connection.id = UUID().uuidString
        connection.hostID = copy.id
        let newHost = copy
        let newConnection = connection
        Task {
            do { try await app.saveHost(newHost, connection: newConnection) } catch {
                app.report(error)
            }
        }
    }
}
