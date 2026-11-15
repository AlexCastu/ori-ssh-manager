# Entrega de la implementación nativa

Actualización posterior: VPN e Ivanti se han retirado de la interfaz y del flujo
de conexión. Las contraseñas se guardan en un almacén propio y la exportación
completa las incluye cifradas. Véase [CREDENTIALS_PORTABLE.md](CREDENTIALS_PORTABLE.md).
Las limitaciones de credenciales/VPN que siguen pertenecen a la entrega anterior.

Evolución posterior: [conexiones, diagrama, repositorios e importación del
2026-11-15](ENTREGA-CONEXIONES.md). El mapa de solo lectura y las limitaciones de
drag/drop descritos más abajo corresponden a la entrega inicial de este documento.

Fecha: 2026-11-14. Rama: `fix/tareas-revision`. No se han creado commits.

## Resultado

Se ha implementado una aplicación macOS SwiftUI/AppKit con OpenSSH, SwiftTerm/PTy,
GRDB y módulos de VPN/diagnóstico. El producto compilado está en
`native/build/ORI.app`. La aplicación histórica sigue disponible mientras se valida
paridad real y los aspectos manuales pendientes. No se declara cerrada la migración
integral ni autorizada la retirada de Tauri.

## Auditoría y arquitectura

La auditoría real, matriz de funciones y riesgos están en AUDIT.md. El punto de
partida era Tauri/React/russh, con SQLite y cifrado de campos; el README original
estaba desactualizado. Se preservaron los fuentes y pruebas anteriores y se
separaron los datos nativos. ARCHITECTURE.md describe cuatro capas: presentación,
coordinación de aplicación, dominio y adaptadores de infraestructura.

## Implementación entregada

- CRUD de hosts, carpetas anidadas/ordenadas, etiquetas, favoritos, notas e iconos.
- Perfiles de conexión, saltos manuales/referenciados, ProxyJump y claves por salto.
- Terminales reales con PTY, estado verificado, Unicode/ANSI, resize, selección,
  copia/pegado, búsqueda, copia del último bloque, varias sesiones y registro
  propietario independiente del renderizado de SwiftUI.
- Comandos guardados globales/por servidor, confirmación de ejecución y auditoría
  de eventos sin capturar el teclado.
- Túneles L/R/SOCKS independientes con proceso supervisado, conflictos de puertos,
  evidencia de autenticación/reenvío, sonda TCP opcional, retry limitado y stop
  cancelable. Alcance TCP se etiqueta separado de salud del servicio final.
- Perfiles/requisitos VPN de servidor, bastión, túnel y workspace, estados con
  fuente/confianza, notificaciones de red, interfaces, DNS y rutas por IP.
- Ivanti: instalación mediante metadatos públicos y apertura de la app. Sin control
  de conexiones ni extracción de secretos. Unknown cuando no se identifica perfil.
- Dashboard, Servidores, Terminales, Túneles, VPN, Workspaces, Diagnósticos y Ajustes;
  temas claro/oscuro, paleta violeta/azul/rosa y controles nativos.
- Importación revisable CSV/JSON/SQLite, migraciones transaccionales, conservación
  de IDs y registros, exportaciones sin secretos e informe redactado.
- Proyecto Xcode, paquete SPM, build/fixture/limpieza y workflow CI nativo.

## Conservación y cambios incompatibles

MIGRATION.md enumera las equivalencias. La base original no se reescribe.
Contraseñas/passphrases históricas permanecen cifradas en el original y no se
importan al nuevo SQLite: OpenSSH las solicita en el PTY, y los túneles usan
claves/agente. La configuración externa se activa explícitamente tras importar.
El mapa nativo es de solo lectura y el gestor de carpetas no reproduce todavía
cada gesto de drag/drop anterior; esas funciones siguen disponibles en Tauri.
La exportación nativa no es un backup de comandos/notas/credenciales.

## Compilación y pruebas verificadas

- Debug y Release por Swift Package Manager: correctos.
- Bundle ORI.app generado con recursos e identidad ad hoc local; firma verificada.
- 48 pruebas Swift declaradas aprobadas (44 de núcleo/integración y cuatro de
  terminal), más sus casos parametrizados. Incluyen tráfico SSH/HTTP real local,
  dos saltos, L/R/SOCKS, claves desconocidas/modificadas, reconexión y cancelación.
- Regresión original: 76 frontend y 39 Rust aprobadas; dos integraciones históricas
  ignoradas. Lint y build frontend correctos, con avisos ya existentes.
- Swift format lint --strict, Bash syntax, plist, sintaxis del proyecto e ignorados de agentes/build: correctos.
- `xcodebuild` resolvió paquetes y se detuvo en la validación del plugin SwiftTerm;
  no se desactivó esa validación. CI remoto todavía no ejecutado.

Última medición: cinco PTY, 2.500 líneas, 1.404 s, 0.303 s de CPU,
pico RSS del proceso de pruebas 65.5 MiB; descriptores 12 → 42 → 12.
Esto no representa CPU/memoria idle de la ventana del producto. Datos completos en
MEASUREMENTS.json y alcance de pruebas en TEST_PLAN.md.

## Límites y pendientes

1. Inspección visual de la aplicación: el control de escritorio no tenía permiso
   para ORI. Pendientes interacción UI completa, VoiceOver, foco, contraste y tamaños.
2. Integración con una VPN Ivanti corporativa y sus variantes de SSO/MFA/split DNS.
3. Autorizar/revisar el plugin de SwiftTerm en Xcode si solicita confianza y repetir
   el build de ese proyecto. La vía de compilación SPM sí está validada.
4. Compatibilidad operativa con dispositivos legacy concretos y topologías que
   requieran alias diferentes para la misma IP; no se degradan algoritmos por defecto.
5. Pruebas prolongadas, Instruments, sleep/wake, 20 sesiones y macOS 15 real.
6. Firma Developer ID, notarización y distribución en un Mac limpio.
7. Aprobación de paridad antes de retirar el frontend/motor histórico.

## Compilar y utilizar

`bash native/scripts/build.sh` crea el bundle Release. Abre `native/build/ORI.app`
con Finder; no necesita Xcode, Node ni Rust para ejecutarse. En esta máquina Xcode
y Swift ya estaban instalados, por lo que no se necesita instalar más herramientas
para usar el resultado local. Xcode solo es necesario para desarrollo/compilación.

Crea un host, revisa su configuración local de confianza, conecta desde Servidores
y prepara host keys/agente antes de usar túneles. La migración de datos reales se
solicita desde Importar con una copia SQLite consistente o JSON/CSV. README.md
incluye los pasos y el procedimiento de recuperación está en MIGRATION.md.

## Archivos modificados

- `.gitignore`: cachés, bundles y estado local de Xcode excluidos; entradas de agentes verificadas.
- `README.md`: instrucciones actuales, UTF-8; versión anterior preservada en Documentation.

## Archivos creados

- `.github/workflows/native.yml`
- `native/.swift-format`
- `Documentation/AUDIT.md`
- `Documentation/ARCHITECTURE.md`
- `Documentation/MIGRATION.md`
- `Documentation/SECURITY.md`
- `Documentation/VPN_INTEGRATION.md`
- `Documentation/DESIGN_SYSTEM.md`
- `Documentation/TEST_PLAN.md`
- `Documentation/MEASUREMENTS.json`
- `Documentation/LEGACY_README.md`
- `Documentation/DELIVERY.md`
- `native/Info.plist`
- `native/ORI.xcodeproj/project.pbxproj`
- `native/ORI.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`
- `native/ORI.xcodeproj/xcshareddata/xcschemes/ORI.xcscheme`
- `native/Package.resolved`
- `native/Package.swift`
- `native/Sources/ORIApp/Application/AppContainer.swift`
- `native/Sources/ORIApp/DesignSystem/DesignSystem.swift`
- `native/Sources/ORIApp/Features/HostsView.swift`
- `native/Sources/ORIApp/Features/RootView.swift`
- `native/Sources/ORIApp/Features/TerminalWorkspaceView.swift`
- `native/Sources/ORIApp/Features/TunnelsView.swift`
- `native/Sources/ORIApp/Features/VPNViews.swift`
- `native/Sources/ORIApp/Features/WorkspaceSettingsViews.swift`
- `native/Sources/ORIApp/Infrastructure/ConnectivityMonitor.swift`
- `native/Sources/ORIApp/Infrastructure/TerminalSessionController.swift`
- `native/Sources/ORIApp/ORIApp.swift`
- `native/Sources/ORICore/Application/ConnectionPrerequisites.swift`
- `native/Sources/ORICore/Application/TunnelManager.swift`
- `native/Sources/ORICore/Domain/Models.swift`
- `native/Sources/ORICore/Domain/TerminalText.swift`
- `native/Sources/ORICore/Domain/Validation.swift`
- `native/Sources/ORICore/Infrastructure/ConfigurationImportService.swift`
- `native/Sources/ORICore/Infrastructure/ConfigurationStore.swift`
- `native/Sources/ORICore/Infrastructure/NetworkIntelligence.swift`
- `native/Sources/ORICore/Infrastructure/ProcessSupervisor.swift`
- `native/Sources/ORICore/Infrastructure/SSHArgumentBuilder.swift`
- `native/Tests/Integration/Dockerfile`
- `native/Tests/ORICoreTests/CoreTests.swift`
- `native/Tests/ORICoreTests/SSHIntegrationTests.swift`
- `native/Tests/ORITerminalTests/TerminalTests.swift`
- `native/scripts/build.sh`
- `native/scripts/integration-environment.sh`
- `native/scripts/stop-integration.sh`

Los bundles, dependencias descargadas y claves desechables están ignorados y no
forman parte de los fuentes nuevos para Git.

## Bloques de commit propuestos, no ejecutados

1. `Añade la aplicación macOS nativa con SSH, túneles y diagnóstico VPN`
   — paquete, fuentes, pruebas, scripts, proyecto Xcode, CI y entradas de ignorados.
2. `Documenta la migración nativa, recuperación y resultados de pruebas`
   — README y Documentation.
