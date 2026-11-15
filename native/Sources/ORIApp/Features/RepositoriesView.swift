import AppKit
import CryptoKit
import Foundation
import ORICore
import Observation
import SwiftUI

private let ITERM_BUNDLE_ID = "com.googlecode.iterm2"
// git status / fetch / pull a la vez: medido 2026-11-15, 26 repos pasan de 1,7 s a 0,5 s
private let CONSULTAS_EN_PARALELO = 6

@MainActor @Observable
final class RepositoryController {
    var repositories: [RepositoryStatus] = []
    var busy = false
    var progress = ""
    private let service = RepositoryService()
    private var operation: Task<Void, Never>?

    func scan(_ root: RepositoryRoot) async {
        guard !busy else { return }
        busy = true
        let task = Task { await scanContents(root) }
        operation = task
        await withTaskCancellationHandler {
            await task.value
        } onCancel: {
            task.cancel()
        }
        operation = nil
        busy = false
    }
    private func scanContents(_ root: RepositoryRoot) async {
        repositories = []
        progress = "Buscando repositorios…"
        do {
            try Task.checkCancellation()
            let paths = try await service.discover(root)
            let service = self.service
            var hechos: [String: RepositoryStatus] = [:]
            try await withThrowingTaskGroup(of: RepositoryStatus.self) { grupo in
                var siguiente = paths.makeIterator()
                for _ in 0..<CONSULTAS_EN_PARALELO {
                    if let path = siguiente.next() { grupo.addTask { await service.status(path) } }
                }
                while let listo = try await grupo.next() {
                    hechos[listo.path] = listo
                    // Se publica en el orden de las carpetas, no en el de llegada
                    repositories = paths.compactMap { hechos[$0] }
                    progress = "Consultando \(hechos.count) de \(paths.count)…"
                    try Task.checkCancellation()
                    if let path = siguiente.next() { grupo.addTask { await service.status(path) } }
                }
            }
            progress =
                "\(paths.count) repositorios · estado local actualizado. Haz fetch para comparar con el remoto."
        } catch is CancellationError {
            progress = "Consulta cancelada."
        } catch { progress = error.localizedDescription }
    }

    func perform(_ action: RepositoryService.Action, repositories selected: [RepositoryStatus])
        async
    {
        guard !busy else { return }
        busy = true
        let task = Task { await performContents(action, selected: selected) }
        operation = task
        await withTaskCancellationHandler {
            await task.value
        } onCancel: {
            task.cancel()
        }
        operation = nil
        busy = false
    }
    func shutdown() async {
        operation?.cancel()
        await operation?.value
    }
    private func performContents(_ action: RepositoryService.Action, selected: [RepositoryStatus])
        async
    {
        var failures = 0
        var terminados = 0
        let service = self.service
        let nombre = action == .fetch ? "Fetch" : "Pull"
        progress = "\(nombre) · 0/\(selected.count)"
        await withTaskGroup(of: (RepositoryStatus, Bool).self) { grupo in
            var siguiente = selected.makeIterator()
            for _ in 0..<CONSULTAS_EN_PARALELO {
                if let repository = siguiente.next() {
                    grupo.addTask { await Self.aplicar(action, repository, service) }
                }
            }
            while let (status, correcto) = await grupo.next() {
                terminados += 1
                if !correcto { failures += 1 }
                if let i = repositories.firstIndex(where: { $0.id == status.id }) {
                    repositories[i] = status
                }
                progress = "\(nombre) · \(terminados)/\(selected.count)"
                if Task.isCancelled { break }
                if let repository = siguiente.next() {
                    grupo.addTask { await Self.aplicar(action, repository, service) }
                }
            }
        }
        guard !Task.isCancelled else {
            progress = "Operación cancelada."
            return
        }
        progress =
            "Operación terminada: \(selected.count - failures) correctos, \(failures) con error."
    }
    // Fetch o pull de un repo; si falla, devuelve su estado actual con el error
    private nonisolated static func aplicar(
        _ action: RepositoryService.Action, _ repository: RepositoryStatus,
        _ service: RepositoryService
    ) async -> (RepositoryStatus, Bool) {
        do { return (try await service.perform(action, path: repository.path), true) } catch {
            var status = await service.status(repository.path)
            status.error = error.localizedDescription
            return (status, false)
        }
    }
    // Copia la URL del remoto origin, sin credenciales, para compartirla
    func copiarDireccionGit(_ repository: RepositoryStatus) async throws -> String {
        let direccion = try await service.remoteURL(repository.path)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(direccion, forType: .string)
        return direccion
    }
}

// Iconos reales de las apps con las que se abre un repositorio
@MainActor enum IconoApp {
    static let finder = icono("com.apple.finder")
    static let vscode = icono("com.microsoft.VSCode")
    static let claude = icono("com.anthropic.claudefordesktop")
    private static func icono(_ bundleID: String) -> NSImage? {
        NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleID).map {
            NSWorkspace.shared.icon(forFile: $0.path)
        }
    }
}

struct RepositoriesView: View {
    @Bindable var app: AppContainer
    @Environment(\.sectionPalette) private var palette
    private var controller: RepositoryController { app.repositories }
    @State private var rootID = ""
    @State private var query = ""
    @State private var changesOnly = false
    @State private var pullSelection: [RepositoryStatus] = []
    @State private var deleting: RepositoryRoot?
    private var roots: [RepositoryRoot] { app.configuration.repositoryRoots ?? [] }
    private var root: RepositoryRoot? { roots.first { $0.id == rootID } }
    private var filtered: [RepositoryStatus] {
        controller.repositories.filter {
            (!changesOnly || $0.dirty || $0.ahead > 0 || $0.behind > 0 || $0.error != nil)
                && (query.isEmpty
                    || ($0.name + " " + $0.branch).localizedCaseInsensitiveContains(query))
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            PageHeader(
                title: "Repositorios", subtitle: "Tus proyectos, sus cambios y el siguiente paso.")
            HStack(spacing: 10) {
                Picker("Espacio", selection: $rootID) {
                    Text("Selecciona un espacio").tag("")
                    ForEach(roots) { Text($0.name).tag($0.id) }
                }.frame(maxWidth: 280).disabled(controller.busy).help(root?.path ?? "Espacios Git")
                Button {
                    chooseRoot()
                } label: {
                    Label("Añadir carpeta", systemImage: "folder.badge.plus")
                }.buttonStyle(SecondaryButtonStyle()).disabled(controller.busy)
                if let root {
                    Button {
                        chooseRoot(replacing: root)
                    } label: {
                        Label("Reubicar", systemImage: "arrow.left.arrow.right")
                    }.buttonStyle(SecondaryButtonStyle()).disabled(controller.busy)
                    Menu {
                        ForEach(1...8, id: \.self) { depth in
                            Button("Profundidad \(depth)") { updateDepth(root, depth) }
                        }
                        Divider()
                        Button("Quitar espacio", role: .destructive) { deleting = root }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }.menuStyle(.borderlessButton).pointerStyle(.link)
                        .fixedSize().disabled(controller.busy)
                }
                Spacer()
                Button {
                    scan()
                } label: {
                    Label("Actualizar", systemImage: "arrow.clockwise")
                }.buttonStyle(SecondaryButtonStyle()).disabled(root == nil || controller.busy)
                Button {
                    let selection = filtered
                    Task { await controller.perform(.fetch, repositories: selection) }
                } label: {
                    Label("Fetch visibles", systemImage: "arrow.triangle.2.circlepath")
                }.buttonStyle(SecondaryButtonStyle()).disabled(controller.busy || filtered.isEmpty)
                Button {
                    pullSelection = filtered
                } label: {
                    Label("Pull visibles…", systemImage: "arrow.down.to.line")
                }.buttonStyle(SecondaryButtonStyle()).disabled(controller.busy || filtered.isEmpty)
            }
            HStack(spacing: 10) {
                CampoBusqueda(ayuda: "Buscar repositorio o rama", texto: $query).frame(width: 280)
                Button {
                    changesOnly.toggle()
                } label: {
                    Label("Con cambios", systemImage: "line.3.horizontal.decrease")
                }.buttonStyle(SecondaryButtonStyle(activo: changesOnly))
                    .accessibilityAddTraits(changesOnly ? .isSelected : [])
                if controller.busy { ProgressView().controlSize(.small) }
                Text(controller.progress).font(.caption).foregroundStyle(Theme.secondary)
                    .lineLimit(1)
                Spacer()
            }
            if let root, !root.path.hasPrefix("/") {
                HStack(spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.warning)
                    Text(
                        "«\(root.name)» apunta a una carpeta de Windows (\(root.path)). Elige su carpeta en este Mac."
                    ).font(.callout)
                    Spacer()
                    Button("Elegir carpeta") { chooseRoot(replacing: root) }
                        .buttonStyle(PrimaryButtonStyle(compact: true))
                }.padding(12).background(Theme.warning.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
            }
            if roots.isEmpty {
                EmptyPanel(
                    title: "Tus proyectos, a mano",
                    subtitle:
                        "Añade una carpeta que contenga repositorios Git. Los espacios de Acceso bastiones se importan desde Conexiones › Importar.",
                    icon: "arrow.triangle.branch")
            } else if filtered.isEmpty && !controller.busy {
                EmptyPanel(
                    title: "Sin repositorios visibles",
                    subtitle:
                        "Revisa la carpeta del espacio, su profundidad o el filtro de cambios.",
                    icon: "folder.badge.questionmark")
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(filtered) { repository in repositoryRow(repository) }
                    }.padding(.bottom, 16)
                }
            }
        }.padding(28)
            .onAppear { if rootID.isEmpty { rootID = roots.first?.id ?? "" } }
            .task(id: rootID) { [selectedRoot = root] in
                if let selectedRoot { await controller.scan(selectedRoot) }
            }
            .confirmationDialog(
                "Actualizar \(pullSelection.count) repositorios con pull --ff-only",
                isPresented: Binding(
                    get: { !pullSelection.isEmpty }, set: { if !$0 { pullSelection = [] } })
            ) {
                Button("Ejecutar pull") {
                    let selection = pullSelection
                    pullSelection = []
                    Task { await controller.perform(.pull, repositories: selection) }
                }
            } message: {
                Text(
                    "Solo se actualizan ramas con upstream y sin cambios locales. Los repositorios divergentes mostrarán un error."
                )
            }
            .confirmationDialog(
                "Quitar espacio de ORI",
                isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })
            ) {
                Button("Quitar espacio", role: .destructive) {
                    guard let value = deleting else { return }
                    deleting = nil
                    Task {
                        do {
                            try await app.save {
                                $0.repositoryRoots?.removeAll { $0.id == value.id }
                            }
                            rootID = roots.first?.id ?? ""
                            controller.repositories = []
                        } catch { app.report(error) }
                    }
                }
            } message: {
                Text("Los archivos y repositorios de la carpeta se conservan.")
            }
    }

    private func repositoryRow(_ repository: RepositoryStatus) -> some View {
        let stateIcon =
            repository.error != nil
            ? "exclamationmark.circle.fill"
            : (repository.conflicts > 0
                ? "exclamationmark.triangle.fill"
                : (repository.dirty ? "pencil.circle.fill" : "checkmark.circle.fill"))
        let detail =
            repository.error
            ?? "\(repository.changed) modificados · \(repository.untracked) nuevos · \(repository.conflicts) conflictos · ↑\(repository.ahead) ↓\(repository.behind)"
        return HStack(spacing: 16) {
            Image(systemName: stateIcon).font(.system(size: 18))
                .foregroundStyle(
                    repository.error != nil
                        ? Theme.error : (repository.dirty ? Theme.warning : Theme.success)
                )
                .help(detail).accessibilityLabel(
                    repository.error != nil
                        ? "Estado no disponible"
                        : (repository.dirty ? "Cambios locales" : "Sin cambios"))
            Text(repository.name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading).help(repository.path)
            Label(
                repository.branch.isEmpty ? "—" : repository.branch,
                systemImage: "arrow.triangle.branch"
            )
            .font(.system(size: 12)).foregroundStyle(Theme.secondary).lineLimit(1)
            .frame(minWidth: 80, idealWidth: 160, maxWidth: 220).help(
                repository.upstream.isEmpty ? "Sin upstream" : repository.upstream)
            HStack(spacing: 8) {
                if repository.ahead > 0 {
                    Label("\(repository.ahead)", systemImage: "arrow.up").font(.caption)
                        .foregroundStyle(Theme.warning)
                }
                if repository.behind > 0 {
                    Label("\(repository.behind)", systemImage: "arrow.down").font(.caption)
                        .foregroundStyle(palette.accent)
                }
            }.frame(minWidth: 25).help(detail)
            HStack(spacing: 4) {
                BotonApp(icono: IconoApp.finder, simbolo: "folder", etiqueta: "Abrir en Finder") {
                    NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: repository.path)
                }
                BotonApp(
                    icono: IconoApp.claude, simbolo: "terminal.fill",
                    etiqueta: "Claude Code en iTerm"
                ) {
                    do {
                        try ConsoleLauncher.openClaude(
                            repository.path, runtimeRoot: app.runtimeRoot)
                    } catch { app.report(error) }
                }
                BotonApp(
                    icono: IconoApp.vscode, simbolo: "chevron.left.forwardslash.chevron.right",
                    etiqueta: "Abrir en VS Code"
                ) {
                    open(repository, claude: false)
                }
            }
            HStack(spacing: 2) {
                BotonIcono(simbolo: "link", etiqueta: "Copiar dirección Git") {
                    Task {
                        do {
                            let direccion = try await controller.copiarDireccionGit(repository)
                            app.show("Dirección Git copiada: \(direccion)")
                        } catch { app.report(error) }
                    }
                }
                BotonIcono(simbolo: "arrow.triangle.2.circlepath", etiqueta: "Fetch") {
                    Task { await controller.perform(.fetch, repositories: [repository]) }
                }.disabled(controller.busy)
                BotonIcono(simbolo: "arrow.down.to.line", etiqueta: "Pull --ff-only") {
                    pullSelection = [repository]
                }
                    .disabled(controller.busy || repository.dirty || repository.upstream.isEmpty)
                Menu {
                    Button("Claude en VS Code") { open(repository, claude: true) }
                    Text(detail)
                } label: {
                    Image(systemName: "ellipsis")
                }.menuStyle(.borderlessButton).pointerStyle(.link).fixedSize().help("Más acciones")
            }.capsulaControl()
        }.padding(.horizontal, 16).padding(.vertical, 13)
            .background(palette.surface, in: RoundedRectangle(cornerRadius: 12))
            .accessibilityIdentifier("repository-row-\(repository.name)")
    }
    private func scan() { if let root { Task { await controller.scan(root) } } }
    private func chooseRoot(replacing: RepositoryRoot? = nil) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.message = "Elige una carpeta de proyectos o un repositorio Git."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        var value = replacing ?? RepositoryRoot(name: url.lastPathComponent, path: url.path)
        value.path = url.path
        let saved = value
        Task {
            do {
                try await app.save { c in
                    var values = c.repositoryRoots ?? []
                    if let index = values.firstIndex(where: { $0.id == saved.id }) {
                        values[index] = saved
                    } else if !values.contains(where: { $0.path == saved.path }) {
                        values.append(saved)
                    }
                    c.repositoryRoots = values
                }
                if rootID == saved.id {
                    scan()
                } else {
                    rootID = roots.first { $0.path == saved.path }?.id ?? saved.id
                }
            } catch { app.report(error) }
        }
    }
    private func updateDepth(_ root: RepositoryRoot, _ depth: Int) {
        Task {
            do {
                try await app.save { c in
                    if let i = c.repositoryRoots?.firstIndex(where: { $0.id == root.id }) {
                        c.repositoryRoots?[i].maxDepth = depth
                    }
                }
                scan()
            } catch { app.report(error) }
        }
    }
    private func open(_ repository: RepositoryStatus, claude: Bool) {
        do {
            try VSCodeLauncher.open(repository.path, claude: claude, runtimeRoot: app.runtimeRoot)
            if claude {
                app.show(
                    "VS Code abrirá la tarea ORI · Claude. Si solicita autorización para tareas automáticas, puedes permitirla o ejecutarla desde Terminal → Ejecutar tarea."
                )
            }
        } catch { app.report(error) }
    }
}

// Botón de solo icono, en blanco, para las acciones de cada fila
struct BotonIcono: View {
    let simbolo: String
    let etiqueta: String
    let accion: () -> Void
    var body: some View {
        Button(action: accion) {
            Image(systemName: simbolo).font(.system(size: 14)).frame(width: 28, height: 26)
        }
        .buttonStyle(.borderless).pointerStyle(.link)
        .foregroundStyle(Theme.text).help(etiqueta).accessibilityLabel(etiqueta)
    }
}

// Botón con el icono real de la app; si no está instalada, símbolo genérico
struct BotonApp: View {
    @Environment(\.sectionPalette) private var palette
    let icono: NSImage?
    let simbolo: String
    let etiqueta: String
    let accion: () -> Void
    var body: some View {
        Button(action: accion) {
            Group {
                if let icono {
                    Image(nsImage: icono).resizable().interpolation(.high)
                        .frame(width: 24, height: 24)
                } else {
                    Image(systemName: simbolo).font(.system(size: 14)).foregroundStyle(
                        palette.accent)
                }
            }.frame(width: 30, height: 28)
        }
        .buttonStyle(.borderless).pointerStyle(.link).help(etiqueta).accessibilityLabel(etiqueta)
    }
}

@MainActor enum ConsoleLauncher {
    static func openClaude(_ path: String, runtimeRoot: URL?) throws {
        try abrir("exec /bin/zsh -lic 'exec claude'", en: path, runtimeRoot: runtimeRoot)
    }
    // Lanza un script en consola y deja la shell abierta para leer su salida
    static func ejecutar(_ script: URL, runtimeRoot: URL?) throws {
        try abrir(
            "\(comillas(script.path))\nexec /bin/zsh -li",
            en: script.deletingLastPathComponent().path, runtimeRoot: runtimeRoot)
    }
    static func comillas(_ texto: String) -> String {
        "'" + texto.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
    // Escribe un .command que entra en la carpeta y ejecuta la orden en iTerm (o Terminal)
    private static func abrir(_ orden: String, en path: String, runtimeRoot: URL?) throws {
        guard let runtimeRoot else { throw ORIError.unavailable("ORI todavía está iniciando.") }
        let directory = runtimeRoot.deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Editor", isDirectory: true)
        try FileManager.default.createDirectory(
            at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700]
        )
        let identifier = SHA256.hash(data: Data((path + orden).utf8)).prefix(12).map {
            String(format: "%02x", $0)
        }.joined()
        let file = directory.appendingPathComponent("Consola-\(identifier).command")
        let command = "#!/bin/zsh\ncd -- \(comillas(path)) || exit 1\n\(orden)\n"
        try Data(command.utf8).write(to: file, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: file.path)
        // iTerm si está instalado; si no, la terminal por defecto de macOS
        if let iterm = NSWorkspace.shared.urlForApplication(withBundleIdentifier: ITERM_BUNDLE_ID) {
            NSWorkspace.shared.open(
                [file], withApplicationAt: iterm, configuration: NSWorkspace.OpenConfiguration())
            return
        }
        guard NSWorkspace.shared.open(file) else {
            throw ORIError.unavailable("No se pudo abrir la consola.")
        }
    }
}

@MainActor enum VSCodeLauncher {
    static func open(_ path: String, claude: Bool, runtimeRoot: URL?) throws {
        guard
            let application = NSWorkspace.shared.urlForApplication(
                withBundleIdentifier: "com.microsoft.VSCode")
        else {
            throw ORIError.unavailable("No se ha localizado Visual Studio Code en este Mac.")
        }
        var target = URL(fileURLWithPath: path)
        if claude {
            guard let runtimeRoot else { throw ORIError.unavailable("ORI todavía está iniciando.") }
            let editorRoot = runtimeRoot.deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("Editor", isDirectory: true)
            try FileManager.default.createDirectory(
                at: editorRoot, withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o700])
            let identifier = SHA256.hash(data: Data(path.utf8)).prefix(12).map {
                String(format: "%02x", $0)
            }.joined()
            target = editorRoot.appendingPathComponent("Claude-\(identifier).code-workspace")
            let workspace: [String: Any] = [
                "folders": [["path": path]],
                "tasks": [
                    "version": "2.0.0",
                    "tasks": [
                        [
                            "label": "ORI · Claude", "type": "process", "command": "/bin/zsh",
                            "args": ["-lic", "exec claude"], "options": ["cwd": path],
                            "runOptions": ["runOn": "folderOpen"],
                            "presentation": ["reveal": "always", "panel": "dedicated"],
                            "problemMatcher": [],
                        ]
                    ],
                ],
            ]
            try JSONSerialization.data(
                withJSONObject: workspace, options: [.prettyPrinted, .sortedKeys]
            ).write(to: target, options: .atomic)
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o600], ofItemAtPath: target.path)
        }
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.arguments = ["--new-window", target.path]
        NSWorkspace.shared.openApplication(at: application, configuration: configuration)
    }
}
