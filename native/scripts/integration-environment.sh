#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NATIVE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURES="$NATIVE_DIR/build/integration"
mkdir -p "$FIXTURES"
chmod 700 "$FIXTURES"
if ! test -f "$FIXTURES/id_test"; then ssh-keygen -q -t ed25519 -N '' -f "$FIXTURES/id_test"; fi
cp "$NATIVE_DIR/Tests/Integration/Dockerfile" "$FIXTURES/Dockerfile"
printf '%s\n' '*' '!Dockerfile' '!id_test.pub' > "$FIXTURES/.dockerignore"
docker build -t ori-native-ssh-test "$FIXTURES"
image_id="$(docker image inspect --format '{{.Id}}' ori-native-ssh-test)"
if ! docker network inspect ori-native-test-network >/dev/null 2>&1; then
    docker network create --label com.ori.fixture=native-ssh ori-native-test-network
fi
test "$(docker network inspect --format '{{index .Labels "com.ori.fixture"}}' ori-native-test-network)" = native-ssh
# Only containers owned by this explicit fixture are created or removed.
for instance in a b c; do
    name="ori-native-test-$instance"
    if docker container inspect "$name" >/dev/null 2>&1; then
        label="$(docker inspect --format '{{index .Config.Labels "com.ori.fixture"}}' "$name")"
        if test "$label" != native-ssh; then echo "Nombre de contenedor ocupado: $name" >&2; exit 1; fi
        if test "$(docker inspect --format '{{.Image}}' "$name")" != "$image_id"; then docker rm -f "$name"; fi
    fi
    if ! docker container inspect "$name" >/dev/null 2>&1; then
        case "$instance" in a) port=22401 ;; b) port=22402 ;; c) port=22403 ;; esac
        docker run -d --name "$name" --network ori-native-test-network --label com.ori.fixture=native-ssh -p "127.0.0.1:$port:2222" ori-native-ssh-test
    elif test "$(docker inspect --format '{{.State.Running}}' "$name")" != true; then
        docker start "$name"
    fi
done
: > "$FIXTURES/known_hosts"
for instance in a b c; do
    case "$instance" in a) port=22401 ;; b) port=22402 ;; c) port=22403 ;; esac
    for attempt in 1 2 3 4 5; do
        if key="$(docker exec "ori-native-test-$instance" cat /etc/ssh/ssh_host_ed25519_key.pub 2>/dev/null)"; then break; fi
        sleep 1
    done
    # Seed only from our own container's public key, not from an unauthenticated scan.
    printf '[127.0.0.1]:%s %s\n' "$port" "$key" >> "$FIXTURES/known_hosts"
    printf '[ori-native-test-%s]:2222 %s\n' "$instance" "$key" >> "$FIXTURES/known_hosts"
    test "$(docker inspect --format '{{.State.Running}}' "ori-native-test-$instance")" = true
done
chmod 600 "$FIXTURES/known_hosts"
echo "Fixtures listas: $FIXTURES"
echo "Pruebas: ORI_SSH_FIXTURES=$FIXTURES swift test --package-path native --filter SSHIntegrationTests"
