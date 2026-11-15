# Rendimiento · ORI nativa

Medido el 2026-11-15 en este Mac, con la compilación release y una copia de la
base real: 149 conexiones, 29 carpetas, 0 túneles y 292 KB.

## Resultados

| Qué | Medida | Valoración |
|---|---|---|
| Arranque hasta ver la ventana | 343 / 316 / 330 ms | Bien |
| Memoria tras arrancar | 56 MB | Bien |
| En reposo | CPU 0,0 %, energía 0,0, 6 hilos | Bien |
| Cuelgues registrados por macOS | Ninguno de ORI en DiagnosticReports | Bien |
| Escaneo de repos · Maqueta (7) | Antes 1,9 s, ahora 0,74 s | Mejorado |
| Escaneo de repos · BitBucket (26) | Antes 1,7 s, ahora 0,52 s | Mejorado |
| Buscar carpetas Git | Menos de 2 ms | Bien |
| Arranque de un script (`zsh -lc`) | 30 ms | Bien |
| Diagnósticos: `ssh -V`, `ssh-add -l`, `ssh -G` | 8 / 24 / 28 ms | Bien |
| Terminal: 5 PTY con 2.500 líneas | 0,3 s de CPU, 68 MB de pico (medición del 2026-11-14) | Bien |
| Tests | 58 en unos 3,5 s | Bien |

El escaneo de repos se midió con los mismos comandos `git status` que lanza la
app, en secuencia y con 6 a la vez.

## Cambios aplicados

1. **Repos en paralelo.** `git status`, fetch y pull van de 6 en 6
   (`CONSULTAS_EN_PARALELO` en `RepositoriesView.swift`). La lista se sigue
   mostrando en el orden de las carpetas.
2. **Log de ssh.** Antes se leía cada 250 ms durante toda la sesión. Ahora, una
   vez conectada, se lee cada 2 s: 8 veces menos despertares por sesión abierta.
   El cierre de la sesión sigue haciendo su propia lectura final.
3. **Compilación release** para el uso diario (`bash native/scripts/build.sh`).
4. **Código muerto fuera:** la lógica de dependencias VPN, `SSHJumpEndpoint`,
   `retryAuthorization` y la app Tauri (unos 4 GB en disco con sus compilados).

## Qué no hace falta tocar

- **Listas de conexiones.** Se filtran y se ordenan en cada repintado: con 149
  conexiones son microsegundos. Solo habría que revisarlo por encima de unas
  2.000.
- **Estado «Conectado».** Aparece como mucho 250 ms después de autenticar. La
  terminal muestra la salida al momento.
- **Lista de scripts.** Se lee en el hilo principal, pero son 28 ficheros.

## Pendiente

- Los espacios Git **Planta** y **LAB** tienen rutas de Windows (`C:\git\...`)
  importadas. Repositorios lo avisa con un botón para elegir su carpeta en el Mac.
- La salida de los scripts se ve en directo, con un tope de 1 MB.
- Las mediciones de terminal con Docker no se han repetido hoy.

## Cómo repetirlo

- Consumo de la app abierta:
  `top -l 4 -s 3 -pid $(pgrep -n ORI) -stats pid,cpu,mem,power`
  y `footprint -p $(pgrep -n ORI)`.
- Para ver si la interfaz se traba: Instruments (viene con Xcode) con las
  plantillas **SwiftUI**, **Time Profiler** y **Hangs**. No hace falta instalar
  ninguna librería.
