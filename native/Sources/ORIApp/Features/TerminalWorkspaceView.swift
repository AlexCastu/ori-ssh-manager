import AppKit
import ORICore
import SwiftUI

// === Diseño de la ventana de terminal ===
private let RADIO_VENTANA: CGFloat = 12
private let MARGEN_VENTANA: CGFloat = 10
private let RELLENO_TERMINAL = EdgeInsets(top: 10, leading: 14, bottom: 10, trailing: 14)
private let ANCHO_PESTANA: ClosedRange<CGFloat> = 130...220

struct TerminalWorkspaceView: View {
    @Bindable var app: AppContainer
    @Environment(\.sectionPalette) private var palette
    @State private var find = ""
    @State private var closingID: String?
    private var fondoTerminal: Color {
        Color(nsColor: TerminalSessionController.colorFondo(app.configuration.settings))
    }
    private var textoTerminal: Color {
        Color(nsColor: TerminalSessionController.colorTexto(app.configuration.settings))
    }
    var body: some View {
        VStack(spacing: 0) {
            if app.sessions.sessions.isEmpty {
                EmptyPanel(
                    title: "Tu terminal está lista",
                    subtitle:
                        "Selecciona un servidor para abrir una sesión SSH interactiva con PTY real.",
                    icon: "terminal")
                HStack(spacing: 12) {
                    Button("Terminal local") { app.abrirTerminalLocal() }
                    Button("Elegir servidor") { app.commandPalette = true }.buttonStyle(
                        PrimaryButtonStyle())
                }.padding(.bottom, 40)
            } else {
                ventana
            }
        }
        .confirmationDialog(
            "Cerrar sesión SSH",
            isPresented: Binding(get: { closingID != nil }, set: { if !$0 { closingID = nil } })
        ) {
            Button("Desconectar y cerrar pestaña", role: .destructive) {
                if let id = closingID { Task { await app.sessions.close(id) } }
                closingID = nil
            }
        } message: {
            Text(
                "Esta acción termina la sesión. Los túneles administrados por separado continúan activos."
            )
        }
    }
    // Pestañas arriba y terminal debajo, todo dentro de una sola ventana redondeada
    private var ventana: some View {
        VStack(spacing: 0) {
            barraPestanas
            if let session = app.sessions.selected {
                if let error = session.model.diagnostic {
                    Label(error.message, systemImage: "exclamationmark.triangle.fill")
                        .font(.callout).foregroundStyle(Theme.error)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Theme.error.opacity(0.12))
                }
                SwiftTermView(session: session).id(session.id)
                    .accessibilityIdentifier("ssh-terminal")
                    .padding(RELLENO_TERMINAL)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(fondoTerminal)
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .background(palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: RADIO_VENTANA))
        .overlay(
            RoundedRectangle(cornerRadius: RADIO_VENTANA).stroke(
                palette.border.opacity(0.6), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
        .padding(MARGEN_VENTANA)
    }
    private var barraPestanas: some View {
        HStack(spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .bottom, spacing: 2) {
                    ForEach(app.sessions.sessions) { pestana($0) }
                    Button {
                        app.commandPalette = true
                    } label: {
                        Image(systemName: "plus").font(.system(size: 12, weight: .semibold))
                    }
                    .buttonStyle(.borderless).pointerStyle(.link)
                        .padding(.horizontal, 8).padding(.bottom, 8)
                    .help("Abrir otra sesión").accessibilityLabel("Abrir otra sesión")
                    Button {
                        app.abrirTerminalLocal()
                    } label: {
                        Image(systemName: "apple.terminal").font(.system(size: 12, weight: .semibold))
                    }
                    .buttonStyle(.borderless).pointerStyle(.link)
                    .padding(.horizontal, 8).padding(.bottom, 8)
                    .help("Terminal local").accessibilityLabel("Abrir terminal local")
                }.padding(.leading, 8).padding(.top, 6)
            }
            if let session = app.sessions.selected { acciones(session) }
        }
    }
    // Pestaña tipo ventana: la activa toma el color del terminal y se funde con él
    private func pestana(_ session: TerminalSessionController) -> some View {
        let activa = session.id == app.sessions.selectedID
        let estado = session.model.state.rawValue
        return HStack(spacing: 8) {
            Button {
                app.sessions.selectedID = session.id
            } label: {
                HStack(spacing: 8) {
                    Circle().fill(Theme.stateColor(estado)).frame(width: 7, height: 7)
                    Text(session.title).lineLimit(1)
                    Spacer(minLength: 0)
                }.contentShape(Rectangle())
            }
            .buttonStyle(.plain).pointerStyle(.link)
            .help("\(session.host.address) · \(Theme.stateLabel(estado))")
            .accessibilityValue(Theme.stateLabel(estado))
            Button {
                closingID = session.id
            } label: {
                Image(systemName: "xmark").font(.system(size: 9, weight: .bold))
            }
            .buttonStyle(.plain).pointerStyle(.link)
            .accessibilityLabel("Cerrar sesión \(session.title)")
        }
        .font(.system(size: 12, weight: activa ? .semibold : .regular))
        .foregroundStyle(activa ? textoTerminal : Theme.secondary)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .frame(minWidth: ANCHO_PESTANA.lowerBound, maxWidth: ANCHO_PESTANA.upperBound)
        .background(
            activa ? fondoTerminal : palette.elevated.opacity(0.35),
            in: UnevenRoundedRectangle(topLeadingRadius: 8, topTrailingRadius: 8))
    }
    private func acciones(_ session: TerminalSessionController) -> some View {
        HStack(spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass").foregroundStyle(Theme.secondary)
                CampoTexto(ayuda: "Buscar salida", texto: $find).frame(width: 130)
                    .onSubmit { _ = session.terminal.findNext(find) }
                Button {
                    _ = session.terminal.findPrevious(find)
                } label: {
                    Image(systemName: "chevron.up")
                }.pointerStyle(.link).help("Coincidencia anterior")
                Button {
                    _ = session.terminal.findNext(find)
                } label: {
                    Image(systemName: "chevron.down")
                }.pointerStyle(.link).help("Coincidencia siguiente")
            }
            .capsulaControl()
            Menu {
                Button("Copiar salida") { session.copyOutput() }
                Button("Copiar último comando y salida") { session.copyOutput(lastBlock: true) }
                Button("Aumentar fuente") { changeFont(1) }
                Button("Reducir fuente") { changeFont(-1) }
            } label: {
                Image(systemName: "ellipsis.circle")
            }.menuStyle(.borderlessButton).pointerStyle(.link).fixedSize()
                .accessibilityLabel("Acciones de terminal")
            if session.terminal.process.running {
                Button {
                    Task { await session.disconnect() }
                } label: {
                    Image(systemName: "power")
                }.pointerStyle(.link).help("Desconectar").accessibilityLabel("Desconectar")
            } else {
                Button {
                    Task { do { try await session.reconnect() } catch { app.report(error) } }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }.pointerStyle(.link).help("Reconectar").accessibilityLabel("Reconectar")
            }
        }
        .buttonStyle(.borderless).font(.system(size: 12))
        .padding(.trailing, 12)
    }
    private func changeFont(_ delta: Double) {
        Task {
            do {
                try await app.save {
                    $0.settings.fontSize = min(28, max(10, $0.settings.fontSize + delta))
                }
            } catch { app.report(error) }
        }
    }
}
