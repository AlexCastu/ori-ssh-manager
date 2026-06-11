#!/usr/bin/env python3
"""Convierte el diccionario HOSTS de globals.py a un CSV importable por
ORI-SSHManager.

Solo se exportan entradas accesibles por SSH: las que tienen usuario y
contraseña y usan el puerto 22 (o sin puerto pero con IP). Se descartan las
APIs/consolas (https://, puertos 443/6443, entradas con token) y los
dispositivos de red que solo tienen IP sin credenciales.

El fichero NO se ejecuta: se parsea con `ast` para evitar efectos colaterales
y no exponer las credenciales fuera del CSV resultante.

Uso:
    python3 scripts/globals_a_csv.py globals.py sesiones-ssh-globals.csv
"""

import ast
import csv
import re
import sys

# Columnas que entiende el importador de la app (utils/sessionImport.ts)
CABECERA = [
    "name",
    "host",
    "port",
    "username",
    "password",
    "authMethod",
    "jumpHost",
    "jumpPort",
    "jumpUsername",
    "jumpPassword",
    "group",
    "color",
]

# Color por entorno (puramente estético en la app)
COLORES = {
    "ALC1": "blue",
    "ALC2": "cyan",
    "ALC3": "green",
    "CTC2": "purple",
    "MDE1": "orange",
    "BTB1": "red",
    "BEP1": "pink",
    "MNO1": "yellow",
    "MAD1": "blue",
    "VPG1": "cyan",
    "MJV1": "green",
    "BGI1": "purple",
    "JUMP": "red",
    "OTROS": "blue",
}


def extraer_hosts(ruta_py):
    """Devuelve el dict HOSTS de globals.py sin ejecutar el módulo."""
    with open(ruta_py, "r", encoding="utf-8") as fichero:
        arbol = ast.parse(fichero.read(), filename=ruta_py)

    for nodo in arbol.body:
        if isinstance(nodo, ast.Assign):
            for objetivo in nodo.targets:
                if isinstance(objetivo, ast.Name) and objetivo.id == "HOSTS":
                    return ast.literal_eval(nodo.value)
    raise ValueError("No se encontró el diccionario HOSTS en el fichero")


def es_sesion_ssh(clave, datos):
    """True si la entrada es una máquina accesible por SSH."""
    if clave.startswith("http") or "://" in clave:
        return False
    if "token" in datos:
        return False
    puerto = datos.get("port", 22)
    if puerto not in (22, None):
        return False
    # Necesita usuario y contraseña para una sesión útil
    return bool(datos.get("user")) and bool(datos.get("password"))


def detectar_grupo(clave):
    """Agrupa por entorno a partir del nombre del host."""
    if clave.startswith(("tehrh", "pasarelarima", "grgtmrr")):
        return "JUMP"
    match = re.search(r"\.(alc1|alc2|alc3|ctc2|mde1|btb1|bep1|mno1|mad1|vpg1|mjv1|bgi1)\.", clave)
    if match:
        return match.group(1).upper()
    # Prefijos cortos de máquinas ARA/HLC sin FQDN
    prefijo = clave[:6].lower()
    mapa_prefijos = {
        "aramde": "MDE1", "arabtb": "BTB1", "aramno": "MNO1",
        "arabep": "BEP1", "aramad": "MAD1", "arammt": "ALC1",
        "hlcbtb": "BTB1", "hlcmno": "MNO1", "hlcmab": "ALC1",
    }
    return mapa_prefijos.get(prefijo, "OTROS")


def construir_filas(hosts):
    filas = []
    for clave, datos in hosts.items():
        if not es_sesion_ssh(clave, datos):
            continue
        grupo = detectar_grupo(clave)
        filas.append({
            "name": clave,
            # Conecta por IP si la hay; si no, por el propio nombre (FQDN)
            "host": (datos.get("ip") or clave).strip(),
            "port": datos.get("port", 22) or 22,
            "username": datos.get("user", ""),
            "password": datos.get("password", ""),
            "authMethod": "password",
            "jumpHost": "",
            "jumpPort": "",
            "jumpUsername": "",
            "jumpPassword": "",
            "group": grupo,
            "color": COLORES.get(grupo, "blue"),
        })
    # Orden: primero los jump hosts, luego por grupo y nombre
    filas.sort(key=lambda f: (f["group"] != "JUMP", f["group"], f["name"]))
    return filas


def main():
    if len(sys.argv) != 3:
        print(f"Uso: python3 {sys.argv[0]} <globals.py> <salida.csv>")
        sys.exit(1)

    ruta_py, ruta_csv = sys.argv[1], sys.argv[2]
    hosts = extraer_hosts(ruta_py)
    filas = construir_filas(hosts)

    with open(ruta_csv, "w", encoding="utf-8", newline="") as fichero:
        escritor = csv.DictWriter(fichero, fieldnames=CABECERA)
        escritor.writeheader()
        escritor.writerows(filas)

    jumps = sum(1 for f in filas if f["group"] == "JUMP")
    print(f"Exportadas {len(filas)} sesiones SSH ({jumps} jump hosts) a {ruta_csv}")


if __name__ == "__main__":
    main()
