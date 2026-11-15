import AppKit
import ORICore
import Observation
import SwiftUI

// === Scripts ===
private let EXTENSIONES_SCRIPT: Set<String> = ["sh", "bash", "zsh", "command"]
private let TIEMPO_MAXIMO = Duration.seconds(300)
private let MAXIMO_SALIDA = 1_048_576
private let PLANTILLA_SCRIPT = "#!/bin/bash\nset -euo pipefail\n\n"
// Shell de login (PATH de Homebrew, etc.), en la carpeta del script; sin permiso +x va con bash
private let LANZADOR =
    #"cd -- "${0:h}" && { [ -x "$0" ] && exec "$0" || exec /bin/bash "$0"; }"#

// Última ejecución de cada script; solo en memoria
struct EjecucionScript {
    var enCurso = true
    var codigo: Int32?
    var salida = ""
    var duracion = Duration.zero
}

@MainActor @Observable
final class ScriptsController {
    var scripts: [URL] = []
    var ejecuciones: [URL: EjecucionScript] = [:]
    private var tareas: [URL: Task<Void, Never>] = [:]

    // ponytail: recorrido completo en el hilo principal; limitar profundidad si la carpeta es enorme
    func cargar(_ carpeta: String) {
        let raiz = URL(fileURLWithPath: carpeta, isDirectory: true)
        let recorrido = FileManager.default.enumerator(
            at: raiz, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])
        scripts = (recorrido?.allObjects as? [URL] ?? [])
            .filter { EXTENSIONES_SCRIPT.contains($0.pathExtension.lowercased()) }
            .sorted { $0.path.localizedStandardCompare($1.path) == .orderedAscending }
    }
    // La salida se va publicando según llega; al terminar se añaden código y notas
    func ejecutar(_ script: URL) {
        guard ejecuciones[script]?.enCurso != true else { return }
        ejecuciones[script] = EjecucionScript()
        let inicio = ContinuousClock.now
        tareas[script] = Task {
            let supervisor = ProcessSupervisor()
            var bytes = Data()
            var nota = ""
            do {
                let proceso = try await supervisor.start(
                    executable: "/bin/zsh", arguments: ["-lc", LANZADOR, script.path],
                    environment: ProcessInfo.processInfo.environment)
                let limite = Task {
                    do { try await Task.sleep(for: TIEMPO_MAXIMO) } catch { return false }
                    await supervisor.stop(proceso.id)
                    return true
                }
                await withTaskCancellationHandler {
                    for await evento in proceso.events {
                        switch evento {
                        case .output(let datos) where bytes.count < MAXIMO_SALIDA:
                            bytes.append(datos)
                            // ponytail: redecodifica todo en cada trozo; vale hasta el tope de 1 MB
                            ejecuciones[script]?.salida = String(decoding: bytes, as: UTF8.self)
                        case .output: break
                        case .exited(let codigo): ejecuciones[script]?.codigo = codigo
                        }
                    }
                } onCancel: {
                    Task { await supervisor.stop(proceso.id) }
                }
                limite.cancel()
                if await limite.value { nota = "Tiempo agotado (5 min)." }
            } catch {
                nota = error.localizedDescription
            }
            if Task.isCancelled { nota = "Detenido." }
            if bytes.count >= MAXIMO_SALIDA { nota += " Salida recortada a 1 MB." }
            var final = ejecuciones[script] ?? EjecucionScript()
            final.enCurso = false
            final.duracion = ContinuousClock.now - inicio
            if !nota.isEmpty { final.salida += (final.salida.isEmpty ? "" : "\n") + nota }
            ejecuciones[script] = final
            tareas[script] = nil
        }
    }
    func detener(_ script: URL) { tareas[script]?.cancel() }
    func detenerTodo() async {
        for tarea in tareas.values {
            tarea.cancel()
            await tarea.value
        }
    }
}

extension AppContainer {
    // Favoritos que siguen existiendo en disco
    var scriptsFavoritos: [URL] {
        (configuration.settings.scriptFavorites ?? []).map { URL(fileURLWithPath: $0) }
            .filter { FileManager.default.fileExists(atPath: $0.path) }
    }
    func alternarFavorito(_ script: URL) {
        Task {
            do {
                try await save { c in
                    var favoritos = c.settings.scriptFavorites ?? []
                    if let i = favoritos.firstIndex(of: script.path) {
                        favoritos.remove(at: i)
                    } else {
                        favoritos.append(script.path)
                    }
                    c.settings.scriptFavorites = favoritos
                }
            } catch { report(error) }
        }
    }
}

// Estado de la última ejecución: en curso, correcta, con error o sin lanzar
struct IconoEjecucion: View {
    @Environment(\.sectionPalette) private var palette
    let ejecucion: EjecucionScript?
    var body: some View {
        if ejecucion?.enCurso == true {
            ProgressView().controlSize(.small)
        } else if let ejecucion {
            let correcto = ejecucion.codigo == 0
            Image(systemName: correcto ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.system(size: 18)).foregroundStyle(correcto ? Theme.success : Theme.error)
        } else {
            Image(systemName: "scroll").font(.system(size: 18)).foregroundStyle(palette.accent)
        }
    }
}

// Script que se está creando (url nil) o editando
struct ScriptEditado: Identifiable {
    var url: URL?
    var nombre = ""
    var contenido = PLANTILLA_SCRIPT
    var id: String { url?.path ?? "nuevo" }
}

struct ScriptsView: View {
    @Bindable var app: AppContainer
    @Environment(\.sectionPalette) private var palette
    @State private var query = ""
    @State private var salidaVisible: URL?
    @State private var editando: ScriptEditado?
    private var controller: ScriptsController { app.scripts }
    private var carpeta: String? { app.configuration.settings.scriptsFolder }
    private var filtrados: [URL] {
        controller.scripts.filter {
            query.isEmpty || $0.lastPathComponent.localizedCaseInsensitiveContains(query)
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            PageHeader(
                title: "Scripts", subtitle: "Lanza tus .sh, revisa su salida y crea nuevos.")
            HStack(spacing: 10) {
                CampoBusqueda(ayuda: "Buscar script", texto: $query).frame(width: 280)
                Button {
                    elegirCarpeta()
                } label: {
                    Label(
                        carpeta.map { URL(fileURLWithPath: $0).lastPathComponent }
                            ?? "Elegir carpeta", systemImage: "folder")
                }.help(carpeta ?? "Carpeta de scripts")
                Button {
                    if let carpeta { controller.cargar(carpeta) }
                } label: {
                    Label("Actualizar", systemImage: "arrow.clockwise")
                }.disabled(carpeta == nil)
                Spacer()
                Button {
                    editando = ScriptEditado()
                } label: {
                    Label("Nuevo script", systemImage: "plus")
                }.buttonStyle(PrimaryButtonStyle()).disabled(carpeta == nil)
            }
            if carpeta == nil {
                EmptyPanel(
                    title: "Tus scripts, a mano",
                    subtitle: "Elige la carpeta donde guardas tus .sh para lanzarlos desde aquí.",
                    icon: "scroll")
            } else if filtrados.isEmpty {
                EmptyPanel(
                    title: "Sin scripts", subtitle: "No hay .sh en la carpeta o no coinciden.",
                    icon: "doc.badge.plus")
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(filtrados, id: \.self) { fila($0) }
                    }.padding(.bottom, 16)
                }
            }
        }.padding(28)
            .onAppear { if let carpeta, controller.scripts.isEmpty { controller.cargar(carpeta) } }
            .sheet(item: $editando) { borrador in
                EditorScript(app: app, borrador: borrador, carpeta: carpeta ?? "")
            }
    }
    private func fila(_ script: URL) -> some View {
        let ejecucion = controller.ejecuciones[script]
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 14) {
                IconoEjecucion(ejecucion: ejecucion).frame(width: 22)
                VStack(alignment: .leading, spacing: 3) {
                    Text(script.deletingPathExtension().lastPathComponent)
                        .font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    Text(resumen(script, ejecucion)).font(.caption)
                        .foregroundStyle(Theme.secondary).lineLimit(1)
                }.help(script.path)
                Spacer()
                if ejecucion?.enCurso == true {
                    Button("Detener", role: .destructive) { controller.detener(script) }
                } else {
                    Button {
                        controller.ejecutar(script)
                        salidaVisible = script
                    } label: {
                        Label("Ejecutar", systemImage: "play.fill")
                    }.buttonStyle(PrimaryButtonStyle(compact: true))
                }
                HStack(spacing: 2) {
                    let favorito = app.configuration.settings.scriptFavorites?.contains(
                        script.path) == true
                    BotonIcono(
                        simbolo: favorito ? "star.fill" : "star",
                        etiqueta: favorito ? "Quitar de Inicio" : "Fijar en Inicio"
                    ) { app.alternarFavorito(script) }
                    BotonIcono(simbolo: "terminal", etiqueta: "Ejecutar en terminal") {
                        do {
                            try ConsoleLauncher.ejecutar(script, runtimeRoot: app.runtimeRoot)
                        } catch { app.report(error) }
                    }
                    BotonIcono(simbolo: "text.alignleft", etiqueta: "Ver salida") {
                        salidaVisible = salidaVisible == script ? nil : script
                    }.disabled(ejecucion == nil)
                    BotonIcono(simbolo: "pencil", etiqueta: "Editar aquí") { editar(script) }
                    BotonApp(
                        icono: IconoApp.vscode, simbolo: "chevron.left.forwardslash.chevron.right",
                        etiqueta: "Abrir en VS Code"
                    ) {
                        do {
                            try VSCodeLauncher.open(
                                script.path, claude: false, runtimeRoot: app.runtimeRoot)
                        } catch { app.report(error) }
                    }
                }.capsulaControl()
            }
            if salidaVisible == script, let ejecucion {
                ScrollView {
                    Text(textoSalida(ejecucion))
                        .font(Theme.monospaced).textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }.defaultScrollAnchor(.bottom).frame(maxHeight: 220).padding(10)
                    .background(.black.opacity(0.3), in: RoundedRectangle(cornerRadius: 8))
            }
        }.padding(.horizontal, 16).padding(.vertical, 13)
            .background(palette.surface, in: RoundedRectangle(cornerRadius: 12))
    }
    private func resumen(_ script: URL, _ ejecucion: EjecucionScript?) -> String {
        let subcarpeta = script.deletingLastPathComponent().lastPathComponent
        guard let ejecucion, !ejecucion.enCurso else { return subcarpeta }
        let segundos = ejecucion.duracion.formatted(.units(allowed: [.seconds], width: .narrow))
        let codigo = ejecucion.codigo.map { "código \($0)" } ?? "sin terminar"
        return "\(subcarpeta) · \(codigo) · \(segundos)"
    }
    private func textoSalida(_ ejecucion: EjecucionScript) -> String {
        guard ejecucion.salida.isEmpty else { return ejecucion.salida }
        return ejecucion.enCurso ? "Ejecutando…" : "(sin salida)"
    }
    private func editar(_ script: URL) {
        do {
            let contenido = try String(contentsOf: script, encoding: .utf8)
            editando = ScriptEditado(
                url: script, nombre: script.lastPathComponent, contenido: contenido)
        } catch { app.report(error) }
    }
    private func elegirCarpeta() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.message = "Elige la carpeta donde guardas tus scripts."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        Task {
            do {
                try await app.save { $0.settings.scriptsFolder = url.path }
                controller.cargar(url.path)
            } catch { app.report(error) }
        }
    }
}

// Editor sencillo: crea el .sh con permiso de ejecución o guarda los cambios
struct EditorScript: View {
    @Bindable var app: AppContainer
    @State var borrador: ScriptEditado
    let carpeta: String
    @Environment(\.dismiss) private var dismiss
    private var nombreFichero: String {
        let limpio = borrador.nombre.trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: "/", with: "-")
        let tieneExtension = EXTENSIONES_SCRIPT.contains(
            URL(fileURLWithPath: limpio).pathExtension.lowercased())
        return tieneExtension ? limpio : limpio + ".sh"
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(borrador.url == nil ? "Nuevo script" : "Editar \(borrador.nombre)")
                .font(.title2.bold())
            if borrador.url == nil {
                CampoTexto(ayuda: "Nombre del script", texto: $borrador.nombre).capsulaControl()
            }
            TextEditor(text: $borrador.contenido).font(Theme.monospaced)
                .scrollContentBackground(.hidden).padding(8)
                .background(.black.opacity(0.3), in: RoundedRectangle(cornerRadius: 8))
                .frame(minHeight: 320)
            HStack {
                Button("Cancelar") { dismiss() }.keyboardShortcut(.cancelAction)
                Spacer()
                Button("Guardar") { guardar() }.keyboardShortcut(.defaultAction)
                    .buttonStyle(PrimaryButtonStyle(compact: true))
                    .disabled(borrador.nombre.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }.padding(24).frame(width: 640)
    }
    private func guardar() {
        let destino =
            borrador.url
            ?? URL(fileURLWithPath: carpeta).appendingPathComponent(nombreFichero)
        do {
            if borrador.url == nil, FileManager.default.fileExists(atPath: destino.path) {
                throw ORIError.invalid("Ya existe un script con ese nombre.")
            }
            try Data(borrador.contenido.utf8).write(to: destino, options: .atomic)
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o755], ofItemAtPath: destino.path)
            app.scripts.cargar(carpeta)
            dismiss()
        } catch { app.report(error) }
    }
}
