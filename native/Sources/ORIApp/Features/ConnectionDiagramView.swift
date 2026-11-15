import ORICore
import SwiftUI

struct ConnectionDiagramView: View {
    @Bindable var app: AppContainer
    @Environment(\.sectionPalette) private var palette
    let host: HostProfile
    @State private var draft: ConnectionProfile
    @State private var original: ConnectionProfile
    @State private var positions: [String: DiagramPosition]
    @State private var selectedID: String?
    @State private var error: String?
    @State private var saving = false
    @State private var scale = 1.0
    @State private var jumpQuery = ""

    init(app: AppContainer, host: HostProfile) {
        self.app = app
        self.host = host
        let connection =
            app.configuration.connection(for: host.id) ?? ConnectionProfile(hostID: host.id)
        _draft = State(initialValue: connection)
        _original = State(initialValue: connection)
        _positions = State(initialValue: app.configuration.organization?.positions ?? [:])
    }

    private struct Node: Identifiable {
        var id: String
        var title: String
        var detail: String
        var icon: String
        var state = "unknown"
        var hostID: String?
        var hopID: String?
        var tunnelID: String?
        var origin: CGPoint
    }
    private var routeNodes: [Node] {
        var nodes = [
            Node(
                id: "mac", title: "Este Mac", detail: "Origen", icon: "laptopcomputer",
                origin: CGPoint(x: 120, y: 160))
        ]
        for hop in draft.route.hops {
            let referenced = app.configuration.hosts.first { $0.id == hop.hostID }
            nodes.append(
                Node(
                    id: "hop-" + hop.id,
                    title: referenced?.name ?? (hop.name.isEmpty ? hop.address : hop.name),
                    detail: referenced?.address ?? hop.address, icon: "arrow.triangle.branch",
                    hostID: referenced?.id, hopID: hop.id, origin: .zero))
        }
        let session = app.sessions.sessions.last { $0.host.id == host.id }
        nodes.append(
            Node(
                id: "target", title: host.name, detail: host.address, icon: "terminal",
                state: session?.model.state.rawValue ?? "disconnected", hostID: host.id,
                origin: .zero))
        for index in nodes.indices { nodes[index].origin = CGPoint(x: 120 + index * 240, y: 160) }
        return nodes
    }
    private var tunnels: [TunnelProfile] {
        app.configuration.tunnels.filter { $0.connectionID == draft.id }
    }
    private var tunnelNodes: [Node] {
        let x = routeNodes.last?.origin.x ?? 600
        return tunnels.enumerated().flatMap { index, tunnel -> [Node] in
            let state =
                app.tunnelInstances.first { $0.id == tunnel.id }?.state.rawValue ?? "stopped"
            let y = CGFloat(340 + index * 140)
            var nodes = [
                Node(
                    id: "tunnel-" + tunnel.id, title: tunnel.name,
                    detail:
                        "\(tunnel.kind == .remote ? "Remoto" : "Local") · \(tunnel.bindAddress):\(tunnel.listenPort)",
                    icon: "arrow.left.arrow.right", state: state, tunnelID: tunnel.id,
                    origin: CGPoint(x: x, y: y))
            ]
            nodes.append(
                Node(
                    id: "service-" + tunnel.id,
                    title: tunnel.kind == .dynamic ? "Proxy SOCKS" : "Destino del reenvío",
                    detail: tunnel.kind == .dynamic
                        ? "Destino elegido por el cliente"
                        : "\(tunnel.destinationHost):\(tunnel.destinationPort)",
                    icon: tunnel.kind == .dynamic
                        ? "network" : "externaldrive.connected.to.line.below",
                    tunnelID: tunnel.id, origin: CGPoint(x: x + 260, y: y)))
            return nodes
        }
    }
    private var nodes: [Node] { routeNodes + tunnelNodes }
    private var edges: [(String, String)] {
        var pairs = zip(routeNodes, routeNodes.dropFirst()).map { ($0.id, $1.id) }
        for tunnel in tunnels {
            pairs.append(("target", "tunnel-" + tunnel.id))
            pairs.append(("tunnel-" + tunnel.id, "service-" + tunnel.id))
        }
        return pairs
    }
    private func key(_ id: String) -> String { draft.id + "|" + id }
    private func point(_ node: Node) -> CGPoint {
        positions[key(node.id)].map { CGPoint(x: $0.x, y: $0.y) } ?? node.origin
    }
    private var canvasSize: CGSize {
        CGSize(
            width: max(1000, (nodes.map { point($0).x }.max() ?? 800) + 150),
            height: max(430, (nodes.map { point($0).y }.max() ?? 300) + 110))
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Recorrido · \(host.name)").font(Theme.section)
                    Text(
                        "Arrastra nodos para organizar. Suelta un bastión sobre un salto para insertarlo antes, o sobre el destino para añadirlo."
                    )
                    .font(.caption).foregroundStyle(Theme.secondary)
                }
                Spacer()
                Slider(value: $scale, in: 0.5...1.3).frame(width: 90).accessibilityLabel(
                    "Zoom del diagrama")
                Button("Ordenar") { resetPositions() }
                Button("Editar conexión") {
                    app.editingHost = host
                    app.hostEditor = true
                }
            }
            HStack {
                CampoBusqueda(ayuda: "Buscar bastión", texto: $jumpQuery).frame(width: 170)
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(
                            app.configuration.jumpHosts.filter {
                                $0.id != host.id
                                    && (jumpQuery.isEmpty
                                        || $0.name.localizedCaseInsensitiveContains(jumpQuery))
                            }
                        ) { jump in
                            Label(jump.name, systemImage: "arrow.triangle.branch")
                                .padding(8).background(palette.elevated, in: Capsule())
                                .draggable("ori-host:" + jump.id)
                                .contextMenu {
                                    Button("Añadir a la ruta") { insertHost(jump.id, before: nil) }
                                }
                                .help("Arrastra a la ruta o pulsa con el botón derecho para añadir")
                        }
                    }
                }
            }.font(.caption).frame(height: 40)
            if !draft.route.hops.isEmpty {
                ScrollView(.horizontal) {
                    HStack {
                        Text("Orden de saltos:").foregroundStyle(Theme.secondary)
                        ForEach(Array(draft.route.hops.enumerated()), id: \.element.id) {
                            index, hop in
                            let name =
                                app.configuration.hosts.first { $0.id == hop.hostID }?.name
                                ?? hop.name
                            Label(
                                "\(index + 1). \(name.isEmpty ? hop.address : name)",
                                systemImage: "line.3.horizontal"
                            )
                            .padding(6).background(
                                palette.surface, in: RoundedRectangle(cornerRadius: 8)
                            )
                            .draggable("ori-hop:" + hop.id)
                            .contextMenu {
                                Button("Mover antes") { moveHop(hop.id, by: -1) }.disabled(
                                    index == 0)
                                Button("Mover después") { moveHop(hop.id, by: 1) }.disabled(
                                    index == draft.route.hops.count - 1)
                                Button("Quitar de la ruta", role: .destructive) {
                                    draft.route.hops.removeAll { $0.id == hop.id }
                                }
                            }
                        }
                    }
                }.font(.caption).frame(height: 34)
            }
            ScrollView([.horizontal, .vertical]) {
                ZStack(alignment: .topLeading) {
                    Canvas { context, _ in
                        for (from, to) in edges {
                            guard let a = nodes.first(where: { $0.id == from }),
                                let b = nodes.first(where: { $0.id == to })
                            else { continue }
                            let start = point(a)
                            let end = point(b)
                            let p = CGPoint(x: start.x + 94, y: start.y)
                            let q = CGPoint(x: end.x - 94, y: end.y)
                            var path = Path()
                            path.move(to: p)
                            let bend = max(45, abs(q.x - p.x) / 2)
                            path.addCurve(
                                to: q, control1: CGPoint(x: p.x + bend, y: p.y),
                                control2: CGPoint(x: q.x - bend, y: q.y))
                            context.stroke(
                                path, with: .color(palette.accent.opacity(0.75)),
                                style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                            var arrow = Path()
                            arrow.move(to: CGPoint(x: q.x - 8, y: q.y - 5))
                            arrow.addLine(to: q)
                            arrow.addLine(to: CGPoint(x: q.x - 8, y: q.y + 5))
                            context.stroke(arrow, with: .color(palette.accent), lineWidth: 2)
                        }
                    }.allowsHitTesting(false)
                    ForEach(nodes) { node in
                        DiagramNodeView(
                            title: node.title, detail: node.detail, icon: node.icon,
                            state: node.state,
                            selected: selectedID == node.id, position: point(node), scale: scale,
                            select: { selectedID = node.id },
                            move: { value, finished in
                                let position = DiagramPosition(
                                    x: min(9600, max(110, value.x)), y: min(9600, max(65, value.y)))
                                positions[key(node.id)] = position
                                if finished { persistPosition(node.id, position) }
                            }
                        )
                        .position(point(node))
                        .dropDestination(for: String.self) { items, _ in
                            guard node.hopID != nil || node.id == "target", items.count == 1,
                                let item = items.first
                            else { return false }
                            return receive(item, before: node.hopID)
                        }
                        .contextMenu {
                            if let hopID = node.hopID {
                                Button("Quitar salto", role: .destructive) {
                                    draft.route.hops.removeAll { $0.id == hopID }
                                }
                            }
                            if let id = node.hostID, let selected = app.configuration.host(id) {
                                Button("Editar perfil") {
                                    app.editingHost = selected
                                    app.hostEditor = true
                                }
                            }
                        }
                    }
                }.frame(width: canvasSize.width, height: canvasSize.height)
                    .scaleEffect(scale, anchor: .topLeading)
                    .frame(
                        width: canvasSize.width * scale, height: canvasSize.height * scale,
                        alignment: .topLeading)
            }.background(palette.background, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(palette.border))
            if let selected = nodes.first(where: { $0.id == selectedID }) {
                HStack {
                    Label(selected.title, systemImage: selected.icon).font(.headline)
                    Text(selected.detail).font(Theme.monospaced).foregroundStyle(Theme.secondary)
                    Spacer()
                    if let tunnelID = selected.tunnelID,
                        let tunnel = tunnels.first(where: { $0.id == tunnelID })
                    {
                        let state =
                            app.tunnelInstances.first { $0.id == tunnelID }?.state ?? .stopped
                        if [.starting, .active, .reconnecting].contains(state) {
                            Button("Detener túnel") { Task { await app.stopTunnel(tunnelID) } }
                        } else {
                            Button("Iniciar túnel") { Task { await app.startTunnel(tunnel) } }
                                .disabled(app.isBusy || state == .stopping || draft != original)
                        }
                        Button("Configurar túnel") { app.section = .tunnels }
                    }
                    if let hopID = selected.hopID {
                        Button("Quitar salto") { draft.route.hops.removeAll { $0.id == hopID } }
                    }
                }.font(.caption)
            }
            if let error {
                Text(error).font(.caption).foregroundStyle(Theme.error).textSelection(.enabled)
            }
            HStack {
                Text(
                    draft != original
                        ? "Ruta con cambios pendientes"
                        : "Ruta guardada · selecciona un nodo para actuar"
                )
                .font(.caption).foregroundStyle(draft != original ? Theme.warning : Theme.secondary)
                Spacer()
                Button("Crear túnel") {
                    var tunnel = TunnelProfile()
                    tunnel.name = host.name
                    tunnel.connectionID = draft.id
                    app.editingTunnel = tunnel
                    app.tunnelEditor = true
                }.disabled(draft != original)
                Button("Descartar") {
                    let current = app.configuration.connection(for: host.id) ?? original
                    draft = current
                    original = current
                    error = nil
                }.disabled(draft == original || saving)
                Button("Guardar ruta") { save(connect: false) }.disabled(
                    draft == original || saving)
                Button(draft == original ? "Conectar" : "Guardar y conectar") {
                    save(connect: true)
                }
                .buttonStyle(PrimaryButtonStyle()).disabled(saving || app.isBusy)
            }
            Text(
                "Las líneas muestran la configuración. El estado del destino procede de SSH y el de los túneles de su proceso. La configuración local de OpenSSH puede añadir otros saltos."
            )
            .font(.caption2).foregroundStyle(Theme.secondary)
        }
        .onChange(of: app.configuration.connection(for: host.id)) { _, updated in
            guard let updated, updated != original else { return }
            if draft == original {
                draft = updated
                original = updated
            } else {
                error =
                    "La conexión cambió en otro editor. Descarta el borrador para cargar la versión guardada."
            }
        }
    }
    private func insertHost(_ id: String, before hopID: String?) {
        do {
            try ConnectionOrganizer.insertJump(
                id, before: hopID, in: &draft, configuration: app.configuration)
            error = nil
        } catch { self.error = error.localizedDescription }
    }
    private func receive(_ item: String, before hopID: String?) -> Bool {
        if item.hasPrefix("ori-host:") {
            insertHost(String(item.dropFirst(9)), before: hopID)
            return true
        }
        guard item.hasPrefix("ori-hop:") else { return false }
        let id = String(item.dropFirst(8))
        guard id != hopID, let hop = draft.route.hops.first(where: { $0.id == id }) else {
            return false
        }
        draft.route.hops.removeAll { $0.id == id }
        let index =
            hopID.flatMap { id in draft.route.hops.firstIndex { $0.id == id } }
            ?? draft.route.hops.endIndex
        draft.route.hops.insert(hop, at: index)
        return true
    }
    private func moveHop(_ id: String, by delta: Int) {
        guard let index = draft.route.hops.firstIndex(where: { $0.id == id }),
            draft.route.hops.indices.contains(index + delta)
        else { return }
        draft.route.hops.swapAt(index, index + delta)
    }
    private func save(connect: Bool) {
        let value = draft
        let expected = original
        saving = true
        Task {
            defer { saving = false }
            do {
                if value != expected {
                    try await app.save { c in
                        guard let i = c.connections.firstIndex(where: { $0.id == value.id }),
                            c.connections[i] == expected
                        else {
                            throw ORIError.invalid(
                                "La conexión cambió en otro editor. Vuelve a abrir el mapa.")
                        }
                        c.connections[i] = value
                    }
                    original = value
                }
                error = nil
                if connect { await app.connect(host) }
            } catch { self.error = error.localizedDescription }
        }
    }
    private func persistPosition(_ id: String, _ value: DiagramPosition) {
        let positionKey = key(id)
        Task {
            do {
                try await app.save { c in
                    var organization = c.organization ?? .init()
                    organization.positions[positionKey] = value
                    c.organization = organization
                }
            } catch { self.error = error.localizedDescription }
        }
    }
    private func resetPositions() {
        let prefix = draft.id + "|"
        positions = positions.filter { !$0.key.hasPrefix(prefix) }
        Task {
            do {
                try await app.save { c in
                    guard var organization = c.organization else { return }
                    organization.positions = organization.positions.filter {
                        !$0.key.hasPrefix(prefix)
                    }
                    c.organization = organization
                }
            } catch { self.error = error.localizedDescription }
        }
    }
}

private struct DiagramNodeView: View {
    @Environment(\.sectionPalette) private var palette
    let title: String
    let detail: String
    let icon: String
    let state: String
    let selected: Bool
    let position: CGPoint
    let scale: Double
    var select: () -> Void
    var move: (CGPoint, Bool) -> Void
    @State private var dragStart: CGPoint?
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: icon).foregroundStyle(palette.accent)
                Text(title).font(.headline).lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: "hand.draw").font(.caption).foregroundStyle(Theme.secondary)
            }
            Text(detail).font(.system(size: 10, design: .monospaced)).lineLimit(2).foregroundStyle(
                Theme.secondary)
            if state != "unknown" {
                Text(Theme.stateLabel(state)).font(.caption2).foregroundStyle(
                    Theme.stateColor(state))
            }
        }.padding(12).frame(width: 190, height: 96, alignment: .leading)
            .background(palette.surface, in: RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14).stroke(
                    selected ? palette.accent : palette.border, lineWidth: selected ? 2 : 1)
            )
            .contentShape(Rectangle()).onTapGesture(perform: select)
            .gesture(
                DragGesture(minimumDistance: 5, coordinateSpace: .global)
                    .onChanged { value in
                        if dragStart == nil {
                            dragStart = position
                            select()
                        }
                        let start = dragStart ?? position
                        move(
                            CGPoint(
                                x: start.x + value.translation.width / scale,
                                y: start.y + value.translation.height / scale), false)
                    }.onEnded { value in
                        let start = dragStart ?? position
                        move(
                            CGPoint(
                                x: start.x + value.translation.width / scale,
                                y: start.y + value.translation.height / scale), true)
                        dragStart = nil
                    }
            )
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton).accessibilityAction { select() }
    }
}
