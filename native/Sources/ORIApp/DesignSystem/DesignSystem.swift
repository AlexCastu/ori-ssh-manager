import AppKit
import ORICore
import SwiftUI

@MainActor
enum Theme {
    nonisolated static func adaptive(_ dark: UInt32, _ light: UInt32) -> Color {
        Color(
            nsColor: NSColor(name: nil) { appearance in
                let value =
                    appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
                return NSColor(
                    srgbRed: Double((value >> 16) & 255) / 255,
                    green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255,
                    alpha: 1)
            })
    }
    static let background = adaptive(0x0B1B25, 0xF0F7F7)
    static let sidebar = adaptive(0x0E2630, 0xE2F0EE)
    static let surface = adaptive(0x15323D, 0xFFFFFF)
    static let elevated = adaptive(0x17424C, 0xDDF1EF)
    static let text = adaptive(0xF2F7FC, 0x203044)
    // Blanco opaco: el translúcido se mezclaba con el degradado y se veía gris
    static let secondary = Color(white: 0.9)
    static let border = adaptive(0x305461, 0xC4DEDF)
    static let purple = adaptive(0x55D6BC, 0x087A69)
    static let blue = adaptive(0x6CBFEF, 0x17698F)
    static let pink = adaptive(0x77B6DC, 0x2B718D)
    static let success = adaptive(0x49D4AA, 0x08765A)
    static let warning = adaptive(0xFFBF69, 0x8C5000)
    static let error = adaptive(0xFF8C9D, 0xAF253F)
    nonisolated static func hex(_ value: UInt32) -> Color {
        Color(
            red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255,
            blue: Double(value & 255) / 255)
    }
    static let radius: CGFloat = 20
    static let spacing: CGFloat = 20
    static let title = Font.system(size: 30, weight: .bold, design: .rounded)
    static let section = Font.system(size: 19, weight: .semibold, design: .rounded)
    static let monospaced = Font.system(size: 12, design: .monospaced)
    static func profileColor(_ name: String) -> Color {
        switch name {
        case "blue": adaptive(0x79BFFF, 0x2168BE)
        case "cyan": adaptive(0x6CDEEC, 0x087B92)
        case "green": adaptive(0x65E3AF, 0x0B7B54)
        case "orange": adaptive(0xFFBB78, 0xAA530B)
        case "yellow": adaptive(0xFFE18A, 0x8C6700)
        case "red": error
        case "pink": adaptive(0xF5A4D5, 0xAD347C)
        default: adaptive(0xC2AAFF, 0x7647BD)
        }
    }
    static func profileIcon(_ name: String) -> String {
        let legacy = [
            "server": "server.rack", "serverCog": "server.rack", "database": "externaldrive",
            "container": "shippingbox", "hardDrive": "internaldrive", "router": "wifi.router",
            "key": "key", "monitor": "display", "code": "chevron.left.forwardslash.chevron.right",
            "box": "shippingbox", "boxes": "shippingbox.fill", "layers": "square.3.layers.3d",
            "gitBranch": "arrow.triangle.branch", "mail": "envelope",
            "gauge": "gauge.with.dots.needle.33percent",
        ]
        let symbol = legacy[name] ?? name
        return NSImage(systemSymbolName: symbol, accessibilityDescription: nil) == nil
            ? "server.rack" : symbol
    }
    static func stateColor(_ state: String) -> Color {
        switch state {
        case "connected", "active", "confirmed": success
        case "connecting", "authenticating", "starting", "reconnecting", "inferred": warning
        case "failed", "degraded": error
        default: secondary
        }
    }
    static func stateLabel(_ state: String) -> String {
        switch state {
        case "disconnected": "Desconectado"
        case "connecting": "Conectando"
        case "authenticating": "Autenticando"
        case "connected": "Conectado"
        case "reconnecting": "Reconectando"
        case "disconnecting": "Desconectando"
        case "failed": "Error"
        case "stopped": "Detenido"
        case "starting": "Iniciando"
        case "active": "Reenvío establecido"
        case "stopping": "Deteniendo"
        case "unknown": "Desconocido"
        case "degraded": "Degradado"
        case "confirmed": "Confirmado"
        case "inferred": "Inferido"
        default: state
        }
    }
}

// Estilo CleanMyMac: fondo grafito para toda la app y encima todo es vidrio
// (blanco translúcido). Solo tema oscuro: el texto va siempre en blanco.
struct SectionPalette: Sendable {
    let accent: Color  // tono claro para iconos y selección
    let primary: Color  // relleno de los botones principales
    let inicio: Color  // esquina superior izquierda, oscura
    let fin: Color  // esquina inferior derecha, viva
    let brillo: Color  // halo de la esquina superior derecha
    let sidebar = Color.black.opacity(0.22)
    let surface = Color.white.opacity(0.08)
    let elevated = Color.white.opacity(0.14)
    let border = Color.white.opacity(0.16)
    var sombra: Color { inicio.mix(with: .black, by: 0.4) }
    var background: Color { inicio.mix(with: .black, by: 0.2) }

    private init(accent: UInt32, primary: UInt32, inicio: UInt32, fin: UInt32, brillo: UInt32) {
        self.accent = Theme.hex(accent)
        self.primary = Theme.hex(primary)
        self.inicio = Theme.hex(inicio)
        self.fin = Theme.hex(fin)
        self.brillo = Theme.hex(brillo)
    }
    var gradient: LinearGradient {
        LinearGradient(
            colors: [accent, brillo], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
    static let graphite = Self(
        accent: 0xC3D0EA, primary: 0x5B6E92, inicio: 0x1A1F2B, fin: 0x3A4458, brillo: 0x8FA3C7)
}

// Fondo de sección: malla de degradado con halo arriba a la derecha y sombra abajo a la izquierda
struct FondoSeccion: View {
    let palette: SectionPalette
    var body: some View {
        MeshGradient(
            width: 3, height: 3,
            points: [
                [0, 0], [0.5, 0], [1, 0],
                [0, 0.5], [0.6, 0.45], [1, 0.5],
                [0, 1], [0.5, 1], [1, 1],
            ],
            colors: [
                // Halo atenuado: a plena intensidad el texto blanco se perdía encima
                palette.inicio, palette.inicio, palette.brillo.mix(with: palette.fin, by: 0.5),
                palette.inicio, palette.fin, palette.fin,
                palette.sombra, palette.inicio, palette.fin,
            ]
        ).ignoresSafeArea()
    }
}

// Línea vertical que se desvanece arriba y abajo
struct LineaDivisoria: View {
    var body: some View {
        LinearGradient(
            colors: [.white.opacity(0.02), .white.opacity(0.14), .white.opacity(0.02)],
            startPoint: .top, endPoint: .bottom
        ).frame(width: 1).ignoresSafeArea()
    }
}

private struct SectionPaletteKey: EnvironmentKey {
    static let defaultValue = SectionPalette.graphite
}

extension EnvironmentValues {
    var sectionPalette: SectionPalette {
        get { self[SectionPaletteKey.self] }
        set { self[SectionPaletteKey.self] = newValue }
    }
}

struct Card<Content: View>: View {
    @Environment(\.sectionPalette) private var palette
    var accented = false
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .padding(Theme.spacing).frame(maxWidth: .infinity, alignment: .leading)
            .background(
                accented ? palette.elevated : palette.surface,
                in: RoundedRectangle(cornerRadius: Theme.radius)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius).stroke(
                    palette.border.opacity(0.6), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.07), radius: 12, y: 4)
    }
}
struct StatusBadge: View {
    let state: String
    var body: some View {
        Label(
            Theme.stateLabel(state),
            systemImage: state == "unknown" ? "questionmark.circle.fill" : "circle.fill"
        )
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(Theme.stateColor(state)).padding(.horizontal, 10).padding(.vertical, 5)
        .background(Theme.stateColor(state).opacity(0.12), in: Capsule())
        .accessibilityLabel("Estado: \(Theme.stateLabel(state))")
    }
}
struct PageHeader: View {
    @Environment(\.sectionPalette) private var palette
    let title: String
    let subtitle: String
    var body: some View {
        HStack(spacing: 14) {
            Capsule().fill(palette.accent).frame(width: 4, height: 44)
            VStack(alignment: .leading, spacing: 7) {
                Text(title).font(Theme.title).foregroundStyle(Theme.text)
                Text(subtitle).font(.callout).foregroundStyle(Theme.secondary)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
struct EmptyPanel: View {
    @Environment(\.sectionPalette) private var palette
    let title: String
    let subtitle: String
    let icon: String
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: icon).font(.system(size: 44, weight: .light)).foregroundStyle(
                palette.gradient)
            Text(title).font(Theme.section)
            Text(subtitle).font(.callout).foregroundStyle(Theme.secondary).multilineTextAlignment(
                .center
            ).frame(maxWidth: 430)
        }.padding(50).frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.sectionPalette) private var palette
    @Environment(\.isEnabled) private var isEnabled
    var compact = false
    func makeBody(configuration: ButtonStyleConfiguration) -> some View {
        configuration.label.font(.system(size: compact ? 12 : 13, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, compact ? 12 : 16).padding(.vertical, compact ? 6 : 10)
            .background(
                LinearGradient(
                    colors: [palette.primary, palette.primary.mix(with: .white, by: 0.2)],
                    startPoint: .leading, endPoint: .trailing), in: Capsule()
            )
            .overlay(Capsule().stroke(.white.opacity(0.25), lineWidth: 1))
            .shadow(color: palette.primary.opacity(0.45), radius: 8, y: 3)
            .contentShape(Capsule())
            .pointerStyle(.link)
            .opacity(configuration.isPressed ? 0.8 : (isEnabled ? 1 : 0.45))
    }
}
// Cápsula para buscadores, grupos de iconos y botones secundarios
private struct CapsulaControl: ViewModifier {
    @Environment(\.sectionPalette) private var palette
    var resaltada: Bool
    func body(content: Content) -> some View {
        content.padding(.horizontal, 10).padding(.vertical, 6)
            .background(
                resaltada ? palette.accent.opacity(0.18) : palette.elevated.opacity(0.6),
                in: Capsule()
            )
            .overlay(
                Capsule().stroke(
                    resaltada ? palette.accent.opacity(0.4) : palette.border.opacity(0.5),
                    lineWidth: 1))
    }
}
// Campo con texto de ayuda propio: el del sistema sale gris al tener el foco
struct CampoTexto: View {
    let ayuda: String
    @Binding var texto: String
    var secreto = false
    var body: some View {
        ZStack(alignment: .leading) {
            if texto.isEmpty {
                Text(ayuda).foregroundStyle(Theme.secondary).accessibilityHidden(true)
            }
            if secreto {
                SecureField(ayuda, text: $texto, prompt: Text("")).textFieldStyle(.plain)
            } else {
                TextField(ayuda, text: $texto, prompt: Text("")).textFieldStyle(.plain)
            }
        }
    }
}
// Campo de formulario: título pequeño encima y caja redondeada de vidrio
struct CampoFormulario<Contenido: View>: View {
    @Environment(\.sectionPalette) private var palette
    let titulo: String
    var caja = true
    @ViewBuilder var contenido: Contenido
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(titulo.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.8)
                .foregroundStyle(Theme.secondary)
            if caja {
                contenido.padding(.horizontal, 12).padding(.vertical, 9)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(palette.elevated.opacity(0.55), in: RoundedRectangle(cornerRadius: 10))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10).stroke(palette.border.opacity(0.6)))
            } else {
                contenido
            }
        }
    }
}
// Rejilla de iconos ya dibujados, pintados con el color del perfil
struct SelectorIcono: View {
    @Environment(\.sectionPalette) private var palette
    @Binding var icono: String
    let color: Color
    static let ICONOS = [
        "server.rack", "terminal", "externaldrive", "internaldrive", "cpu", "memorychip",
        "shippingbox", "shippingbox.fill", "square.3.layers.3d", "cloud", "globe", "network",
        "wifi.router", "antenna.radiowaves.left.and.right", "lock.shield", "key", "display",
        "chevron.left.forwardslash.chevron.right", "arrow.triangle.branch", "envelope",
        "gauge.with.dots.needle.33percent", "building.2", "flask", "hammer",
    ]
    // Si el perfil trae un icono fuera de la lista, se muestra el primero
    private var opciones: [String] {
        let actual = Theme.profileIcon(icono)
        return Self.ICONOS.contains(actual) ? Self.ICONOS : [actual] + Self.ICONOS
    }
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 40), spacing: 8)], spacing: 8) {
            ForEach(opciones, id: \.self) { simbolo in
                let elegido = Theme.profileIcon(icono) == simbolo
                Button {
                    icono = simbolo
                } label: {
                    Image(systemName: simbolo).font(.system(size: 15))
                        .foregroundStyle(elegido ? color : Theme.text)
                        .frame(width: 40, height: 40)
                        .background(
                            elegido ? color.opacity(0.2) : palette.elevated.opacity(0.45),
                            in: RoundedRectangle(cornerRadius: 10)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 10).stroke(
                                elegido ? color : palette.border.opacity(0.5),
                                lineWidth: elegido ? 1.5 : 1))
                        .contentShape(Rectangle())
                }.buttonStyle(.plain).pointerStyle(.link).help(simbolo)
                    .accessibilityLabel(simbolo).accessibilityAddTraits(elegido ? .isSelected : [])
            }
        }
    }
}
// Muestras de color redondas; la elegida lleva aro blanco
struct SelectorColor: View {
    @Binding var color: String
    static let COLORES = [
        ("blue", "Azul"), ("cyan", "Cian"), ("green", "Verde"), ("yellow", "Amarillo"),
        ("orange", "Naranja"), ("red", "Rojo"), ("pink", "Rosa"), ("purple", "Morado"),
    ]
    var body: some View {
        HStack(spacing: 12) {
            ForEach(Self.COLORES, id: \.0) { nombre, etiqueta in
                Button {
                    color = nombre
                } label: {
                    Circle().fill(Theme.profileColor(nombre)).frame(width: 24, height: 24)
                        .padding(4)
                        .overlay(Circle().stroke(.white, lineWidth: color == nombre ? 2 : 0))
                        .contentShape(Circle())
                }.buttonStyle(.plain).pointerStyle(.link).help(etiqueta)
                    .accessibilityLabel(etiqueta)
                    .accessibilityAddTraits(color == nombre ? .isSelected : [])
            }
        }
    }
}
// Buscador en cápsula con lupa
struct CampoBusqueda: View {
    let ayuda: String
    @Binding var texto: String
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass").foregroundStyle(Theme.secondary)
            CampoTexto(ayuda: ayuda, texto: $texto)
        }.capsulaControl()
    }
}
extension View {
    func capsulaControl(resaltada: Bool = false) -> some View {
        modifier(CapsulaControl(resaltada: resaltada))
    }
}
struct SecondaryButtonStyle: ButtonStyle {
    @Environment(\.sectionPalette) private var palette
    @Environment(\.isEnabled) private var isEnabled
    var activo = false
    func makeBody(configuration: ButtonStyleConfiguration) -> some View {
        configuration.label.font(.system(size: 12, weight: .semibold))
            .foregroundStyle(
                configuration.role == .destructive
                    ? Theme.error : (activo ? palette.accent : Theme.text)
            )
            .capsulaControl(resaltada: activo)
            .contentShape(Capsule())
            .pointerStyle(.link)
            .opacity(configuration.isPressed ? 0.7 : (isEnabled ? 1 : 0.45))
    }
}
