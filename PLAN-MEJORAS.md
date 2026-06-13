# Plan de mejoras — ORI-SSHManager

> Generado 2026-06-12. Las mejoras completadas se mueven a la sección **Hechas** al final.

## Pendientes

### 12. Firma de código y notarización ⏸ REQUIERE CERTIFICADOS

**macOS**: certificado *Developer ID Application* (cuenta Apple Developer, 99 €/año).

1. Exportar el certificado como `.p12` y subirlo en base64 al secret `APPLE_CERTIFICATE` de GitHub.
2. Añadir secrets: `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (contraseña de app específica), `APPLE_TEAM_ID`.
3. En `release.yml`, pasar esos secrets como `env` del paso `tauri-apps/tauri-action` — con eso firma y notariza solo.

**Windows**: certificado Authenticode (o Azure Trusted Signing).

1. Configurar `bundle.windows.signCommand` en `tauri.conf.json` o los secrets de signtool en CI.

**Sin esto**: Gatekeeper marca la app como dañada y SmartScreen avisa. Es el bloqueante nº 1 para distribuir a otras máquinas.

### 13. Updater automático ⏸ DECISIÓN + CLAVES

1. `pnpm add @tauri-apps/plugin-updater` + `cargo add tauri-plugin-updater` (en `src-tauri`).
2. Generar par de claves minisign: `pnpm tauri signer generate`. Guardar la privada como secret `TAURI_SIGNING_PRIVATE_KEY`.
3. `tauri.conf.json`: sección `plugins.updater` con `pubkey` y endpoint `https://github.com/AlexCastu/ori-ssh-manager/releases/latest/download/latest.json`.
4. UI: botón "Buscar actualizaciones" en `SettingsModal`.

## Hechas

| Nº | Mejora | Implementación |
| -- | ------ | -------------- |
| 14 | Migración a `russh` (2026-06-13) | `ssh.rs` reescrito sobre `russh` 0.61 (SSH puro Rust, async/tokio): fuera `ssh2`, `polling`, OpenSSL vendored y todo el modelo de hilos (`ReadWaiter`, `write_full`, `bridge_to_loopback`). El canal direct-tcpip del túnel es ahora el transporte directo del siguiente salto (sin puente loopback local → menos superficie de ataque). Keepalive nativo de russh (`keepalive_interval`/`keepalive_max`). TOFU con el mismo fichero `known_hosts` (formato compatible) y mismo mensaje `Host key for X:Y CHANGED` que parsea el frontend. Eventos `pty_output`/`pty_closed`/`ssh_progress` idénticos: frontend sin cambios. `rust-version` 1.77.2 → 1.85. Tests de integración reales (`--ignored`, sshd en docker): conexión+TOFU+PTY y túnel canal-como-transporte. |
| 1 | Eliminar polling de CPU en hilos SSH | `ReadWaiter` (crate `polling`): hilo lector y puentes de túnel bloquean en legibilidad del socket (timeout 500 ms para keepalive/housekeeping) en vez de dormir 5 ms/2 ms en bucle. Clon del socket de transporte por salto y por sesión. Fallback a sleep si el clon falla. **Pendiente de validar CPU con conexión real.** |
| 2 | Perfil release optimizado | `[profile.release]` con `lto`, `codegen-units=1`, `strip`, `panic="abort"` en `Cargo.toml`. |
| 3 | `vendored-openssl` solo fuera de Windows | `ssh2` movido a `[target.'cfg(not(windows))'.dependencies]` (con vendored) y `[target.'cfg(windows)'.dependencies]` (WinCNG). |
| 4 | Selectores Zustand | 9 componentes (`App`, `Sidebar`, `TerminalView`, `TabBar`, `CommandPanel`, `SessionModal`, `CommandModal`, `SettingsModal`, `ToastContainer`) usan `useStore(useShallow(...))` con solo los campos que consumen. |
| 5 | Limpieza de canales muertos | Comando `ssh_cleanup_dead` en `lib.rs`; `sshService` lo invoca en cada evento `pty_closed`. |
| 6 | Zeroize de secretos | `Drop for Database` borra la clave AES; buffers intermedios del keyring y del descifrado zeroizados. Limitación: los `String` de la `Session` descifrada siguen sin zeroize (requiere refactor serde). |
| 7 | Sin passthrough de plaintext | `decrypt_value(..., strict)`: tras las migraciones de arranque (`strict_decrypt = true`) un secreto sin prefijo `v1:` es error explícito, no passthrough. Test nuevo `decrypt_strict_rejects_plaintext`. |
| 8 | CI de tests y lint | `.github/workflows/ci.yml` (macOS+Windows): `pnpm lint`, `pnpm build`, `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`. `Swatinem/rust-cache` también añadido a `release.yml`. |
| 9 | `.gitattributes` | `* text=auto eol=lf` + binarios marcados. Adiós avisos CRLF. |
| 10 | Quitar `macOSPrivateApi` | Eliminado de `tauri.conf.json` y el feature `macos-private-api` de `Cargo.toml`. |
| 11 | Targets de bundle | `"targets": ["app", "dmg", "nsis"]` (antes `"all"`). |
| 15 | Fix menú sidebar recortado | `AnchoredMenu`: menús de sesión/grupo/color por portal (`createPortal` + `fixed` anclado al botón). Inmune al `overflow-y-auto` de la lista y al `overflow-hidden` de la animación de grupos. |
| W1 | Vite target por plataforma | `chrome105` (WebView2) en Windows, `safari13` (WKWebView) en mac: sin transpilación/polyfills innecesarios. |
| W2 | Renderer canvas de xterm | Cascada WebGL → Canvas 2D → DOM (`@xterm/addon-canvas`). En Windows bajo RDP/VM/GPU antigua WebGL falla y el DOM es lentísimo; el canvas mantiene fluidez. |
| W3 | BD fuera del perfil roaming | Windows: datos en `%LOCALAPPDATA%\SSHManager` (antes `%APPDATA%` roaming, que los dominios corporativos sincronizan por red → logins lentos y riesgo con SQLite WAL). Migración automática con `fs::rename`; si falla, sigue usando la ruta vieja (nunca pierde datos). `known_hosts` comparte ruta vía `db::data_dir()`. |
| W4 | Instalador NSIS lzma | `bundle.windows.nsis.compression: "lzma"` → instalador más pequeño. |
| W5 | `write_full` sin penalti de timer | Primeros 64 reintentos con `yield_now()` antes de dormir: en Windows `sleep(2ms)` redondea a ~15 ms y estrangulaba pegados/transferencias grandes. |

**Verificación realizada**: `cargo test` 17/17 OK, `cargo clippy` sin avisos, `cargo fmt --check` OK, `pnpm build` (tsc + vite) OK, `pnpm lint` OK.
