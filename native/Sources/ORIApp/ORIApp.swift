import AppKit
import SwiftUI

@MainActor
final class AppLifecycle: NSObject, NSApplicationDelegate {
    weak var container: AppContainer?
    private var quitting = false
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard !quitting else { return .terminateLater }
        quitting = true
        Task {
            await container?.shutdown()
            sender.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }
}

@main
enum ORIEntry {
    @MainActor static func main() {
        if CommandLine.arguments.dropFirst().first == "--ssh-askpass" {
            exit(SSHAskpass.run(arguments: CommandLine.arguments))
        }
        ORIApp.main()
    }
}

struct ORIApp: App {
    @NSApplicationDelegateAdaptor(AppLifecycle.self) private var lifecycle
    @State private var container = AppContainer()
    var body: some Scene {
        Window("ORI · Infraestructura", id: "main") {
            RootView(app: container).task { lifecycle.container = container }
        }.defaultSize(width: 1280, height: 820)
            .windowStyle(.hiddenTitleBar)
            .windowResizability(.contentMinSize)
            .commands { ORICommands(app: container) }
    }
}
struct ORICommands: Commands {
    let app: AppContainer
    @Environment(\.openWindow) private var openWindow
    var body: some Commands {
        CommandGroup(after: .newItem) {
            Button("Mostrar ORI") { openWindow(id: "main") }.keyboardShortcut("0")
            Button("Nueva conexión SSH") {
                openWindow(id: "main")
                app.editingHost = nil
                app.hostEditor = true
            }.keyboardShortcut("n")
            Button("Buscar conexión") {
                openWindow(id: "main")
                app.commandPalette = true
            }.keyboardShortcut("k")
        }
        CommandGroup(replacing: .appSettings) {
            Button("Ajustes…") {
                openWindow(id: "main")
                app.section = .settings
            }.keyboardShortcut(",")
        }
    }
}
