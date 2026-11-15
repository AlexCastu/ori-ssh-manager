# Credenciales propias y exportación portable

ORI guarda las contraseñas fuera de SQLite, sin Llavero ni servicios externos.
El importador Acceso bastiones respeta overrides y hereda las contraseñas de
planta para los servicios. En una instalación ya importada, Ajustes ofrece
Importar contraseñas de Acceso bastiones sin duplicar ni modificar perfiles.
El editor de conexiones y saltos permite sustituir una contraseña guardada.

## Almacén local

`Credentials/passwords.json` contiene ciphertext AES-256-GCM. `Credentials/local.key`
contiene la clave aleatoria local de 32 bytes. Ambos archivos son 0600 dentro de
un directorio 0700. Una escritura atómica y un bloqueo coordinan las actualizaciones.
La referencia incluye ID del perfil, usuario, dirección y puerto: cambiar el
endpoint no reutiliza silenciosamente su contraseña anterior.

La clave local permite abrir ORI sin solicitar una contraseña maestra en cada
arranque. Quien copie toda esa carpeta con su clave puede descifrar el almacén;
no se presenta como protección frente a quien controle la cuenta local.
Para trasladar datos se utiliza la exportación cifrada, no esa carpeta.

## Un JSON completo para exportar e importar

Exportar incluye Configuration completa y todas las contraseñas asociadas a los
perfiles actuales. No copia archivos de claves privadas externos ni el historial
de sesiones, cuya exportación local sigue siendo independiente.
La contraseña del archivo se elige en un campo seguro y se confirma; mínimo
12 caracteres. No se guarda junto al archivo ni en el almacén local.

Formato público del sobre JSON, versión 1:

- `format`: `ori-encrypted`; `version`: `1`.
- `cipher`: `AES-256-GCM`; clave de 32 bytes.
- `kdf`: `PBKDF2-HMAC-SHA256`; `iterations`: `600000`.
- `salt`: 16 bytes aleatorios, codificados en Base64.
- `ciphertext`: Base64 de nonce de 12 bytes + ciphertext + tag de 16 bytes.
- Datos autenticados adicionales: bytes UTF-8 de `ORI portable archive v1`.

El plaintext es JSON con `configuration` y `passwords`. La derivación utiliza
los bytes UTF-8 de la contraseña sin terminador. La recuperación no necesita
`local.key`, el Llavero ni una instalación macOS específica. Se comprobó
interoperabilidad con hashlib y AESGCM de Python/cryptography.
Una contraseña incorrecta o cualquier alteración del ciphertext se rechazan.
La importación desactiva autoarranque de túneles y confianza SSH externa hasta
revisión, igual que las importaciones nativas anteriores.

## Entrega de contraseñas a OpenSSH

Cada terminal crea un manifiesto 0600 con las referencias de su ruta y un
wrapper 0700 sin secretos. OpenSSH usa el modo ASKPASS del ejecutable de ORI.
Solo un prompt local de OpenSSH que coincida exactamente con usuario y dirección
de un endpoint de esa ruta recibe su contraseña. Los banners y la salida remota
no se interpretan para enviar credenciales al PTY.

Solo se permite un intento automático por endpoint y sesión. Si la contraseña
se rechaza o falta, aparece un diálogo seguro para entrada manual. Las huellas
nuevas requieren confirmación explícita; una host key modificada sigue fallando.
No se incluyen contraseñas en argv, variables de entorno, ssh_config ni logs.
Los archivos temporales se eliminan al cerrar la sesión.

Los reenvíos independientes L/R/D mantienen BatchMode y autenticación por
claves/agente. Este cambio automatiza las contraseñas de terminales y bastiones.

## Pruebas

PasswordTests cubre almacenamiento cifrado, permisos, aislamiento de endpoints,
exportación/restauración independiente, contraseña incorrecta, manipulación y
aleatoriedad del archivo. La prueba manual con OpenSSH real contra una fixture
Paramiko (PasswordSSHTests) se retiró el 2026-11-15.

## Resultado en la instalación local · 2026-11-15

Se cargaron 148 contraseñas desde la UI real. Los 148 perfiles actuales tienen
credencial y referencia de endpoint coincidentes; datos y rutas permanecen
idénticos a la copia previa. Integridad SQLite `ok`, directorio 0700 y archivos
de clave/almacén 0600. La copia consistente anterior a esta operación está en
`native/build/backups/ori-antes-credenciales-20261115-194215.sqlite`.

Se observó la navegación sin VPN, el botón Exportar todo cifrado y el editor
de pasarelarima-1 con campo seguro vacío e indicador de contraseña guardada.
El editor se canceló sin cambios. No se inició una conexión corporativa desde
la automatización. El servidor SSH de pruebas local quedó detenido.

Referencias: [OpenSSH ASKPASS](https://man.openbsd.org/ssh.1#SSH_ASKPASS),
[CryptoKit AES.GCM](https://developer.apple.com/documentation/cryptokit/aes/gcm).
