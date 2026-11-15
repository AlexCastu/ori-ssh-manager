# Migración incremental y recuperación

## Punto de partida

Rama `fix/tareas-revision`, HEAD inicial `4e09f73`, árbol limpio. La auditoría
completa y matriz de funcionalidades están en AUDIT.md. La aplicación real era
Tauri/React/Zustand/xterm con backend Rust/russh y SQLite cifrado por campos.
El README era de otro producto y estaba en UTF-16; se conserva decodificado en
LEGACY_README.md. No existían módulos de VPN ni túneles independientes.

## Estrategia aplicada

Se añadió `native/` en paralelo. No se retiró ni adaptó el motor Rust a medias:
la aplicación histórica sigue ejecutable y sus pruebas permanecen. La nueva app
usa OpenSSH/SwiftTerm y no depende de Node/Rust en ejecución. No se han hecho
commits, pushes ni cambios sobre las bases reales del usuario.

El código nuevo se organiza en dominio/validación, aplicación/coordinación,
infraestructura y vistas/tokens. Se compilaron incrementos de núcleo, UI y pruebas;
las integraciones SSH se ejecutaron en contenedores aislados antes de la entrega.

## Funciones conservadas y trasladadas

| Función | Versión nativa | Conservación histórica |
|---|---|---|
| CRUD de servidores | Implementado con validación y transacciones | Código original intacto |
| Grupos anidados, orden, colores, iconos y notas | Persistencia y editor de carpetas / selector | Árbol con drag/drop original intacto |
| Password, clave y agente | OpenSSH interactivo / claves / agente | Contraseñas cifradas originales intactas |
| Bastiones manuales y referenciados | ProxyJump con orden, referencias, usuarios e identidades | russh conservado |
| Terminales, Unicode/ANSI, resize, pestañas | SwiftTerm + PTY; propiedad del registro | xterm conservado |
| Comandos globales y por sesión | CRUD y envío confirmado; nunca repetidos | Panel original conservado |
| Búsqueda y paleta | Búsqueda/filtros y ⌘K | Original intacto |
| Copia completa / último bloque y búsqueda terminal | Implementadas con APIs SwiftTerm | Utilidades originales intactas |
| Mapa de saltos | Recorrido lógico nativo de solo lectura | Editor React Flow conserva mover/redimensionar nodos |
| Eventos / registro histórico | Registro local, filtro, borrar/exportar; importación de historial | Logs originales intactos |
| Importación CSV/JSON | Parser estricto y vista previa | Importador original intacto |
| SQLite original | Importación readonly explícita | No se cambia esquema ni credenciales |
| Túneles L/R/SOCKS | Nueva implementación supervisada, probada en local | No existían |
| VPN/Ivanti/rutas/DNS | Nueva implementación; identidad desconocida cuando no verificable | No existían |
| Favoritos, etiquetas y workspaces | Nuevos modelos y UI | No existían en los modelos reales |

## Cambios de comportamiento deliberados

- La versión nativa no almacena passwords/passphrases ni los exporta. Los secretos
  históricos permanecen disponibles en la aplicación original. Para contraseñas
  usa el prompt real; para túneles automáticos prepara agente/clave.
- No se copian algoritmos legacy de forma global: hay una opción explícita por
  perfil para group14-sha1/ssh-rsa. Otros algoritmos necesarios pueden requerir
  configuración OpenSSH local de confianza y validación corporativa.
- No se acepta una host key nueva automáticamente. Se usa la decisión interactiva
  de OpenSSH; los túneles requieren claves conocidas.
- Configuración SSH externa desactivada al importar datos; debe activarse
  conscientemente por perfil. La importación no ejecuta Match exec.
- Las rutas explícitas no pueden repetir el mismo alias, aunque cambie el puerto:
  OpenSSH selecciona identidades por alias. Para esos casos usa alias distintos.
- Ningún JSON importado autoriza autoarranque de túneles, configuración externa,
  known_hosts alternativo ni algoritmos legacy: deben revisarse de nuevo.
- No se captura teclado para auditoría. Se conservan/importan registros históricos,
  pero los comandos nuevos solo dejan un evento genérico de envío.
- El mapa nativo no tiene edición de posiciones/tamaños; se conserva el original.
- El árbol de carpetas se administra con editor y filtros, sin reproducir todavía
  todos los gestos de drag/drop del frontend anterior.
- Preferencias de fuente, cursor y scrollback se configuran en Ajustes nativos;
  no se lee directamente el localStorage privado del WebView histórico.

## Datos

Original macOS: `~/Library/Application Support/SSHManager/data.db` y `known_hosts`.
Nueva base: `~/Library/Application Support/ORI-Native/ori.sqlite`.
Para QA se puede aislar el almacén con ORI_DATA_DIRECTORY.

CSV/JSON y bases de datos de hasta 32 MB tienen vista previa. La importación valida
IDs, puertos, grupos y rutas antes de escribir. El merge no sobrescribe IDs con
contenido diferente. Hashes de archivos CSV/JSON impiden una importación repetida.
SQLite conserva IDs y relaciones de carpetas/comandos/logs; hasta 10.000 entradas
históricas. Los eventos nativos no se purgan automáticamente; la lista reciente
limita 1.000 filas y la exportación local consulta el historial completo.
Fechas ISO-8601 con o sin milisegundos se mantienen.

No copies únicamente el archivo .db mientras haya WAL activo: cierra la app
original o usa la API/herramienta SQLite Backup para una copia consistente.
La importación abre el archivo seleccionado readonly. No exportes secretos para
migrar; usa preferentemente esa copia de la base o CSV/JSON ya no sensibles.
La nueva exportación omite notas/comandos/rutas de clave por seguridad y es un
traslado de perfiles, no un backup íntegro de todos los datos locales.

## Recuperación

Antes de editar se generaron:

- `/private/tmp/ori-before-native-20261114.bundle`: historial completo.
- `/private/tmp/ori-before-native-20261114.tar.gz`: archivos versionados.

Guárdalos fuera de tmp si deben durar. El commit inicial también sigue disponible.
Para comparar, usa `git diff 4e09f73` sin descartar tu trabajo actual.
Si necesitas otra copia, clona el bundle a una carpeta nueva; no hagas reset del
árbol actual. Para volver a la app histórica simplemente usa `pnpm tauri:dev`:
no necesita una migración inversa porque sus datos no se sobrescribieron.

## Estado de fases

Auditoría, núcleo, persistencia, SSH/PTy, bastiones, túneles, VPN, importación,
UI nativa y documentación implementados. Integración local SSH ejecutada.
La migración integral todavía requiere validación visual/accesible, una VPN
corporativa real, equivalencias con dispositivos legacy del usuario y aprobación
de paridad antes de retirar Tauri. Xcode exige confiar en SwiftTermBuildInfoPlugin;
SPM compila y empaqueta sin desactivar ese control de Xcode.
La firma y notarización Developer ID requieren credenciales del titular.
No se presenta el proyecto como una sustitución definitiva ya certificada.
