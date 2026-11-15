# VPN Intelligence e Ivanti

Actualización posterior: VPN e Ivanti se han retirado de la interfaz y del flujo
de conexión. Las contraseñas se guardan en un almacén propio y la exportación
completa las incluye cifradas. Véase [CREDENTIALS_PORTABLE.md](CREDENTIALS_PORTABLE.md).
Las limitaciones de credenciales/VPN que siguen pertenecen a la entrega anterior.

## Lo que observa esta versión

1. SystemConfiguration enumera servicios VPN/PPP/IPSec visibles y su estado público.
   También consulta servicios dinámicos IPv4/IPv6 asociados a interfaces de túnel,
   incluidos los que no aparecen en las preferencias persistentes.
2. Un perfil manual puede asociarse a un **service ID** seleccionado de esa lista.
3. NWPathMonitor y SCDynamicStore notifican cambios de conectividad, servicio,
   rutas y DNS. Se invalidan observaciones y se aplica debounce; no se sondea en bucle.
4. getifaddrs enumera interfaces y direcciones. Una interfaz activa con dirección
   utilizable puede asociarse manualmente a un perfil. Esa asociación o una
   coincidencia con un servicio dinámico produce actividad **inferida**, nunca
   identidad confirmada. Una utun sin asociación no identifica un perfil; una
   dirección exclusivamente link-local tampoco basta para esta inferencia.
5. getaddrinfo usa resolución del sistema, incluido el contexto de DNS corporativo.
   La operación se ejecuta fuera de MainActor con límite de espera para el llamador.
6. `route -n get -inet/-inet6` consulta cada dirección resuelta, hasta ocho. Se
   muestran interfaz/gateway y ausencia de ruta sin depender de la ruta por defecto.
7. Network NWConnection comprueba TCP con timeout y cancelación. Una conexión TCP
   no equivale a SSH autenticado, servicio HTTP sano ni perfil VPN identificado.

Las observaciones VPN son transitorias y tienen fecha, fuente y confianza. No se
restauran como actuales desde SQLite. Los diagnósticos usados para autorizar
conexiones deben tener menos de 30 segundos.

## Perfiles y políticas

Cada VPNProfile contiene nombre, proveedor, identificador público opcional,
gateway informativo, interfaz de referencia y hasta ocho objetivos TCP autorizados.
Los objetivos solo se sondean mediante una acción explícita. No se usa la red
corporativa como mecanismo de descubrimiento ni se escanean rangos.

VPNRequirement se asocia a conexión SSH, túnel o workspace. En un bastión se
configura en su propio perfil cuando se conecta directamente; al usarlo como
salto la comprobación se dirige a él y se evalúan sus requisitos junto a los del
destino. Las reglas pueden ser obligatorias u opcionales y decidir entre:

- Advertir y permitir un intento SSH cuando no se identifica el perfil.
- Exigir verificación pública del perfil antes de continuar.

La heurística de red no se convierte en una barrera de seguridad. La decisión
sobre identidad procede del identificador público y estado publicado; la política
estricta puede bloquear cuando esa fuente no existe, hasta cambiarla o verificarla.
Las sesiones que siguen funcionando no se cierran ante cambios de VPN. Los
reintentos se limitan y vuelven a evaluar dependencias; no se relanzan comandos.

## Resultados distintos

VPNDependencyResolver distingue identidad verificada, alcance sin identidad,
servicio desconectado según macOS, otro perfil observado, DNS sin resolver, ruta
no disponible, destino inaccesible y estado desconocido. No interpreta cualquier
fallo como «VPN desconectada». La UI identifica los estados con texto y certeza.
Una observación de otra VPN no implica que varias VPN no puedan coexistir.

## Bastiones y split tunneling

Se prueba el primer salto alcanzable desde el Mac. Si el destino solo existe en
DNS del bastión, el Mac no intenta resolverlo como condición previa de SSH.
Un ProxyJump definido en configuración local se resuelve mediante OpenSSH.
Un ProxyCommand o proxy anidado cuyo recorrido no pueda inferirse produce estado
incierto, sin probar incorrectamente el host interno final desde el Mac.

No se requiere que la ruta por defecto use la VPN: las rutas específicas por IP
son las relevantes para split tunneling. Una ruta por utun no identifica proveedor
ni perfil. DNS sin resolver puede deberse a split DNS, configuración, servicio,
fallos transitorios o un nombre incorrecto; no prueba por sí solo una desconexión.

## Ivanti

No se ha incorporado ninguna API privada ni API de control de Ivanti.
El detector examina aplicaciones instaladas mediante directorios del sistema,
Bundle y sus nombres/identificadores públicos. No presupone una ruta fija.
Reconoce nombres Ivanti Secure Access / Client y Pulse Secure con identificadores
que correspondan a ese proveedor. Si los metadatos no bastan, no afirma instalación.

Cuando se identifica una instalación, NSWorkspace permite abrir el bundle. Esa
acción no conecta, desconecta, selecciona perfil ni automatiza su UI.
Instalación detectada se presenta separada del estado de conexión, normalmente
**Desconocido** si no hay un servicio público que lo identifique. No se leen
configuraciones internas, procesos con tokens, credenciales ni secretos SSO.

Desde 2026-11-15, la UI muestra además interfaces de túnel activas, permite
registrar servicios descubiertos y seleccionar la interfaz de referencia del
perfil. Los estados inferidos no satisfacen la política estricta de identidad.
Se observan también cambios de interfaces/Link y se refresca al activar la ventana
y cada 15 segundos mientras está abierta la sección VPN. Las llamadas simultáneas
esperan la misma actualización antes de evaluar requisitos de conexión.

No se ha verificado una API universal de Ivanti para obtener el nombre del perfil
activo en macOS. Una integración futura necesitaría documentar versión, fuente
oficial y autorización corporativa antes de utilizarla.

## Límites verificados

Unitarias: proveedor simulado, estados desconocidos, utun/instalación insuficiente,
identidad distinta, conectividad sin identidad, vigencia y política estricta.
SSH real local mediante bastión probado por separado. No hay una VPN Ivanti
corporativa activa autorizada para validar la integración de extremo a extremo.
No se afirma que el detector identifique todos los VPN de terceros ni variantes
de instalación dentro de directorios corporativos no enumerados.

Fuentes primarias:

- [Apple SystemConfiguration](https://developer.apple.com/documentation/systemconfiguration)
- [Apple SCNetworkConnection y sus límites](https://developer.apple.com/documentation/systemconfiguration/scnetworkconnection-g7e)
- [OpenSSH ssh_config](https://man.openbsd.org/ssh_config.5)
- [Guía administrativa Ivanti Secure Access](https://help.ivanti.com/ps/help/en_US/ISAC/22.X/Client-AG.PDF)
