#!/bin/bash
# Updates the tracker files from the repo in "Tracker Files" (TRACKER_REPO) while the server keeps running.
# start.sh runs this when you type "tracker update" in the console, then restarts only the tracker relay.
# Same copy rules as the install: the core is replaced, game folders are merged, so files you added stay.
cd /home/container || exit 1
REPO="$(printf '%s' "${TRACKER_REPO:-}" | tr -d ' ')"
if [ -z "${REPO}" ]; then
    echo "[tracker] Tracker Files is empty, so there's nothing to update from."
    exit 1
fi
case "${REPO}" in
    http://*|https://*) URLS="${REPO}" ;;
    *) REPO="${REPO#https://github.com/}"; REPO="${REPO%.git}"
       URLS="https://github.com/${REPO}/archive/refs/heads/main.tar.gz https://github.com/${REPO}/archive/refs/heads/master.tar.gz" ;;
esac
TMP=$(mktemp -d)
trap 'rm -rf "${TMP}"' EXIT
SRC=""
for U in ${URLS}; do
    rm -rf "${TMP}/repo"; mkdir -p "${TMP}/repo"
    if curl -fsSL --max-time 120 "${U}" | tar -xz -C "${TMP}/repo" --strip-components=1 2>/dev/null && [ -f "${TMP}/repo/tracker/index.html" ]; then
        SRC="${TMP}/repo"; break
    fi
done
if [ -z "${SRC}" ]; then
    echo "[tracker] Couldn't download the tracker from ${TRACKER_REPO}. Nothing was changed."
    exit 1
fi
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
[ -f "${SRC}/relay/ap_logic.py" ] && cp "${SRC}/relay/ap_logic.py" relay/ap_logic.py
cp "${SRC}/bin/httpd.conf" bin/httpd.conf
[ -f "${SRC}/bin/update-tracker.sh" ] && cp "${SRC}/bin/update-tracker.sh" bin/update-tracker.sh
[ -f "${SRC}/bin/setup-logic.sh" ] && cp "${SRC}/bin/setup-logic.sh" bin/setup-logic.sh
chmod +x tracker/cgi-bin/* 2>/dev/null
echo "[tracker] Tracker files updated from ${U}"
[ -f bin/setup-logic.sh ] && bash bin/setup-logic.sh /home/container
