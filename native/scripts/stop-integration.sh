#!/bin/bash
set -euo pipefail
for name in ori-native-test-a ori-native-test-b ori-native-test-c; do
    if docker container inspect "$name" >/dev/null 2>&1; then
        label="$(docker inspect --format '{{index .Config.Labels "com.ori.fixture"}}' "$name")"
        if test "$label" != native-ssh; then echo "No se detiene $name: etiqueta ajena a estas pruebas." >&2; exit 1; fi
        docker stop "$name"
    fi
done
