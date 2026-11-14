# Tareas — ORI-SSHManager

> Generado 2026-11-14 a partir de la revisión de lógica. Se hacen **en este orden**, una a una.
> Cada tarea es un commit independiente. Al terminar una, marcar sus casillas y pasar a la siguiente.

## Cómo comprobar cada tarea

| Qué | Comando |
| --- | ------- |
| Tests de Rust | `cd src-tauri && cargo test` |
| Lint de Rust | `cd src-tauri && cargo clippy -- -D warnings && cargo fmt --check` |
| Tests de frontend | `pnpm test` |
| Lint y tipos de frontend | `pnpm lint && pnpm build` |
| Prueba a mano | `pnpm tauri:dev` |

## Resumen

| Nº | Tarea | Prioridad | Estado |
| -- | ----- | --------- | ------ |
| ORI-001 | Editar una sesión borra sus comandos y su registro | alta | hecha (falta prueba a mano) |
| ORI-002 | Cambiar de pestaña pierde la salida del terminal | alta | hecha (falta prueba a mano) |
| ORI-003 | Ciclo de vida de pestaña y canal | alta | hecha (falta prueba a mano) |
| ORI-004 | Secretos de saltos emparejados por posición | alta | hecha |
| ORI-005 | Salto que apunta a una sesión borrada | alta | hecha (falta prueba a mano) |
| ORI-006 | Estado y avisos en la interfaz | media | hecha (falta prueba a mano) |
| ORI-007 | Importar y exportar sin pérdidas | media | hecha (falta prueba a mano) |
| ORI-008 | Error del llavero tratado como "no hay clave" | media | hecha (ver límite conocido) |
| ORI-009 | Auditoría de comandos puede guardar secretos | media | hecha (falta prueba a mano) |
| ORI-010 | Limpieza de código sin uso | baja | hecha |
| ORI-011 | Robustez del backend SSH | baja | hecha (1, 4, 5, 6; 2 y 3 descartados) |
| ORI-012 | Rediseño visual tipo CleanMyMac | media | pendiente (requiere decisiones) |

---

## ORI-001 — Editar una sesión borra sus comandos y su registro

**Rama:** `fix/guardar-sesion-sin-borrar-hijos`

**Qué falla:** `save_session` usa `INSERT OR REPLACE` (`src-tauri/src/db.rs:807`). Con `PRAGMA foreign_keys=ON`
(`db.rs:336`), el REPLACE borra la fila y vuelve a insertarla, y ese borrado dispara el `ON DELETE CASCADE` de
`commands` (`db.rs:415`) y `session_logs` (`db.rs:438`).

**Cuándo pasa:** al editar, renombrar, cambiar color o arrastrar una sesión a una carpeta (`src/components/Sidebar.tsx:801`).
En pantalla los comandos siguen hasta reiniciar la app, porque el store los tiene en memoria.

**Reproducido:** con sqlite3 y el mismo esquema, 1 comando antes del REPLACE y 0 después.

- [x] 1. Escribir un test en `db.rs` que guarde una sesión, un comando y un log suyos, vuelva a guardar la sesión y
      compruebe que el comando y el log siguen. **Verificación:** `cargo test` falla en ese test.
- [x] 2. Cambiar la sentencia de `db.rs:807` a `INSERT ... ON CONFLICT(id) DO UPDATE SET ...` con todas las columnas.
      **Verificación:** `cargo test` pasa entero.
- [ ] 3. Prueba a mano: crear un comando ligado a una sesión, mover la sesión de carpeta, cerrar y abrir la app.
      **Verificación:** el comando sigue en el panel.

**Commit:** `[fix/guardar-sesion-sin-borrar-hijos] Guarda la sesión con upsert para no borrar comandos ni registro`

---

## ORI-002 — Cambiar de pestaña pierde la salida del terminal

**Rama:** `fix/terminales-siempre-montados`

**Qué falla:** `src/App.tsx:72` solo monta el `TerminalView` de la pestaña activa. Al cambiar de pestaña el terminal se
desmonta, `stopReading` quita su callback (`src/components/TerminalView.tsx:184`) y `src/hooks/sshService.ts:125`
tira la salida que llega para ese canal. Además `disableAutoReconnect` deja las pestañas de fondo sin reconexión.

**Efecto secundario:** al volver se repinta un buffer en bruto de 500 KB cortado sin mirar dónde, que rompe
programas de pantalla completa (vim, top) y secuencias de escape a medias.

- [x] 1. En `App.tsx`, pintar un `TerminalView` por cada pestaña y ocultar los inactivos con CSS.
      **Verificación:** lanzar `ping` en una pestaña, cambiar a otra 10 s y volver: no falta ninguna línea.
- [x] 2. Hacer `fit()` y `focus()` cuando la pestaña pasa a activa (el terminal oculto no tiene tamaño).
      **Verificación:** al volver, el terminal ocupa todo el hueco y `stty size` da las columnas reales.
- [x] 3. Borrar lo que deja de usarse: `tabBuffers`, `setTabBuffer`, `appendTabBuffer`, `getTabBuffer`
      (`src/store/useStore.ts:354-368`), `bufferRef`, `trimBuffer`, `MAX_BUFFER_SIZE` y la rama de "attach" de
      `TerminalView.tsx`. **Verificación:** `pnpm lint && pnpm build` sin errores.
- [ ] 4. Cortar la red con una pestaña de fondo conectada. **Verificación:** esa pestaña reconecta sola.

**No romper:** el efecto de montaje de `TerminalView` depende solo de `tabId`. Añadir `channelId` o `status` a sus
dependencias recrea el terminal al conectar.

**A vigilar:** hay un contexto WebGL por pestaña. Si el navegador los agota ya existe la caída a canvas
(`src/hooks/useTerminal.ts:155`); probar con 20 pestañas abiertas.

**Commit:** `[fix/terminales-siempre-montados] Mantiene montados los terminales de todas las pestañas`

---

## ORI-003 — Ciclo de vida de pestaña y canal

**Rama:** `fix/ciclo-vida-pestana` · Hacer después de ORI-002 (toca los mismos ficheros y queda más corto).

Cuatro fallos del mismo origen: el estado de la pestaña y el del canal SSH no se actualizan juntos.

- [x] 1. **`channelId` viejo.** `src/store/useStore.ts:349` hace `channelId ?? t.channelId`, así que una pestaña
      desconectada conserva el canal muerto. Al cerrarla se llama a `ssh_disconnect` sobre ese canal (el backend
      devuelve Ok, `src-tauri/src/ssh.rs:865`) y se apunta "Desconexión manual" en el registro, dos veces
      (`TerminalView.tsx:276` y luego `closeTab`). Arreglo: vaciar `channelId` al pasar a `disconnected` o `error`,
      y que `handleClose` solo llame a `closeTab`.
      **Verificación:** escribir `exit`, cerrar la pestaña y mirar el registro: una sola entrada, "Sesión cerrada".
- [x] 2. **Reconexión manual.** `TerminalView.tsx:245` no vuelve a llamar a `enableAutoReconnect` tras reconectar.
      **Verificación:** desconectar, reconectar a mano, cortar la red: la pestaña reconecta sola.
- [x] 3. **Cerrar mientras conecta.** `closeTab` no tiene `channelId` todavía; `ssh_connect` termina después y la
      conexión queda abierta en el backend sin pestaña. Arreglo: al volver de `connect`, si la pestaña ya no existe,
      llamar a `ssh_disconnect` con ese canal.
      **Verificación:** abrir una sesión lenta, cerrar la pestaña antes de que conecte y comprobar en el servidor
      (`who`) que no queda sesión abierta.
- [x] 4. **Carrera en `closeTab`.** `useStore.ts:305` lee `tabs` antes del `await` y escribe esa foto vieja.
      Arreglo: calcular el estado final con `set((state) => ...)` después del `await`.
      **Verificación:** cerrar una pestaña y abrir otra justo después: la nueva no desaparece.

**Commit:** `[fix/ciclo-vida-pestana] Sincroniza el estado de la pestaña con el del canal SSH`

---

## ORI-004 — Secretos de saltos emparejados por posición

**Rama:** `fix/secretos-salto-por-identidad`

**Qué falla:** un secreto de salto vacío significa "conserva el guardado", y el guardado se busca por posición:
`existing_hops.get(idx)` en `src-tauri/src/db.rs:779`. Si se borra o reordena un salto, el que ocupa esa posición
hereda la contraseña de otro y **se envía a un servidor distinto**.

**Arreglo propuesto:** conservar el secreto solo si el salto guardado coincide en host + puerto + usuario. Si no
coincide, el salto queda sin secreto y hay que escribirlo. No hace falta campo nuevo ni migración.

- [x] 1. Test en `db.rs`: sesión con saltos A y B con contraseñas distintas; guardar de nuevo solo con B y secreto
      vacío; comprobar que B conserva la contraseña de B. **Verificación:** `cargo test` falla en ese test.
- [x] 2. Sustituir la búsqueda por posición por una búsqueda por host + puerto + usuario.
      **Verificación:** `cargo test` pasa entero.
- [x] 3. En `src/components/SessionModal.tsx`, avisar cuando un salto manual se queda sin secreto guardado.
      **Verificación:** cambiar el host de un salto sin escribir contraseña muestra el aviso.

**Commit:** `[fix/secretos-salto-por-identidad] Conserva el secreto de un salto solo si es el mismo salto`

---

## ORI-005 — Salto que apunta a una sesión borrada

**Rama:** `fix/salto-referencia-colgante`

**Qué falla:** si se borra una sesión usada como máquina de salto, la referencia queda colgando. `db.rs:1127` deja el
salto en blanco "para que falle claro", pero `src-tauri/src/ssh.rs:683` filtra los saltos con host vacío: la conexión
sigue con la cadena incompleta o directa al destino, sin avisar.

**Además:** el comando `count_session_jump_refs` existe (`src-tauri/src/lib.rs:97`) pero el frontend no lo llama, así
que borrar una máquina de salto no avisa de nada (`src/components/Sidebar.tsx:884`).

- [x] 1. En el backend, devolver un error explícito al conectar si un salto con `refSessionId` no se resuelve.
      Añadir test. **Verificación:** `cargo test`; a mano, la conexión falla con "la máquina de salto ya no existe".
- [x] 2. En `Sidebar.tsx`, llamar a `count_session_jump_refs` antes de confirmar el borrado y mostrar cuántas
      sesiones dependen de ella. **Verificación:** al borrar una máquina de salto en uso aparece el número.

**Commit:** `[fix/salto-referencia-colgante] Falla de forma explícita si falta una máquina de salto y avisa al borrarla`

---

## ORI-006 — Estado y avisos en la interfaz

**Rama:** `fix/estado-y-avisos-ui` · Un commit por punto.

- [x] 1. **Subcarpetas que desaparecen.** `src/store/useStore.ts:521` borra la carpeta en memoria pero no reasigna
      sus subcarpetas (SQLite sí lo hace). Arreglo: pasar las hijas al padre de la borrada.
      **Verificación:** borrar una carpeta con subcarpetas; siguen visibles sin reiniciar.
- [x] 2. **Comando guardado en la sesión equivocada.** `src/components/CommandModal.tsx:48` usa la sesión
      seleccionada en la barra lateral; `src/components/CommandPanel.tsx:54` filtra por la de la pestaña activa.
      Arreglo: pasar `activeTab.sessionId` al abrir el modal.
      **Verificación:** crear un comando "solo esta sesión" desde el panel; aparece en esa pestaña.
- [x] 3. **Guardados de carpeta sin aviso.** `useStore.ts:496`, `508`, `550` y `586` solo hacen `console.error` si
      falla el guardado. Arreglo: mostrar un toast de error. **Verificación:** forzar el fallo y ver el aviso.
- [x] 4. **Versión fija.** `src/components/SettingsModal.tsx:446` muestra `v1.0.0`. Arreglo: leerla con
      `getVersion()` de `@tauri-apps/api/app`. **Verificación:** Ajustes muestra 1.4.2.
- [x] 5. *(sin verificar, solo Codex)* `SessionModal.tsx:175`: cerrar y reabrir el modal mientras guarda pierde el
      borrador. Comprobar antes de tocar.
- [x] 6. *(sin verificar, solo Codex)* `SessionInfoModal.tsx:190`: el mapa no refleja el cambio de estado de
      conexión mientras está abierto. Comprobar antes de tocar.

---

## ORI-007 — Importar y exportar sin pérdidas

**Rama:** `fix/importacion-ida-y-vuelta`

- [x] 1. Test en `src/utils/sessionImport.test.ts`: exportar e importar una sesión con `authMethod: agent`, icono,
      notas y contraseña con espacios; debe volver igual. **Verificación:** `pnpm test` falla en ese test.
- [x] 2. `sessionImport.ts:309`: reconocer `agent` (hoy se convierte en `password`).
- [x] 3. `sessionImport.ts:226`: incluir `icon` y `notes` (hoy se pierden).
- [x] 4. `sessionImport.ts:326`: no hacer `trim()` de contraseñas ni passphrases.
      **Verificación de 2 a 4:** `pnpm test` pasa entero.
- [x] 5. `Sidebar.tsx:915`: las carpetas se identifican solo por nombre; subcarpetas con el mismo nombre se mezclan
      y la jerarquía no se exporta. Arreglo: exportar e importar la ruta completa (`Padre/Hija`).
      **Verificación:** exportar un árbol con dos subcarpetas iguales, importar en limpio y comparar.
- [x] 6. *(sin verificar, solo Codex)* Puerto no numérico pasa a 22 en silencio (`sessionImport.ts:336`); CSV con
      comillas sin cerrar se acepta (`sessionImport.ts:161`). Comprobar antes de tocar.

**Commit:** `[fix/importacion-ida-y-vuelta] Importa agent, icono y notas y respeta los espacios de los secretos`

---

## ORI-008 — Error del llavero tratado como "no hay clave"

**Rama:** `fix/clave-llavero-error-explicito`

**Qué falla:** en `src-tauri/src/db.rs:1202`, si `get_password()` falla por cualquier motivo (llavero bloqueado,
acceso denegado) y no hay `key.bin`, se genera una clave nueva y se intenta guardar encima. Si se guarda, todos los
secretos cifrados con la anterior quedan ilegibles para siempre.

- [x] 1. Distinguir `keyring::Error::NoEntry` del resto de errores. Solo `NoEntry` permite generar clave.
- [x] 2. Si la base de datos ya tiene secretos con prefijo `v1:`, no generar clave nueva: fallar con un mensaje claro.
      **Verificación:** test con una BD que ya tiene secretos y sin clave disponible; debe devolver error.

**Límite conocido:** el error sale por el `expect` de `src-tauri/src/lib.rs` (`Database::new`). En release
(`panic="abort"`) la app se cierra al arrancar sin enseñar el mensaje. Mejora pendiente: inicializar la BD en
`setup()` y mostrar el error con `tauri-plugin-dialog` antes de salir.

**Commit:** `[fix/clave-llavero-error-explicito] No regenera la clave de cifrado si el llavero falla`

---

## ORI-009 — La auditoría de comandos puede guardar secretos

**Requiere decisión antes de empezar.**

**Qué falla:** `src/utils/sessionLog.ts:20` solo detecta `password`, `passphrase`, `contraseña` y `clave`. Lo
tecleado tras `PIN:`, `Verification code:` o `Token:`, y cualquier comando con el secreto en la misma línea
(`mysql -pSecreto`), se guarda sin cifrar en `session_logs`.

Opciones:

| Opción | Qué supone |
| ------ | ---------- |
| A. `logCommands` apagado por defecto (**recomendada**) | Una línea en `useStore.ts:38`. Quien quiera auditoría la activa sabiendo lo que guarda. |
| B. Ampliar la lista de palabras | Sigue siendo una lista: siempre habrá un caso que no cubra. |
| C. Registrar solo los comandos lanzados desde el panel | Deja de capturar lo tecleado. Lo más seguro y lo que más código borra. |

**Decidido (2026-11-14): opción A.** Instalaciones existentes también: tienen `logCommands: true` guardado en
localStorage por el valor por defecto antiguo, así que se apaga una vez con una migración de `persist` (`version` +
`migrate`). Si luego el usuario la activa, se respeta.

- [x] 1. Elegir opción.
- [x] 2. Aplicarla y avisar en Ajustes de qué se guarda. **Verificación:** teclear un valor tras un `read -s -p "PIN: "`
      y comprobar que no aparece en el registro.

---

## ORI-010 — Limpieza de código sin uso

**Rama:** `chore/limpieza-codigo-sin-uso` · Hacer antes de ORI-012: deja el terreno limpio para el rediseño.

- [x] 1. `tailwind.config.js`: todo `theme.extend` (colores `dark`/`primary`/`accent`/`success`, sombras `glow`,
      animaciones) tiene 0 usos.
- [x] 2. `src/index.css`: `.glass-card`, `.glass-sidebar`, `.glass-modal`, `.btn-primary`, `.btn-secondary`,
      `.input-base`, `.text-theme-*`, `.bg-theme-*`, `.glow-blue`, `.titlebar-drag`, `.titlebar-no-drag`: 0 usos.
- [x] 3. `tabs[].isActive` duplica `activeTabId` (`useStore.ts:292`, `297`, `330`, `341`).
- [x] 4. `Sidebar.tsx:41`: `DeleteConfirmationDialog` duplica `ConfirmDialog`.
- [x] 5. `Sidebar.tsx:402`: el parámetro `depth` se pasa pero no se usa.
- [x] 6. `sessionImport.ts:12`: `VALID_COLORS` repite `COLOR_NAMES` de `utils/colors.ts`.

**Verificación de cada punto:** `pnpm lint && pnpm build && pnpm test`, y la app se ve igual que antes.

**Commit:** `[chore/limpieza-codigo-sin-uso] Elimina estilos y estado que no se usan`

---

## ORI-011 — Robustez del backend SSH

**Sin verificar.** Son informes de lectura de Codex, no reproducidos. Comprobar cada uno antes de tocar; el que no
se confirme se tacha.

- [x] 1. `ssh.rs:476`: el timeout termina antes de autenticar; la autenticación y la apertura de canal no tienen límite.
- [ ] ~~2. `ssh.rs:738`: PTY y shell se piden con `want_reply=false`.~~ **Descartado:** la app soporta servidores y
      equipos antiguos (commit 611f280); esperar su respuesta puede colgar conexiones que hoy funcionan.
- [ ] ~~3. `ssh.rs:813`: `ExitSignal` se ignora y todo `Close` cuenta como cierre normal.~~ **Descartado:** si alguien
      mata la shell a propósito, reconectar solo no es lo esperado.
- [x] 4. `ssh.rs:786`: `pty_closed` se emite antes de apuntar el canal en `dead_channels`; `ssh_cleanup_dead` puede
      llegar antes y no limpiar nada.
- [x] 5. `ssh.rs:846`: envíos concurrentes al mismo canal sin cola.
- [x] 6. `db.rs:373`: una migración comprueba una columna y añade tres.

---

## ORI-012 — Rediseño visual tipo CleanMyMac

**Rama:** `feature/rediseno-visual` · Hacer después de ORI-002 (cambia el layout del terminal) y ORI-010.

### Decisiones (tomadas 2026-11-14)

| Decisión | Elegido | Consecuencia |
| -------- | ------- | ------------ |
| ¿Ventana transparente que deja ver el escritorio? | **Degradado CSS opaco** | Sin `macOSPrivateApi` (se quitó a propósito, mejora 10 de `PLAN-MEJORAS.md`). |
| ¿Un tema o claro + oscuro? | **Solo oscuro de color** | Se elimina el tema de app claro/sistema (`appTheme`, `ThemeContext`, variantes `dark:`). El tema del terminal (`terminalTheme`) se mantiene. |
| ¿Color del degradado? | **Morado-rosa** | Fondo `#2b1055` → `#7a1f5c`; acento rosa/violeta. |

### Pasos

- [ ] 1. **Capa de tema.** Hoy no existe: hay unas 300 clases `zinc-*` escritas a mano en 16 componentes. Definir
      unos 8 nombres con significado (superficie de cristal, borde, texto, texto secundario, acento, peligro...) como
      variables en `src/index.css` y colores en `tailwind.config.js`. **Verificación:** `pnpm build` y la app igual.
- [ ] 2. **Sustituir clases por tokens**, un componente por commit, de menor a mayor: `ToastContainer`,
      `ConfirmDialog`, `TabBar`, `CommandPanel`, `CommandPalette`, modales, `Sidebar`.
      **Verificación:** cambiar el valor de un token cambia ese color en toda la app.
- [ ] 3. **Ventana.** `src-tauri/tauri.conf.json`: `titleBarStyle: "Overlay"` y `hiddenTitle: true`.
      `src/components/TitleBar.tsx` (hoy devuelve `null`) pasa a ser la franja arrastrable, con hueco a la izquierda
      para los botones de semáforo. En Windows se mantiene la barra normal.
      **Verificación:** la ventana se arrastra desde arriba y los botones no tapan nada.
- [ ] 4. **Fondo.** Degradado de color en `.gradient-mesh` (`index.css:228`).
- [ ] 5. **Barra lateral.** Translúcida, filas tipo píldora con icono grande y selección redondeada (`Sidebar.tsx`).
- [ ] 6. **Pantalla vacía.** `App.tsx:74` como pantalla de bienvenida: icono grande, título, frase corta y un botón
      redondo grande para conectar.
- [ ] 7. **Terminal.** Tarjeta opaca redondeada con margen sobre el degradado. El fondo del terminal no puede ser
      transparente (`useTerminal.ts:114`).
- [ ] 8. **Modales y paneles.** Radios de 20-24 px, desenfoque, sombras suaves y animaciones de entrada con
      framer-motion (ya instalado).
- [ ] 9. **Repaso final.** Contraste del texto sobre el degradado, foco visible con teclado y prueba en Windows.

**Verificación de 4 a 8:** captura de cada pantalla antes y después.

---

## Hechas

*(vacío)*
