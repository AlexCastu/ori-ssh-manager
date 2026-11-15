import AppKit
import ORICore

// === Ivanti Secure Access: se controla con su diccionario AppleScript (PulseProperties.sdef) ===
private let RUTA_IVANTI = "/Applications/Ivanti Secure Access.app"
private let APP_IVANTI = "Ivanti Secure Access"
private let CMD_OSASCRIPT = "/usr/bin/osascript"
// La primera vez macOS pide permiso de Automatización: hay que dar tiempo a contestar
private let ESPERA_OSASCRIPT = Duration.seconds(60)

struct ConexionIvanti: Identifiable, Sendable {
    let id: String  // indexStr de Ivanti
    let nombre: String
    let estado: String
    let url: String
    // Estado en las claves de StatusBadge; Ivanti puede darlo en inglés o en español
    var estadoNormalizado: String {
        let texto = estado.lowercased()
        if texto.contains("suspend") { return "suspended" }
        if texto.contains("disconnect") || texto.contains("desconect") || texto.contains("idle") {
            return "disconnected"
        }
        if texto.contains("connecting") || texto.contains("conectando") { return "connecting" }
        if texto.contains("connect") || texto.contains("conect") { return "connected" }
        return texto
    }
    // Órdenes que tienen sentido en cada estado
    var acciones: [(orden: String, titulo: String)] {
        switch estadoNormalizado {
        case "connected": [("SUSPEND", "Suspender"), ("DISCONNECT", "Desconectar")]
        case "suspended": [("RESUME", "Reanudar"), ("DISCONNECT", "Desconectar")]
        case "connecting": [("DISCONNECT", "Cancelar")]
        default: [("CONNECT", "Conectar")]
        }
    }
}

enum IvantiVPN {
    static var instalado: Bool { FileManager.default.fileExists(atPath: RUTA_IVANTI) }
    static var abierta: Bool {
        NSWorkspace.shared.runningApplications.contains { $0.bundleURL?.path == RUTA_IVANTI }
    }
    static func abrir() {
        NSWorkspace.shared.openApplication(
            at: URL(fileURLWithPath: RUTA_IVANTI), configuration: .init())
    }

    // Solo pregunta si Ivanti ya está abierto: entrar en Diagnósticos no lo arranca
    static func conexiones() async throws -> [ConexionIvanti] {
        let script = """
            if application "\(APP_IVANTI)" is running then
                tell application "\(APP_IVANTI)"
                    set salida to ""
                    repeat with c in connections
                        set salida to salida & (indexStr of c) & tab & (connectionDisplayName of c) & tab & (connectionStatus of c) & tab & (connectionServerUrl of c) & linefeed
                    end repeat
                    return salida
                end tell
            end if
            """
        return try await ejecutar(script).split(separator: "\n").compactMap { linea in
            let campos = linea.split(separator: "\t", omittingEmptySubsequences: false)
                .map(String.init)
            guard campos.count == 4 else { return nil }
            return ConexionIvanti(id: campos[0], nombre: campos[1], estado: campos[2], url: campos[3])
        }
    }
    // orden: CONNECT, DISCONNECT, SUSPEND o RESUME. Usuario, contraseña y MFA los pide Ivanti
    static func enviar(_ orden: String, a conexion: ConexionIvanti) async throws {
        // El índice va dentro del script: solo se aceptan dígitos
        guard !conexion.id.isEmpty, conexion.id.allSatisfy(\.isNumber) else {
            throw ORIError.invalid("Índice de conexión Ivanti no válido.")
        }
        _ = try await ejecutar(
            "tell application \"\(APP_IVANTI)\" to do PulseMainUI command \"\(orden)\" ConnectionIndexStr \"\(conexion.id)\""
        )
    }
    private static func ejecutar(_ script: String) async throws -> String {
        let resultado = try await SystemCommandRunner().run(
            CMD_OSASCRIPT, ["-e", script], timeout: ESPERA_OSASCRIPT)
        guard resultado.status == 0 else {
            throw ORIError.unavailable(
                "Ivanti no respondió: "
                    + resultado.output.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return resultado.output
    }
}
