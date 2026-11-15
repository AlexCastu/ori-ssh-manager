# Seguridad

## Modelo de amenazas

Entradas no confiables: formularios, archivos de importación, referencias entre
perfiles, configuración SSH de terceros y salida del servidor. La aplicación se
ejecuta como el usuario, sin root ni helper privilegiado. No es una frontera
frente a un atacante que ya controle la cuenta local o su configuración OpenSSH.

## Transporte y argumentos

- `/usr/bin/ssh`, arrays de argumentos y separación `--` del destino.
- Host/alias, usuario, puertos, rutas y forwarding tienen validaciones específicas.
  Se rechazan opciones incrustadas, controles y metacaracteres de shell en endpoints.
- ProxyJump sustituye puentes intermedios propios. Las identidades por salto se
  escriben como rutas en un archivo privado, nunca como contenido de claves.
- No se usa `sh -c`, `ssh -f` ni agent forwarding. LocalCommand y RemoteCommand
  están desactivados para evitar ejecución incidental al abrir/reabrir una sesión.
- La compatibilidad con SHA-1 es una preferencia explícita por perfil; no se activa
  automáticamente para todos los servidores.

## Configuración y host keys

OpenSSH sigue siendo autoridad de configuración. Una configuración local de
confianza puede ejecutar Match exec, ProxyCommand, KnownHostsCommand o similares.
Incluso `ssh -G` puede ejecutar Match exec. La importación de datos no habilita
esa confianza y no escribe `~/.ssh/config`. Los JSON nativos importados tampoco
autorizan autoarranque, known_hosts alternativos ni compatibilidad legacy. Esas
opciones requieren una elección posterior y explícita.

Terminal: `StrictHostKeyChecking=ask`; se permite la decisión interactiva sobre una
clave nueva. Túnel automático: `yes`, falla ante una clave desconocida. Una clave
modificada siempre se rechaza. No existe una acción que olvide/acepte una clave
silenciosamente. `known_hosts` alternativo es opcional y no desactiva verificación.

## Credenciales

Se usan ssh-agent, claves, contraseñas propias cifradas y prompts interactivos.
SSHPasswordStore mantiene los secretos fuera de SQLite y de Configuration.
ASKPASS consulta únicamente referencias de la ruta y prompts de contraseña exactos,
con un intento automático por endpoint y sesión. No interpreta banners ni salida
remota para enviar contraseñas al PTY. Las huellas nuevas requieren decisión
explícita y las modificadas se siguen rechazando.

El almacén local utiliza una clave aleatoria en un archivo privado separado;
no depende del Llavero. No protege frente a quien copie también esa clave.
La exportación completa utiliza otra clave, derivada de una contraseña elegida
por el usuario mediante PBKDF2-HMAC-SHA256 con sal aleatoria y 600.000 iteraciones,
y AES-256-GCM autenticado. Esa exportación se puede recuperar sin la clave local.
No se escriben contraseñas en argumentos, entorno, logs o ssh_config.
Detalles y formato en CREDENTIALS_PORTABLE.md.

La interfaz y el flujo de conexión ya no incluyen VPN ni Ivanti.

## Terminal no confiable

SwiftTerm interpreta ANSI/xterm. El delegado proxy bloquea lectura y escritura
remotas de portapapeles (OSC 52) y no anuncia servicios Kitty de portapapeles.
⌘C/⌘V y las acciones de copia del usuario continúan funcionando. Los enlaces de
terminal solo abren HTTP/HTTPS tras revisión explícita; no se ejecutan esquemas
locales ni se cambian títulos/archivos a partir de OSC del servidor.

El teclado no se audita. Los comandos del panel requieren acción y confirmación
explícitas, no se repiten al reconectar. No se registra una transcripción completa.

## Datos y exportaciones

El directorio de datos y los runtime son 0700; SQLite y configuraciones temporales
son 0600. Se guardan perfiles, no PIDs, descriptores, handles, objetos de terminal
ni estados VPN antiguos presentados como actuales. Los logs de OpenSSH contienen
metadatos privados y se borran al cerrar; no se exportan al informe compartible.
Una salida forzada podría dejar archivos de runtime privados para revisión local.

Las notas/comandos guardados y registros históricos pueden contener datos que el
usuario escribió; la UI indica que no deben incluir secretos. La exportación completa de
configuración incluye comandos, notas, perfiles y contraseñas dentro del JSON
cifrado. Las claves privadas externas no se copian. El informe redactado
solo incluye recuentos y categorías. No se purga automáticamente el historial nativo;
el usuario puede borrarlo con confirmación. La lista reciente limita las filas
visibles y la exportación local conserva todo el historial seleccionado. Exportar el registro local es una acción
separada con aviso, porque puede contener comandos históricos sensibles.

## Procesos y puertos

Solo se supervisan procesos creados por la app. No se buscan SSH globales ni se
terminan procesos ajenos para liberar puertos. Generaciones de ejecución evitan
que un start tardío sobreviva a stop. El cierre de app espera limpieza antes de
responder a AppKit. SIGKILL del sistema o un apagado no permiten prometer limpieza
ordenada; no se implementa supervivencia deliberada con procesos huérfanos.

Local/SOCKS usan loopback. Escuchar fuera de él requiere elección y advertencia
explícitas. RemoteForward respeta permisos y GatewayPorts del servidor, y no se
presenta una sonda local como confirmación del listener remoto.

## Verificaciones y distribución

Pruebas de entradas hostiles, host keys, fallos permanentes, puertos ocupados,
arranques concurrentes, stop, retry/cancelación y exportación redactada ejecutadas.
Pendientes: revisión visual/VoiceOver, entorno corporativo, autenticación MFA real,
auditoría independiente y firma/notarización Developer ID. La firma ad hoc local
no equivale a una distribución notarizada. No se desactivó la validación de plugins
de Xcode para forzar su build.
