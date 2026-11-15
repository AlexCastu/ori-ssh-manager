import ORICore
import SwiftUI

// Carpetas de un nivel: por nombre si así se eligió en Conexiones, si no en el orden manual
private func ordenarCarpetas(_ grupos: [HostGroup], _ settings: AppSettings) -> [HostGroup] {
    settings.ordenConexiones == "nombre"
        ? grupos.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        : grupos.sorted { ($0.order, $0.name) < ($1.order, $1.name) }
}

private struct FolderEditRequest: Identifiable {
    let id = UUID()
    var draft: HostGroup
    var referenceID: String?
    var placement: ConnectionOrganizer.FolderPlacement?
}

struct ConnectionFolderTree: View {
    @Bindable var app: AppContainer
    let selection: String
    var selectGroup: (String) -> Void
    @Environment(\.sectionPalette) private var palette
    @State private var editing: FolderEditRequest?
    private var roots: [HostGroup] {
        ordenarCarpetas(
            app.configuration.groups.filter { $0.parentID == nil }, app.configuration.settings)
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("CARPETAS").font(.system(size: 10, weight: .semibold)).tracking(1)
                        .foregroundStyle(Theme.secondary)
                    Spacer()
                    Button {
                        edit(nil, .root)
                    } label: {
                        Image(systemName: "folder.badge.plus")
                    }.buttonStyle(.plain).pointerStyle(.link).help("Nueva carpeta raíz")
                        .accessibilityLabel("Nueva carpeta raíz")
                }.padding(8)
                shortcut("Todas las conexiones", id: "", icon: "square.stack.3d.up")
                ForEach(roots) { group in
                    FolderBranch(
                        app: app, group: group, selection: selection, selectGroup: selectGroup,
                        edit: edit)
                }
                if app.connectionHosts.contains(where: { $0.groupID == nil }) {
                    shortcut("Sin carpeta", id: "ungrouped", icon: "tray")
                }
            }.padding(8)
                .frame(maxWidth: .infinity, minHeight: 160, alignment: .topLeading)
                .contentShape(Rectangle())
                .contextMenu { Button("Nueva carpeta raíz…") { edit(nil, .root) } }
        }.background(palette.surface.opacity(0.6), in: RoundedRectangle(cornerRadius: 12))
            .accessibilityIdentifier("connections-folder-tree")
            .sheet(item: $editing) { request in
                FolderEditorSheet(app: app, request: request, saved: selectGroup)
            }
    }
    private func edit(_ group: HostGroup?, _ placement: ConnectionOrganizer.FolderPlacement?) {
        var draft = placement == nil ? group ?? HostGroup() : HostGroup()
        if placement != nil { draft.color = "green" }
        editing = FolderEditRequest(draft: draft, referenceID: group?.id, placement: placement)
    }
    private func shortcut(_ name: String, id: String, icon: String) -> some View {
        Button {
            selectGroup(id)
        } label: {
            Label(name, systemImage: icon).font(.system(size: 12, weight: .medium))
                .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
                .padding(.horizontal, 8).contentShape(Rectangle())
        }.buttonStyle(.plain).pointerStyle(.link)
            .background(
                selection == id ? palette.accent.opacity(0.15) : .clear,
                in: RoundedRectangle(cornerRadius: 7)
            )
            .dropDestination(for: String.self) { items, _ in
                guard items.count == 1, let item = items.first, item.hasPrefix("ori-host:") else {
                    return false
                }
                let hostID = String(item.dropFirst(9))
                Task {
                    do {
                        try await app.save {
                            try ConnectionOrganizer.moveHost(hostID, to: nil, in: &$0)
                        }
                    } catch { app.report(error) }
                }
                return true
            }
    }
}

private struct FolderBranch: View {
    @Bindable var app: AppContainer
    let group: HostGroup
    let selection: String
    var selectGroup: (String) -> Void
    var edit: (HostGroup?, ConnectionOrganizer.FolderPlacement?) -> Void
    @Environment(\.sectionPalette) private var palette
    @State private var expanded: Bool
    @State private var targeted = false
    @State private var lineaActiva = false
    init(
        app: AppContainer, group: HostGroup, selection: String,
        selectGroup: @escaping (String) -> Void,
        edit: @escaping (HostGroup?, ConnectionOrganizer.FolderPlacement?) -> Void
    ) {
        self.app = app
        self.group = group
        self.selection = selection
        self.selectGroup = selectGroup
        self.edit = edit
        _expanded = State(initialValue: group.expanded)
    }
    private var children: [HostGroup] {
        ordenarCarpetas(
            app.configuration.groups.filter { $0.parentID == group.id }, app.configuration.settings)
    }
    private var count: Int {
        let ids = ConnectionOrganizer.descendantGroupIDs(of: group.id, in: app.configuration)
        return app.connectionHosts.filter { $0.groupID.map(ids.contains) ?? false }.count
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Franja encima de la carpeta: soltar otra aquí la coloca delante, al mismo nivel
            Rectangle().fill(.clear).frame(height: 6).contentShape(Rectangle())
                .overlay(Capsule().fill(lineaActiva ? palette.accent : .clear).frame(height: 2))
                .dropDestination(for: String.self) { items, _ in
                    recolocar(items)
                } isTargeted: {
                    lineaActiva = $0
                }
            HStack(spacing: 0) {
                if !children.isEmpty {
                    Button {
                        expanded.toggle()
                        selectGroup(group.id)
                    } label: {
                        Image(systemName: expanded ? "chevron.down" : "chevron.right")
                            .font(.system(size: 9, weight: .semibold))
                            .frame(width: 24, height: 34).contentShape(Rectangle())
                    }.buttonStyle(.plain).pointerStyle(.link)
                        .accessibilityLabel("\(expanded ? "Contraer" : "Desplegar") \(group.name)")
                } else {
                    Color.clear.frame(width: 12, height: 34).contentShape(Rectangle())
                        .onTapGesture { selectGroup(group.id) }.accessibilityHidden(true)
                }
                Button {
                    selectGroup(group.id)
                    if !children.isEmpty { expanded = true }
                } label: {
                    HStack(spacing: 7) {
                        Image(systemName: expanded && !children.isEmpty ? "folder.fill" : "folder")
                            .foregroundStyle(palette.accent)
                        Text(group.name).lineLimit(1)
                        Spacer(minLength: 0)
                        Text("\(count)").font(.caption2).monospacedDigit()
                            .foregroundStyle(Theme.secondary)
                    }.font(.system(size: 12, weight: .medium))
                        .frame(maxWidth: .infinity, minHeight: 34, alignment: .leading)
                        .padding(.trailing, 9).contentShape(Rectangle())
                }.buttonStyle(.plain).pointerStyle(.link)
                    .accessibilityLabel("\(group.name), \(count) conexiones")
                    .accessibilityValue(selection == group.id ? "Seleccionada" : "")
                    .accessibilityIdentifier("connection-folder-" + group.id)
            }
            .background(
                selection == group.id || targeted ? palette.accent.opacity(0.15) : .clear,
                in: RoundedRectangle(cornerRadius: 7)
            )
            .contentShape(Rectangle())
            .contextMenu {
                Button("Nueva subcarpeta…") { edit(group, .child) }
                Button("Nueva carpeta al mismo nivel…") { edit(group, .sibling) }
                Button("Insertar carpeta superior…") { edit(group, .parent) }
                Divider()
                Button("Renombrar o mover…") { edit(group, nil) }
            }
            .draggable("ori-group:" + group.id)
            .dropDestination(for: String.self) { items, _ in
                receive(items)
            } isTargeted: {
                targeted = $0
            }
            if expanded && !children.isEmpty {
                ForEach(children) { child in
                    FolderBranch(
                        app: app, group: child, selection: selection,
                        selectGroup: selectGroup, edit: edit)
                }.padding(.leading, 16)
            }
        }
        .onChange(of: expanded) { _, value in
            guard group.expanded != value else { return }
            let id = group.id
            Task {
                do {
                    try await app.save { c in
                        if let i = c.groups.firstIndex(where: { $0.id == id }) {
                            c.groups[i].expanded = value
                        }
                    }
                } catch { app.report(error) }
            }
        }
        .onChange(of: group.expanded) { _, value in expanded = value }
    }
    private func recolocar(_ items: [String]) -> Bool {
        guard items.count == 1, let item = items.first, item.hasPrefix("ori-group:") else {
            return false
        }
        let movida = String(item.dropFirst(10))
        let destino = group.id
        Task {
            do {
                try await app.save { c in
                    try ConnectionOrganizer.moveGroup(movida, before: destino, in: &c)
                    if c.settings.ordenConexiones == "nombre" { c.settings.ordenConexiones = nil }
                }
            } catch { app.report(error) }
        }
        return true
    }
    private func receive(_ items: [String]) -> Bool {
        guard items.count == 1, let item = items.first else { return false }
        let parentID = group.id
        Task {
            do {
                try await app.save { c in
                    if item.hasPrefix("ori-host:") {
                        try ConnectionOrganizer.moveHost(
                            String(item.dropFirst(9)), to: parentID, in: &c)
                    } else if item.hasPrefix("ori-group:"),
                        var moving = c.groups.first(where: { $0.id == String(item.dropFirst(10)) })
                    {
                        moving.parentID = parentID
                        try ConnectionOrganizer.updateGroup(moving, in: &c)
                    }
                }
            } catch { app.report(error) }
        }
        return item.hasPrefix("ori-host:") || item.hasPrefix("ori-group:")
    }
}

private struct FolderEditorSheet: View {
    @Bindable var app: AppContainer
    let request: FolderEditRequest
    var saved: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var draft: HostGroup
    @State private var error: String?
    @State private var saving = false
    @FocusState private var focused: Bool
    init(app: AppContainer, request: FolderEditRequest, saved: @escaping (String) -> Void) {
        self.app = app
        self.request = request
        self.saved = saved
        _draft = State(initialValue: request.draft)
    }
    private var title: String {
        switch request.placement {
        case .root: "Nueva carpeta raíz"
        case .child: "Nueva subcarpeta"
        case .sibling: "Nueva carpeta al mismo nivel"
        case .parent: "Insertar carpeta superior"
        case nil: "Editar carpeta"
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(title).font(.title2.bold())
            TextField("Nombre de la carpeta", text: $draft.name).textFieldStyle(.roundedBorder)
                .focused($focused).onSubmit { save() }
            if request.placement == nil {
                Picker(
                    "Carpeta superior",
                    selection: Binding(
                        get: { draft.parentID ?? "" },
                        set: { draft.parentID = $0.isEmpty ? nil : $0 }
                    )
                ) {
                    Text("Raíz").tag("")
                    let excluded = ConnectionOrganizer.descendantGroupIDs(
                        of: draft.id, in: app.configuration)
                    ForEach(app.configuration.groups.filter { !excluded.contains($0.id) }) {
                        group in
                        Text(path(group)).tag(group.id)
                    }
                }
            } else if let group = app.configuration.groups.first(where: {
                $0.id == request.referenceID
            }) {
                Text(
                    request.placement == .parent
                        ? "\(group.name) quedará dentro de esta carpeta."
                        : "Referencia: \(path(group))"
                )
                .font(.callout).foregroundStyle(Theme.secondary)
            }
            if let error { Text(error).font(.callout).foregroundStyle(Theme.error) }
            HStack {
                Button("Cancelar") { dismiss() }.keyboardShortcut(.cancelAction)
                Spacer()
                Button(saving ? "Guardando…" : "Guardar carpeta") { save() }
                    .buttonStyle(PrimaryButtonStyle(compact: true)).keyboardShortcut(.defaultAction)
                    .disabled(
                        saving || draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )
            }
        }.padding(24).frame(width: 440).onAppear { focused = true }
            .interactiveDismissDisabled(saving)
    }
    private func path(_ group: HostGroup) -> String {
        var names = [group.name]
        var parent = group.parentID
        var visited: Set<String> = [group.id]
        while let id = parent, visited.insert(id).inserted,
            let value = app.configuration.groups.first(where: { $0.id == id })
        {
            names.insert(value.name, at: 0)
            parent = value.parentID
        }
        return names.joined(separator: " / ")
    }
    private func save() {
        guard !saving else { return }
        var value = draft
        value.name = value.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.name.isEmpty else { return }
        let group = value
        let placement = request.placement
        let reference = request.referenceID
        saving = true
        Task {
            do {
                try await app.save { c in
                    if let placement {
                        try ConnectionOrganizer.createGroup(
                            group, relativeTo: reference, placement: placement, in: &c)
                    } else {
                        try ConnectionOrganizer.updateGroup(group, in: &c)
                    }
                }
                saved(group.id)
                dismiss()
            } catch { self.error = error.localizedDescription }
            saving = false
        }
    }
}
