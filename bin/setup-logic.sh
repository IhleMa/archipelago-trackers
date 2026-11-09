#!/bin/bash
# Exact in-logic tracking (relay/ap_logic.py): fetches Archipelago's source for the version this server runs,
# only the core modules and the worlds the tracker can rebuild, into relay/ap, and the few Python packages
# they need into the relay's own Python. Run by the installer and by "tracker update"; does nothing when it's
# already set up for this version. Without it, the tracker works the same, just without the exact logic.
cd "${1:-/home/container}" || exit 0
PY=relay/python/bin/python3
[ -x "${PY}" ] || { echo "[tracker] No relay Python, so no exact logic."; exit 0; }
WORLDS="stardew_valley"

# Which Archipelago is installed: the build's manifest, else the egg's version setting, else the latest release
V=""
for m in Archipelago/manifest.json Archipelago/lib/manifest.json; do
    [ -f "${m}" ] && V=$("${PY}" -c "import json,sys; v=json.load(open(sys.argv[1])).get('version'); print('.'.join(map(str,v)) if isinstance(v,list) else (v or ''))" "${m}" 2>/dev/null) && [ -n "${V}" ] && break
done
[ -z "${V}" ] && [ -f Archipelago/.ap_version ] && V=$(cat Archipelago/.ap_version)
[ -z "${V}" ] && [ -n "${AP_VERSION}" ] && [ "${AP_VERSION}" != "latest" ] && V="${AP_VERSION}"
[ -z "${V}" ] && V=$(curl -fsSL --max-time 30 https://api.github.com/repos/ArchipelagoMW/Archipelago/releases/latest | "${PY}" -c "import json,sys; print(json.load(sys.stdin)['tag_name'])" 2>/dev/null)
[ -z "${V}" ] && { echo "[tracker] Couldn't tell which Archipelago version runs here, so no exact logic."; exit 0; }

WANT="${V} ${WORLDS} shared-v2"
if [ "$(cat relay/ap/.version 2>/dev/null)" != "${WANT}" ]; then
    TMP=$(mktemp -d)
    PATTERNS=("*/[A-Za-z_]*.py" "*/rule_builder/*" "*/worlds/*.py" "*/worlds/generic/*" "*/worlds/_*/*")
    for w in ${WORLDS}; do PATTERNS+=("*/worlds/${w}/*"); done
    if curl -fsSL --max-time 300 "https://codeload.github.com/ArchipelagoMW/Archipelago/tar.gz/refs/tags/${V}" \
        | tar -xz -C "${TMP}" --strip-components=1 --wildcards --no-wildcards-match-slash "${PATTERNS[@]}" 2>/dev/null \
        || [ -f "${TMP}/BaseClasses.py" ]; then
        find "${TMP}/worlds" -maxdepth 1 -mindepth 1 -type d | while read -r d; do
            case " generic ${WORLDS} " in *" $(basename "${d}") "*) ;; *)
                case "$(basename "${d}")" in _*) ;; *) rm -rf "${d}" ;; esac ;; esac   # keep shared helpers like _bizhawk
        done
        rm -rf relay/ap && mv "${TMP}" relay/ap && echo "${WANT}" > relay/ap/.version
        echo "[tracker] Exact logic: Archipelago ${V} source for ${WORLDS// /, }."
    else
        rm -rf "${TMP}"
        echo "[tracker] Couldn't download Archipelago ${V}'s source, so no exact logic this time."
        exit 0
    fi
fi

if ! "${PY}" -c "import yaml, schema, pathspec, typing_extensions, bsdiff4, orjson" 2>/dev/null; then
    "${PY}" -m pip --version >/dev/null 2>&1 || "${PY}" -m ensurepip -q >/dev/null 2>&1
    "${PY}" -m pip install -q --disable-pip-version-check pyyaml schema pathspec typing_extensions bsdiff4 orjson >/dev/null 2>&1 \
        && echo "[tracker] Exact logic: Python packages installed." \
        || echo "[tracker] Couldn't install the Python packages for exact logic."
fi
exit 0
