import ORICore
import SwiftUI

// Conexiones de Ivanti con sus acciones; se usa en Inicio y en Diagnósticos
struct PanelIvanti: View {
    @Environment(\.sectionPalette) private var palette
    @State private var conexiones: [ConexionIvanti] = []
    @State private var abierta = true
    @State private var error: String?
    @State private var ocupada: String?  // conexión con una orden en marcha
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Ivanti Secure Access", systemImage: "lock.shield")
                    .font(.callout.weight(.semibold))
                Spacer()
                if !abierta { Button("Abrir Ivanti") { abrir() } }
                Button {
                    Task { await leer() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }.help("Releer estado").accessibilityLabel("Releer estado de Ivanti")
            }
            if let error {
                Text(error).font(.caption).foregroundStyle(Theme.error).textSelection(.enabled)
            }
            if conexiones.isEmpty {
                Text(abierta ? "Ivanti no tiene conexiones configuradas." : "Ivanti está cerrada.")
                    .font(.callout).foregroundStyle(Theme.secondary)
            }
            ForEach(conexiones) { fila($0) }
        }.task { await leer() }
    }
    private func fila(_ conexion: ConexionIvanti) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(conexion.nombre).font(.callout.weight(.medium))
                Text(conexion.url).font(.caption).foregroundStyle(Theme.secondary).lineLimit(1)
                    .textSelection(.enabled)
            }
            Spacer()
            if ocupada == conexion.id { ProgressView().controlSize(.small) }
            StatusBadge(state: conexion.estadoNormalizado).help(conexion.estado)
            ForEach(conexion.acciones, id: \.orden) { accion in
                Button(accion.titulo, role: accion.orden == "DISCONNECT" ? .destructive : nil) {
                    Task { await enviar(accion.orden, conexion) }
                }.disabled(ocupada != nil)
            }
        }
    }
    private func leer() async {
        abierta = IvantiVPN.abierta
        guard abierta else {
            conexiones = []
            return
        }
        do {
            conexiones = try await IvantiVPN.conexiones()
            error = nil
        } catch { self.error = error.localizedDescription }
    }
    private func abrir() {
        IvantiVPN.abrir()
        Task {
            try? await Task.sleep(for: .seconds(3))
            await leer()
        }
    }
    // Ivanti tarda en cambiar de estado (y puede pedir MFA): se relee hasta ver el cambio
    private func enviar(_ orden: String, _ conexion: ConexionIvanti) async {
        ocupada = conexion.id
        defer { ocupada = nil }
        do {
            try await IvantiVPN.enviar(orden, a: conexion)
            for _ in 0..<10 {
                try await Task.sleep(for: .seconds(2))
                await leer()
                if conexiones.first(where: { $0.id == conexion.id })?.estado != conexion.estado {
                    break
                }
            }
        } catch { self.error = error.localizedDescription }
    }
}
