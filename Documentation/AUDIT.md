# Auditoría del punto de partida

Fecha: 2026-11-14. Rama `fix/tareas-revision`, HEAD `4e09f73`.
Árbol limpio antes de la migración. No se han creado commits ni alterado datos del usuario.
Recuperación: `/private/tmp/ori-before-native-20261114.bundle` (historial) y
`/private/tmp/ori-before-native-20261114.tar.gz` (archivos versionados).
Copiar estos respaldos fuera de tmp para conservarlos a largo plazo.

## Arquitectura inspeccionada

Tauri 2.9 / Rust 2021, React 19 / TypeScript 5.9, Zustand 5, Vite 7,
xterm 5.5 con WebGL/canvas/DOM. `App.tsx` mantiene montadas las terminales.
`useStore.ts` mantiene perfiles, carpetas, comandos, pestañas y preferencias.
`sshService.ts` distribuye eventos IPC y reconecta hasta cinco veces.
`lib.rs` expone CRUD y conexiones; `ssh.rs` usa russh 0.61, Tokio, canales PTY
remotos y direct-tcpip para encadenar bastiones. No usa OpenSSH ni un PTY local.
`db.rs` usa rusqlite/SQLite WAL, AES-GCM por campo, keyring y fallback histórico
`key.bin`. El motor aprende automáticamente claves nuevas (TOFU), rechaza cambios.
Datos macOS: `dirs::config_dir()/SSHManager` (Application Support), `data.db`,
`known_hosts`. Revisar nombre exacto en db.rs al importar; nunca abrir el original
en escritura desde la versión nativa.

El README original está en UTF-16 y describe un gestor Git diferente: sus
operaciones Git/IDE no existen en esta aplicación. No se han inventariado como
funciones SSH existentes. No hay Jenkinsfile ni suites Robot en este repositorio.
`scripts/globals_a_csv.py` usa AST (no ejecuta globals.py) y convierte inventario
SSH a CSV. La aplicación histórica también conserva soporte Windows.

## Inventario basado en código

| Funcionalidad | Implementación actual | Estado inspeccionado | Destino | Riesgo |
|---|---|---|---|---|
| Perfiles SSH, claves, agente y contraseñas | db.rs, ssh.rs, SessionModal.tsx | Implementada; integración real pendiente | Swift/OpenSSH; contraseñas interactivas, original conservado | Alto |
| Bastiones manuales y referencias reutilizables | db.rs apply_jump_refs, ssh.rs open_chain_stream | Implementada | ProxyJump y configuración administrada | Alto |
| Compatibilidad equipos antiguos | ssh.rs COMPAT_* | Algoritmos legacy habilitados | OpenSSH, configuración explícita del usuario | Alto |
| Verificación de claves | ssh.rs TofuHandler, forget_host_key | TOFU, rechaza cambios | OpenSSH ask/yes; sin olvido automático | Alto |
| Terminales múltiples, Unicode, ANSI, resize | useTerminal.ts, TerminalView.tsx, App.tsx | Implementada | SwiftTerm con PTY local real | Alto |
| Reconexión / cierre / cancelación | sshService.ts, useStore.ts, ssh.rs | Backoff limitado; pruebas de carreras existentes | Registro propietario y política cancelable | Alto |
| Carpetas anidadas, mover, ordenar, color/icono/notas | Sidebar.tsx, GroupModal.tsx, db.rs | Implementada | Modelo y UI nativos; original disponible | Medio |
| Comandos globales / por sesión, edición / ejecución | CommandPanel.tsx, CommandModal.tsx, db.rs | Implementada | Conservar y migrar | Alto |
| Mapa visual de saltos | SessionInfoModal.tsx, React Flow | Implementada; posiciones transitorias | Recorrido lógico nativo, original conserva editor | Medio |
| Registro por sesión, borrar / exportar | sessionLog.ts, db.rs, SessionInfoModal.tsx | Eventos y captura opcional; apagada por defecto | Eventos nativos; no capturar teclado | Alto |
| Importar JSON/CSV, alias de cabecera y carpetas | sessionImport.ts, Sidebar.tsx | Implementada, validaciones y tests | Importador transaccional; original conservado | Alto |
| Exportar sesiones con secretos explícitamente | lib.rs export_sessions_to_path, db.rs | Implementada, advertencia UI | Exportación nativa sin secretos; original disponible | Alto |
| Búsqueda, paleta ⌘K | fuzzy.ts, CommandPalette.tsx | Implementada | Paleta y filtros nativos | Bajo |
| Búsqueda terminal / copia completa y último bloque | useTerminal.ts, lastBlock.ts | Implementada | SwiftTerm y acciones explícitas | Medio |
| Tema terminal, fuente, cursor, scrollback, zoom | SettingsModal.tsx, useTerminal.ts | Implementada | Preferencias nativas persistidas | Bajo |
| Apariencia morado/rosa y ventana restaurada | index.css, tailwind.config.js, Tauri window-state | Implementada; TAREAS.md está desactualizado | Tokens SwiftUI y restauración AppKit | Medio |
| Conversor globals.py | scripts/globals_a_csv.py | Implementado | Conservar herramienta de migración | Bajo |
| Túneles independientes -L/-R/-D | No hay comandos ni modelos de forwarding en lib.rs/ssh.rs | No implementada (bastión no equivale a gestor de túneles) | Nuevo gestor OpenSSH | Alto |
| VPN / Ivanti / rutas / DNS | Sin modelos ni llamadas en código inspeccionado | No implementada | Nuevo subsistema con evidencia y certeza | Alto |
| Tags, favoritos, workspaces | Sin campos en modelos Session/SessionGroup | No implementada | Nuevos modelos nativos | Medio |
| CI y distribución | .github/workflows | CI macOS/Windows y Tauri release; sin firma | Conservar; añadir comprobación nativa | Medio |

## Riesgos y decisiones

1. No retirar Tauri hasta verificar paridad. Añadir `native/` como producto independiente
   sin Node en ejecución; se abre con Xcode mediante Package.swift y genera un .app.
2. No reutilizar el SQLite original para nuevos esquemas. Importación explícita de
   copia o exportación, conservando IDs, comandos, carpetas y registros cuando existan.
3. No descifrar ni copiar secretos a JSON. El original conserva las credenciales.
   OpenSSH permite prompts dentro del PTY; túneles automáticos solo claves/agente.
4. OpenSSH es autoridad para Include/Match/ProxyCommand. `ssh -G` puede ejecutar
   Match exec: solo consultar configuración local de confianza en acciones explícitas.
5. Ivanti instalado y utun no identifican una VPN conectada. Sin API universal
   verificada: estado desconocido, observaciones separadas y sondas autorizadas.
6. Mantener propiedad del proceso fuera de las vistas. No persistir PIDs.
7. SwiftTerm 1.99.1 (API posterior a 1.x) y GRDB 7.12.0 fijados; requisitos comprobados
   en sus Package.swift oficiales. Swift 6.2+, Xcode 26+, macOS mínimo 15.

## Orden de implementación

Base Swift compilable → dominio/SQLite y pruebas → argumentos/OpenSSH → terminal
propietaria → bastiones → túneles supervisados → VPN y dependencia → importación
→ UI nativa y preferencias → integración controlada → documentación y entrega.
Cada incremento se compila y prueba antes de retirar cualquier componente.

## Regresión inicial ejecutada

- Vitest: 8 archivos, 76 pruebas aprobadas.
- Rust: 39 aprobadas, 2 integraciones SSH ignoradas por el repositorio.
- Lint y build frontend: consultar TEST_PLAN.md para resultado final.
- No se han realizado conexiones corporativas ni accedido a secretos reales.
