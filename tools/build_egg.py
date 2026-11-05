#!/usr/bin/env python3
"""Build the Pterodactyl egg from tools/egg-base.json (the plain Archipelago egg) plus the live tracker.

    python3 tools/build_egg.py [owner/repo]

The egg embeds a small built-in copy of the tracker (core page, relay, generic view and the
games that still fit) and, at install time, downloads the full tracker with every game from
the GitHub repo in the "Tracker Files" variable. Pterodactyl stores the install script in a
64 KB column, which is why the games come from the repo instead of the egg itself.
"""
import base64, io, json, os, subprocess, sys, tarfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = sys.argv[1] if len(sys.argv) > 1 else ""
OUT = os.path.join(ROOT, "egg", "egg-archipelago-multiworld-tracker.json")
LIMIT = 65535
PY_URL = ("https://github.com/astral-sh/python-build-standalone/releases/download/20251014/"
          "cpython-3.12.12+20251014-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz")
# games embedded as the offline fallback, in order, while they fit
BUILTIN_GAMES = ["path-of-exile", "minecraft"]
GAME_NAMES = {"path-of-exile": "Path of Exile", "minecraft": "Minecraft"}

egg = json.load(open(os.path.join(HERE, "egg-base.json")))


def bundle(games):
    files = ["tracker/index.html", "tracker/games/README.md", "relay/relay.py", "bin/httpd.conf"]
    for top in ["tracker/core", "tracker/cgi-bin"] + [f"tracker/games/{g}" for g in games]:
        for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, top)):
            dirnames.sort()
            files += [os.path.relpath(os.path.join(dirpath, f), ROOT) for f in sorted(filenames)]
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for rel in files:
            if "/img/" in rel and not rel.endswith("NOTICE.txt"):
                continue
            data = open(os.path.join(ROOT, rel), "rb").read()
            if rel.endswith((".js", ".css")):   # the fallback copy only: indentation is dead weight in 64 KB
                data = b"\n".join(l.strip() for l in data.split(b"\n") if l.strip())
            ti = tarfile.TarInfo(rel); ti.size = len(data)
            ti.uid = ti.gid = 0; ti.uname = ti.gname = "root"; ti.mtime = 0
            ti.mode = 0o755 if rel.startswith("tracker/cgi-bin/") else 0o644
            tar.addfile(ti, io.BytesIO(data))
    xz = subprocess.run(["xz", "-9e", "-c"], input=buf.getvalue(), capture_output=True, check=True).stdout
    return base64.encodebytes(xz).decode(), len(xz)


START_SH = r'''#!/bin/bash
cd /home/container
SEED_DIR=/home/container/seeds

if [ -n "${SEED_FILE}" ]; then
    SEED="${SEED_DIR}/${SEED_FILE}"
else
    SEED=$(ls -t "${SEED_DIR}"/*.zip "${SEED_DIR}"/*.archipelago 2>/dev/null | head -n1)
fi

if [ -z "${SEED}" ] || [ ! -f "${SEED}" ]; then
    echo "No seed found. Upload your generated AP_*.zip (or .archipelago file) into the 'seeds' folder, then start the server again."
    exit 1
fi
echo "Using seed: ${SEED}"

# ---- Live tracker: a web page on TRACKER_PORT that follows every slot live
start_relay() {
    # The relay holds one tracker connection per slot and shares it with every open page.
    # It gets only what it needs; the admin password never reaches it.
    env -i PATH=/usr/bin:/bin HOME=/home/container TRACKER_PORT="${TRACKER_PORT}" AP_PORT="${SERVER_PORT}" \
        AP_PASSWORD="${SERVER_PASSWORD}" TRACKER_DIR=/home/container/tracker RELAY_STATE=/home/container/relay/state.json \
        ./relay/python/bin/python3 -u ./relay/relay.py >> ./relay/relay.log 2>&1 &
    echo $! > ./relay/relay.pid
    sleep 1
}
stop_relay() {
    local pid; pid=$(cat ./relay/relay.pid 2>/dev/null) || return 0
    kill "${pid}" 2>/dev/null
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "${pid}" 2>/dev/null || break; sleep 0.3; done
    kill -9 "${pid}" 2>/dev/null; rm -f ./relay/relay.pid
}
# "tracker update" in the console: new tracker files from Tracker Files, then only the relay restarts.
# The Archipelago server and everyone's games keep running.
update_tracker() {
    if [ ! -f ./bin/update-tracker.sh ]; then echo "[tracker] This install has no update script yet. Reinstall the server once to add it."; return; fi
    echo "[tracker] Updating the tracker from ${TRACKER_REPO}…"
    bash ./bin/update-tracker.sh || return
    if [ "${STARTED}" = "relay" ]; then
        stop_relay; start_relay
        if kill -0 "$(cat ./relay/relay.pid 2>/dev/null)" 2>/dev/null; then
            echo "[tracker] Tracker relay restarted. Open tracker pages reload by themselves."
        else
            echo "[tracker] The tracker relay didn't come back up:"; tail -n 5 ./relay/relay.log
        fi
    else
        echo "[tracker] Done. Reload the tracker page to see the changes."
    fi
}
start_busybox() {
    # without the relay: busybox serves the files and every page connects to the server itself
    [ -x ./bin/busybox ] || return 1
    chmod +x tracker/cgi-bin/* 2>/dev/null
    env -i PATH=/usr/bin:/bin ./bin/busybox httpd -p "0.0.0.0:${TRACKER_PORT}" -h /home/container/tracker -c /home/container/bin/httpd.conf
}
if [ -n "${TRACKER_PORT}" ] && [ "${TRACKER_PORT}" != "0" ]; then
    if [ "${TRACKER_PORT}" = "${SERVER_PORT}" ]; then
        echo "[tracker] Tracker Port must be a different port from the server's. Tracker not started."
    elif [ -f ./tracker/index.html ]; then
        clean() { printf '%s' "$1" | tr -d '"\\' | tr -d '\000-\037'; }
        printf '{"port":%s,"slot":"%s","title":"%s"}\n' "${SERVER_PORT}" "$(clean "${TRACKER_SLOT}")" "$(clean "${TRACKER_TITLE}")" > tracker/config.json
        STARTED=""
        if [ -x ./relay/python/bin/python3 ] && [ -f ./relay/relay.py ]; then
            : > ./relay/relay.log
            start_relay
            if kill -0 "$(cat ./relay/relay.pid)" 2>/dev/null; then STARTED="relay"; else tail -n 3 ./relay/relay.log; fi
        fi
        if [ -z "${STARTED}" ] && start_busybox; then STARTED="busybox"; fi
        case "${STARTED}" in
            relay)   echo "[tracker] Live tracker running on port ${TRACKER_PORT} (one connection per slot). Open http://<this server's address>:${TRACKER_PORT}" ;;
            busybox) echo "[tracker] Live tracker running on port ${TRACKER_PORT} (without the relay: each open page connects on its own). Open http://<this server's address>:${TRACKER_PORT}" ;;
            *)       echo "[tracker] Could not start the tracker on port ${TRACKER_PORT}. Assign that port to this server under Network/Allocations." ;;
        esac
    else
        echo "[tracker] Tracker files are missing. Reinstall the server to add them."
    fi
fi

ARGS=(--host 0.0.0.0 --port "${SERVER_PORT}")
[ -n "${SERVER_PASSWORD}" ] && ARGS+=(--password "${SERVER_PASSWORD}")
[ -n "${ADMIN_PASSWORD}" ]  && ARGS+=(--server_password "${ADMIN_PASSWORD}")
ARGS+=(--hint_cost "${HINT_COST:-10}")
ARGS+=(--location_check_points "${LOCATION_CHECK_POINTS:-1}")
ARGS+=(--release_mode "${RELEASE_MODE:-auto}")
ARGS+=(--collect_mode "${COLLECT_MODE:-auto}")
ARGS+=(--remaining_mode "${REMAINING_MODE:-goal}")
ARGS+=(--auto_shutdown "${AUTO_SHUTDOWN:-0}")

# The console goes through this script so it can catch "tracker update"; everything else is passed on to
# the Archipelago server unchanged (including the panel's stop command, /exit).
CONSOLE=/home/container/.console
rm -f "${CONSOLE}"; mkfifo "${CONSOLE}"
./Archipelago/ArchipelagoServer "${ARGS[@]}" "${SEED}" < "${CONSOLE}" &
AP_PID=$!
exec 3> "${CONSOLE}"
trap 'kill -TERM "${AP_PID}" 2>/dev/null' TERM INT
exec 4<&0   # a background job's input would be /dev/null; hand it the console explicitly
(
    while IFS= read -r line; do
        case "$(printf '%s' "${line}" | tr -d '\r' | tr 'A-Z' 'a-z')" in
            "tracker update"|"/tracker update") update_tracker ;;
            *) printf '%s\n' "${line}" >&3 ;;
        esac
    done
) <&4 &
READER=$!
CODE=0
while kill -0 "${AP_PID}" 2>/dev/null; do wait "${AP_PID}"; CODE=$?; done
kill "${READER}" 2>/dev/null
stop_relay
pkill -f "busybox httpd -p 0.0.0.0:${TRACKER_PORT}" 2>/dev/null
rm -f "${CONSOLE}"
exit "${CODE}"
'''

INSTALL = r'''#!/bin/bash
# Archipelago install script (runs in ghcr.io/parkervcp/installers:debian)
set -e
apt-get update -qq && apt-get install -y -qq curl jq tar xz-utils ca-certificates busybox-static >/dev/null

mkdir -p /mnt/server
cd /mnt/server

if [ -z "${AP_VERSION}" ] || [ "${AP_VERSION}" == "latest" ]; then
    AP_VERSION=$(curl -fsSL https://api.github.com/repos/ArchipelagoMW/Archipelago/releases/latest | jq -r '.tag_name')
fi
echo "Installing Archipelago ${AP_VERSION}"

URL="https://github.com/ArchipelagoMW/Archipelago/releases/download/${AP_VERSION}/Archipelago_${AP_VERSION}_linux-x86_64.tar.gz"
curl -fL -o archipelago.tar.gz "${URL}" || { echo "Download failed: ${URL}"; exit 1; }

# Keep the user's host.yaml across reinstalls/updates
[ -f Archipelago/host.yaml ] && cp Archipelago/host.yaml /tmp/host.yaml.bak
tar -xzf archipelago.tar.gz
rm -f archipelago.tar.gz
[ -f /tmp/host.yaml.bak ] && cp /tmp/host.yaml.bak Archipelago/host.yaml
chmod +x Archipelago/ArchipelagoServer || true

mkdir -p seeds Archipelago/custom_worlds

# ---- Live tracker
mkdir -p bin relay tracker/games
cp "$(command -v busybox)" bin/busybox && chmod +x bin/busybox

# A portable Python for the tracker relay (the server image has none)
PY_URL="@@PY_URL@@"
if [ ! -x relay/python/bin/python3 ] || [ "$(cat relay/python/.source 2>/dev/null)" != "${PY_URL}" ]; then
    rm -rf relay/python
    if curl -fsSL "${PY_URL}" | tar -xz -C relay && [ -x relay/python/bin/python3 ]; then
        echo "${PY_URL}" > relay/python/.source
    else
        rm -rf relay/python
        echo "Couldn't download Python for the tracker relay. The tracker still works, but every open page connects on its own."
    fi
fi

# Tracker files: from the GitHub repo in "Tracker Files" (all game trackers), else the built-in copy
TMP=$(mktemp -d)
mkdir -p "${TMP}/builtin" "${TMP}/repo"
base64 -d <<'TRACKER_BUNDLE' | tar -xJ -C "${TMP}/builtin"
@@BUNDLE@@TRACKER_BUNDLE
SRC="${TMP}/builtin"
REPO="$(printf '%s' "${TRACKER_REPO}" | tr -d ' ')"
if [ -n "${REPO}" ]; then
    case "${REPO}" in
        http://*|https://*) URLS="${REPO}" ;;
        *) REPO="${REPO#https://github.com/}"; REPO="${REPO%.git}"
           URLS="https://github.com/${REPO}/archive/refs/heads/main.tar.gz https://github.com/${REPO}/archive/refs/heads/master.tar.gz" ;;
    esac
    for U in ${URLS}; do
        rm -rf "${TMP}/repo"; mkdir -p "${TMP}/repo"
        if curl -fsSL "${U}" | tar -xz -C "${TMP}/repo" --strip-components=1 2>/dev/null && [ -f "${TMP}/repo/tracker/index.html" ]; then
            SRC="${TMP}/repo"; echo "Tracker files from ${U}"; break
        fi
    done
    [ "${SRC}" = "${TMP}/builtin" ] && echo "Couldn't download the tracker from ${TRACKER_REPO}; using the built-in copy (@@BUILTIN@@)."
fi
# The core is replaced. Game folders are merged, so extra files you added (like the OSRS map image)
# and game folders of your own stay.
rm -rf tracker/core tracker/cgi-bin tracker/demo
cp -r "${SRC}/tracker/core" "${SRC}/tracker/cgi-bin" "${SRC}/tracker/index.html" tracker/
[ -d "${SRC}/tracker/demo" ] && cp -r "${SRC}/tracker/demo" tracker/
for d in "${SRC}"/tracker/games/*/; do
    name=$(basename "${d}")
    mkdir -p "tracker/games/${name}"
    cp -r "${d}." "tracker/games/${name}/"
done
cp "${SRC}/tracker/games/README.md" tracker/games/README.md
cp "${SRC}/relay/relay.py" relay/relay.py
cp "${SRC}/bin/httpd.conf" bin/httpd.conf
[ -f "${SRC}/bin/update-tracker.sh" ] && cp "${SRC}/bin/update-tracker.sh" bin/update-tracker.sh
chmod +x tracker/cgi-bin/*
rm -rf "${TMP}"

cat > start.sh <<'EOF'
@@START@@EOF
chmod +x start.sh

echo "Install complete. Upload your seed to the seeds/ folder."
'''


def build(games):
    b64, n = bundle(games)
    assert "TRACKER_BUNDLE" not in b64 and "\nEOF\n" not in START_SH
    names = " and ".join(GAME_NAMES[g] for g in games) + " only" if games else "no game trackers"
    return INSTALL.replace("@@BUILTIN@@", names).replace("@@BUNDLE@@", b64).replace("@@START@@", START_SH).replace("@@PY_URL@@", PY_URL), n


games = []
install, xz = build(games)
for g in BUILTIN_GAMES:
    trial, n = build(games + [g])
    if len(trial.encode()) > LIMIT - 1500:
        break
    games.append(g); install, xz = trial, n

egg["exported_at"] = "2026-11-04T21:00:00+01:00"
egg["description"] = ("Archipelago multi-game randomizer server (ArchipelagoServer / MultiServer) with a live web tracker. "
                      "Upload a generated AP_*.zip seed to the seeds/ folder and start. "
                      "For the tracker, assign a second port to the server and set it as Tracker Port.")
egg["scripts"]["installation"]["script"] = install
names = {v["env_variable"] for v in egg["variables"]}
for v in [
    {"name": "Tracker Port", "env_variable": "TRACKER_PORT", "default_value": "8080",
     "description": "Port for the live tracker web page. It must be an extra port (allocation) assigned to this server, different from the main one. Leave empty to turn the tracker off.",
     "rules": "nullable|integer|between:1,65535"},
    {"name": "Tracker Default Slot", "env_variable": "TRACKER_SLOT", "default_value": "",
     "description": "Optional. A slot name the tracker connects with automatically, so spectators don't have to type one. Players can still pick their own slot.",
     "rules": "nullable|string|max:64"},
    {"name": "Tracker Title", "env_variable": "TRACKER_TITLE", "default_value": "",
     "description": "Optional. Heading shown on the tracker page, e.g. the name of your run.",
     "rules": "nullable|string|max:60"},
    {"name": "Tracker Files", "env_variable": "TRACKER_REPO", "default_value": REPO,
     "description": "GitHub repo (owner/name) the tracker and all game trackers are downloaded from when you install or reinstall. A direct .tar.gz link works too. Empty: only the built-in copy (" + (" and ".join(GAME_NAMES[g] for g in games) or "no game trackers") + ").",
     "rules": "nullable|string|max:200"},
]:
    if v["env_variable"] in names:
        next(x for x in egg["variables"] if x["env_variable"] == v["env_variable"]).update(default_value=v["default_value"], description=v["description"], rules=v["rules"])
    else:
        v.update({"user_viewable": True, "user_editable": True, "field_type": "text"})
        egg["variables"].append(v)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(egg, f, indent=4, ensure_ascii=False)
    f.write("\n")
print(f"install script {len(install.encode())} bytes (limit {LIMIT}), built-in bundle {xz} bytes xz, built-in games: {', '.join(games) or 'none'}")
