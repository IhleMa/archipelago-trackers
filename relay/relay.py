#!/usr/bin/env python3
"""Archipelago live tracker relay.

Serves the tracker page and holds ONE tracker connection per slot to the Archipelago server
running in the same container, then streams that live state to every open page (Server-Sent
Events). However many people open the tracker, the server only sees one "tracking" login per
slot, made when the relay starts (or when the first viewer logs in to a new seed).

Standard library only. Environment:
  TRACKER_PORT   port to serve the page on (required)
  AP_PORT        Archipelago server port on 127.0.0.1 (required)
  AP_PASSWORD    the server password, if the room has one. Viewers must type it to log in;
                 it is never sent to a browser.
  TRACKER_DIR    folder with index.html, core/, games/ (default: ./tracker)
  RELAY_STATE    file that remembers a slot name so the relay can start before anyone logs in
  RELAY_HISTORY  file that keeps when each item arrived and when each game was online
                 (default: relay-history.json next to RELAY_STATE)
"""
import asyncio, base64, collections, email.utils, gzip, hashlib, hmac, json, os, queue, secrets, struct
import sys, threading, time, urllib.parse, uuid, zlib
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

VERSION = "1.2.0"
PORT = int(os.environ.get("TRACKER_PORT") or 0)
AP_HOST = "127.0.0.1"
AP_PORT = int(os.environ.get("AP_PORT") or 38281)
AP_PASSWORD = os.environ.get("AP_PASSWORD") or ""
ROOT = os.path.realpath(os.environ.get("TRACKER_DIR") or "tracker")
STATE_FILE = os.environ.get("RELAY_STATE") or "tracker-relay.json"
HISTORY_FILE = os.environ.get("RELAY_HISTORY") or os.path.join(os.path.dirname(STATE_FILE), "relay-history.json")
NON_GAME_TAGS = ("Tracker", "TextOnly", "HintGame")   # clients that aren't the game itself
SECRET = secrets.token_bytes(32)
HINT_COMMANDS = ("!hint ", "!hint_location ")
MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
        ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8"}


def log(*a):
    print(time.strftime("%H:%M:%S"), "[relay]", *a, flush=True)


# ============================== minimal websocket client ==============================
class WS:
    """Just enough RFC 6455 for a localhost connection: text frames, fragments, ping/pong, close."""

    def __init__(self, r, w):
        self.r, self.w = r, w

    @classmethod
    async def connect(cls, host, port):
        r, w = await asyncio.open_connection(host, port, limit=1 << 26)
        key = base64.b64encode(os.urandom(16)).decode()
        w.write((f"GET / HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                 f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\nUser-Agent: ArchipelagoTrackerRelay/{VERSION}\r\n\r\n").encode())
        await w.drain()
        head = await r.readuntil(b"\r\n\r\n")
        if b" 101 " not in head.split(b"\r\n", 1)[0]:
            w.close()
            raise ConnectionError("websocket upgrade refused")
        return cls(r, w)

    async def _frame(self, op, data):
        n = len(data)
        head = bytes([0x80 | op])
        head += bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack("!H", n) if n < 65536 else bytes([0x80 | 127]) + struct.pack("!Q", n)
        mask = os.urandom(4)
        self.w.write(head + mask + _mask(data, mask))
        await self.w.drain()

    async def send(self, obj):
        await self._frame(1, json.dumps(obj, separators=(",", ":")).encode())

    async def recv(self):
        buf = b""
        while True:
            b0, b1 = await self.r.readexactly(2)
            op, n = b0 & 0x0F, b1 & 0x7F
            if n == 126:
                n = struct.unpack("!H", await self.r.readexactly(2))[0]
            elif n == 127:
                n = struct.unpack("!Q", await self.r.readexactly(8))[0]
            mask = await self.r.readexactly(4) if b1 & 0x80 else None
            data = await self.r.readexactly(n)
            if mask:
                data = _mask(data, mask)
            if op == 8:
                raise ConnectionError("closed by server")
            if op == 9:
                await self._frame(10, data)
                continue
            if op == 10:
                continue
            buf += data
            if b0 & 0x80:
                return json.loads(buf)

    def close(self):
        try:
            self.w.close()
        except Exception:
            pass


def _mask(data, mask):
    n = len(data)
    return (int.from_bytes(data, "big") ^ int.from_bytes((mask * (n // 4 + 1))[:n], "big")).to_bytes(n, "big")


# ============================== shared state ==============================
lock = threading.RLock()
clients = set()            # one queue per open page
recent_feed = collections.deque(maxlen=400)


class Relay:
    def __init__(self):
        self.reset()

    def reset(self):
        self.seed = None
        self.team = 0
        self.hint_cost = 0
        self.players = {}       # slot -> {name, alias}
        self.slot_info = {}     # slot -> {name, game, type, group_members}
        self.slots = {}         # slot -> state
        self.dp_gz = None       # gzip'd {"games": {...}}
        self.ready = False
        self.bootstrap = None   # slot name used to discover the room
        self.tasks = []
        self.restarting = False
        self.hist = {}          # slot -> {times: [arrival per item, None if unknown], sessions: [[start, end]], games, online}
        self.hist_seed = None
        self.save_pending = False

    def snapshot(self):
        with lock:
            out = {}
            for s, st in self.slots.items():
                if not st.get("connected"):
                    continue
                c = dict(st["connected"])
                c["checked_locations"] = sorted(st["checked"])
                c["missing_locations"] = sorted(st["missing"])
                c["hint_points"] = st["points"]
                c["players"] = [{"team": self.team, "slot": int(k), "name": v["name"], "alias": v["alias"]} for k, v in self.players.items()]
                c["slot_info"] = self.slot_info
                h = hist(s)
                out[s] = {"connected": c, "items": st["items"], "status": st["status"], "hints": st["hints"], "conn": st["conn"],
                          "times": h["times"], "online": h["online"], "sessions": h["sessions"]}
            return {"seed": self.seed, "team": self.team, "hint_cost": self.hint_cost, "slots": out, "version": VERSION}


R = Relay()
loop = None


def broadcast(event, data):
    msg = f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n".encode()
    with lock:
        for q in list(clients):
            q.put(msg)


def save_state(slot_name):
    try:
        with open(STATE_FILE, "w") as f:
            json.dump({"slot": slot_name}, f)
    except OSError:
        pass


def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f).get("slot") or None
    except (OSError, ValueError):
        return None


# ============================== unlock history ==============================
# When each item arrived, and when each slot's game was connected, so the tracker can show a player
# what they got while they were away. Kept on disk so a restart doesn't lose it.
def hist(slot):
    h = R.hist.get(slot)
    if h is None:
        h = R.hist[slot] = {"times": [], "sessions": [], "games": 0, "online": None}
    return h


def load_history(seed):
    """Called with the lock held, once the seed is known."""
    if R.hist_seed == seed:
        return
    R.hist_seed, R.hist = seed, {}
    try:
        with open(HISTORY_FILE) as f:
            d = json.load(f)
    except (OSError, ValueError):
        return
    if d.get("seed") != seed:
        return
    saved_at = d.get("saved") or time.time()
    for k, v in (d.get("slots") or {}).items():
        sessions = [list(x) for x in v.get("sessions") or [] if isinstance(x, list) and len(x) == 2]
        if sessions and sessions[-1][1] is None:     # the relay stopped while this game was connected
            sessions[-1][1] = saved_at
        # the relay restarts together with the Archipelago server, which drops every game, so they start offline
        R.hist[int(k)] = {"times": list(v.get("times") or []), "sessions": sessions, "games": 0, "online": False if sessions else None}


def save_history_soon():
    if R.save_pending or loop is None:
        return
    R.save_pending = True
    loop.call_later(3, save_history)


def save_history():
    with lock:
        R.save_pending = False
        if not R.hist_seed:
            return
        d = {"seed": R.hist_seed, "saved": time.time(),
             "slots": {str(k): {"times": v["times"], "sessions": v["sessions"][-100:]} for k, v in R.hist.items()}}
    try:
        tmp = HISTORY_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(d, f, separators=(",", ":"))
        os.replace(tmp, HISTORY_FILE)
    except OSError as e:
        log(f"couldn't save the unlock history: {e}")


def presence(m):
    """A client joined or left. Only the game itself counts, not trackers or text clients."""
    if m.get("team", R.team) != R.team or m.get("slot") is None:
        return
    slot, now = m["slot"], time.time()
    if m.get("type") == "Join":
        if any(t in NON_GAME_TAGS for t in m.get("tags") or []):
            return
        joined = True
    else:   # Part has no tags; its text says "has left the game" only for a game client
        text = "".join(p.get("text", "") for p in m.get("data") or [])
        if " has left the game" not in text:
            return
        joined = False
    with lock:
        h = hist(slot)
        if joined:
            h["games"] += 1
            if not h["online"]:
                h["sessions"].append([now, None])
            h["online"] = True
        else:
            h["games"] = max(0, h["games"] - 1)
            if h["games"] == 0:
                if h["sessions"] and h["sessions"][-1][1] is None:
                    h["sessions"][-1][1] = now
                elif h["online"] is None:       # it was connected before the relay started
                    h["sessions"].append([None, now])
                h["online"] = False
        del h["sessions"][:-100]
        out = {"slot": slot, "online": h["online"], "sessions": h["sessions"]}
    broadcast("presence", out)
    save_history_soon()


# ============================== Archipelago connections ==============================
class SlotConn:
    def __init__(self, name, discover=False):
        self.name, self.discover = name, discover
        self.ws = None
        self.slot = None
        self.result = None      # first Connected / ConnectionRefused, for the login check
        self.event = asyncio.Event()
        self.stop = False

    async def run(self):
        delay = 2
        while not self.stop:
            try:
                self.ws = await WS.connect(AP_HOST, AP_PORT)
                await self.session()
            except (OSError, ConnectionError, asyncio.IncompleteReadError, ValueError) as e:
                if self.stop:
                    return
                self.set_conn("offline")
                if self.result is None and self.discover:
                    self.result = "offline"
                    self.event.set()
            except asyncio.CancelledError:
                return
            finally:
                if self.ws:
                    self.ws.close()
            if self.result in ("InvalidSlot", "InvalidPassword", "InvalidGame", "IncompatibleVersion"):
                return
            await asyncio.sleep(delay)
            delay = min(30, delay * 2)

    def set_conn(self, state):
        if self.slot is None:
            return
        with lock:
            st = R.slots.get(self.slot)
            if st and st["conn"] != state:
                st["conn"] = state
                broadcast("state", {"slot": self.slot, "conn": state})

    async def session(self):
        version = None
        while True:
            for m in await self.ws.recv():
                cmd = m.get("cmd")
                if cmd == "RoomInfo":
                    version = m.get("version") or {"major": 0, "minor": 6, "build": 0}
                    if R.seed and m.get("seed_name") != R.seed:
                        self.stop = True
                        if not R.restarting:
                            R.restarting = True
                            log("the server is running a new seed; starting over")
                            asyncio.get_running_loop().call_soon(restart, R.bootstrap)
                        return
                    with lock:
                        R.seed = m.get("seed_name")
                        load_history(R.seed)
                        if m.get("hint_cost") is not None:
                            R.hint_cost = m["hint_cost"]
                    if self.discover and R.dp_gz is None:
                        await self.ws.send([{"cmd": "GetDataPackage", "games": m.get("games") or []}])
                    else:
                        await self.connect(version)
                elif cmd == "DataPackage":
                    games = {g: {"item_name_to_id": d.get("item_name_to_id", {}), "location_name_to_id": d.get("location_name_to_id", {})}
                             for g, d in (m.get("data", {}).get("games") or {}).items()}
                    R.dp_gz = gzip.compress(json.dumps({"games": games}, separators=(",", ":")).encode(), 6)
                    await self.connect(version)
                elif cmd == "ConnectionRefused":
                    err = (m.get("errors") or ["refused"])[0]
                    log(f"slot {self.name!r} refused: {err}")
                    self.result = err
                    self.event.set()
                    raise ConnectionError(err)
                elif cmd == "Connected":
                    await self.on_connected(m)
                elif cmd == "ReceivedItems":
                    self.on_items(m)
                elif cmd == "RoomUpdate":
                    self.on_room_update(m)
                elif cmd in ("Retrieved", "SetReply"):
                    keys = (m.get("keys") or {}) if cmd == "Retrieved" else {m.get("key"): m.get("value")}
                    with lock:
                        st = R.slots.get(self.slot)
                        for k, v in keys.items():
                            if k.startswith("_read_client_status_"):
                                st["status"] = v or 0
                            elif k.startswith("_read_hints_"):
                                st["hints"] = v if isinstance(v, list) else []
                    if cmd == "SetReply":
                        broadcast("pkt", {"slot": self.slot, "m": m})
                elif cmd == "PrintJSON":
                    self.on_print(m)

    async def connect(self, version):
        await self.ws.send([{"cmd": "Connect", "password": AP_PASSWORD, "game": "", "name": self.name, "uuid": str(uuid.uuid4()),
                             "version": {**{k: version.get(k, 0) for k in ("major", "minor", "build")}, "class": "Version"},
                             "items_handling": 7, "tags": ["Tracker"], "slot_data": True}])

    async def on_connected(self, m):
        self.slot = m["slot"]
        keys = [f"_read_client_status_{m['team']}_{self.slot}", f"_read_hints_{m['team']}_{self.slot}"]
        with lock:
            R.team = m["team"]
            for p in m.get("players") or []:
                R.players[str(p["slot"])] = {"name": p["name"], "alias": p.get("alias") or p["name"]}
            R.slot_info.update(m.get("slot_info") or {})
            st = R.slots.setdefault(self.slot, {"items": [], "status": 0, "hints": [], "conn": "connecting"})
            c = {k: v for k, v in m.items() if k not in ("checked_locations", "missing_locations", "players", "slot_info", "hint_points")}
            st.update(connected=c, checked=set(m.get("checked_locations") or []), missing=set(m.get("missing_locations") or []),
                      points=m.get("hint_points"), conn="connected")
            R.ready = True
        broadcast("pkt", {"slot": self.slot, "m": dict(self_connected(self.slot), cmd="Connected")})
        broadcast("state", {"slot": self.slot, "conn": "connected"})
        await self.ws.send([{"cmd": "Get", "keys": keys}, {"cmd": "SetNotify", "keys": keys}])
        if self.result is None:
            self.result = "ok"
            self.event.set()
        if self.discover:
            save_state(self.name)
            spawn_others()

    def on_items(self, m):
        with lock:
            st, h = R.slots[self.slot], hist(self.slot)
            if m.get("index", 0) == 0:
                st["items"] = list(m.get("items") or [])
                n = len(st["items"])
                h["times"] = (h["times"] + [None] * n)[:n]     # items that came while the relay was down: time unknown
                out = {"cmd": "ReceivedItems", "index": 0, "items": st["items"], "times": h["times"]}
            elif m["index"] == len(st["items"]):
                new = m.get("items") or []
                st["items"].extend(new)
                now = round(time.time())
                h["times"] = (h["times"] + [None] * len(st["items"]))[:len(st["items"]) - len(new)] + [now] * len(new)
                out = dict(m, times=[now] * len(new))
            else:   # out of order: ask the server for everything again
                asyncio.ensure_future(self.ws.send([{"cmd": "Sync"}]))
                return
        broadcast("pkt", {"slot": self.slot, "m": out})
        save_history_soon()

    def on_room_update(self, m):
        with lock:
            st = R.slots.get(self.slot)
            if st:
                for l in m.get("checked_locations") or []:
                    st["checked"].add(l)
                    st["missing"].discard(l)
                if m.get("hint_points") is not None:
                    st["points"] = m["hint_points"]
            for p in m.get("players") or []:
                if str(p["slot"]) in R.players:
                    R.players[str(p["slot"])]["alias"] = p.get("alias") or p["name"]
            if m.get("hint_cost") is not None:
                R.hint_cost = m["hint_cost"]
        broadcast("pkt", {"slot": self.slot, "m": m})

    def on_print(self, m):
        t = m.get("type")
        if t in ("Join", "Part"):
            if self.name == R.bootstrap:     # every connection hears it; count it once
                presence(m)
            return
        if t in ("CommandResult", "Hint"):     # answers to a hint request go to that slot's viewers
            broadcast("pkt", {"slot": self.slot, "m": m})
        if t in ("ItemSend", "Goal", "Release", "Collect", "Hint", "Countdown", "Chat", "ServerChat"):
            key = hashlib.sha1(json.dumps(m, sort_keys=True).encode()).digest()
            now = time.time()
            with lock:
                if any(k == key and now - ts < 10 for k, ts in recent_feed):
                    return
                recent_feed.append((key, now))
            broadcast("feed", m)


def self_connected(slot):
    snap = R.snapshot()["slots"].get(slot)
    return snap["connected"] if snap else {}


conns = {}   # slot name -> SlotConn


def spawn_others():
    with lock:
        names = {int(k): v["name"] for k, v in R.slot_info.items() if v.get("type") != 2}
    for s, name in names.items():
        if name not in conns:
            c = conns[name] = SlotConn(name)
            R.tasks.append(asyncio.ensure_future(c.run()))


def restart(name):
    for c in conns.values():
        c.stop = True
    for t in R.tasks:
        t.cancel()
    conns.clear()
    R.reset()
    broadcast("reset", {})
    if name:
        asyncio.ensure_future(discover(name))


async def discover(name):
    """Log in as one slot to learn the room, then open every other slot."""
    c = conns.get(R.bootstrap) if R.bootstrap else None
    if c and c.result == "ok":
        return "ok"
    if not (c and c.discover and c.result is None):     # nobody is discovering yet: this slot does it
        R.bootstrap = name
        c = conns[name] = SlotConn(name, discover=True)
        R.tasks.append(asyncio.ensure_future(c.run()))
    try:
        await asyncio.wait_for(c.event.wait(), 15)
    except asyncio.TimeoutError:
        return "offline"
    if c.result != "ok":
        conns.pop(c.name, None)
        c.stop = True
        if R.bootstrap == c.name:
            R.bootstrap = None
        return c.result
    if c.name != name:      # someone else discovered the room meanwhile: check this name exists
        with lock:
            return "ok" if any(v["name"] == name for v in R.slot_info.values()) else "InvalidSlot"
    return "ok"


def run_coro(coro, timeout=20):
    return asyncio.run_coroutine_threadsafe(coro, loop).result(timeout)


# ============================== web server ==============================
def token():
    return hmac.new(SECRET, b"viewer", hashlib.sha256).hexdigest() if AP_PASSWORD else ""


def token_ok(t):
    return not AP_PASSWORD or hmac.compare_digest(t or "", token())


def games_index():
    out = []
    gdir = os.path.join(ROOT, "games")
    try:
        names = sorted(os.listdir(gdir))
    except OSError:
        return out
    for d in names:
        if d.startswith(("_", ".")):
            continue
        try:
            with open(os.path.join(gdir, d, "game.json"), encoding="utf-8") as f:
                out.append({"dir": d, "meta": json.load(f)})
        except (OSError, ValueError):
            continue
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "ArchipelagoTracker/" + VERSION
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def send_json(self, obj, code=200, gz=False):
        body = json.dumps(obj, separators=(",", ":")).encode()
        self.send_bytes(body, "application/json", code, gz)

    def send_bytes(self, body, ctype, code=200, gz=False, extra=None):
        if gz is True and "gzip" in (self.headers.get("Accept-Encoding") or "") and len(body) > 1024:
            body = gzip.compress(body, 6)
            gz = "pre"
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if gz == "pre":
            self.send_header("Content-Encoding", "gzip")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def read_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 65536:
            raise ValueError("too large")
        return json.loads(self.rfile.read(n) or b"{}")

    # ---- GET
    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path)
        p = urllib.parse.unquote(path.path)
        if p == "/api/stream":
            return self.stream(urllib.parse.parse_qs(path.query).get("t", [""])[0])
        if p == "/api/datapackage":
            if R.dp_gz is None:
                return self.send_json({"error": "not ready"}, 503)
            if "gzip" in (self.headers.get("Accept-Encoding") or ""):
                return self.send_bytes(R.dp_gz, "application/json", gz="pre", extra={"Cache-Control": "no-cache"})
            return self.send_bytes(gzip.decompress(R.dp_gz), "application/json", extra={"Cache-Control": "no-cache"})
        if p == "/cgi-bin/games" or p == "/api/games":
            return self.send_bytes(json.dumps(games_index()).encode(), "application/json", extra={"Cache-Control": "no-store"})
        if p == "/config.json":
            cfg = {}
            try:
                with open(os.path.join(ROOT, "config.json")) as f:
                    cfg = json.load(f)
            except (OSError, ValueError):
                pass
            cfg.update(relay=True, port=AP_PORT, password=bool(AP_PASSWORD))
            return self.send_bytes(json.dumps(cfg).encode(), "application/json", extra={"Cache-Control": "no-store"})
        return self.static(p)

    def static(self, p):
        if p.endswith("/"):
            p += "index.html"
        full = os.path.realpath(os.path.join(ROOT, p.lstrip("/")))   # symlinks can't lead outside the tracker folder
        if not (full == ROOT or full.startswith(ROOT + os.sep)) or "/." in p or not os.path.isfile(full):
            return self.send_bytes(b"Not found", "text/plain", 404)
        st = os.stat(full)
        mtime = email.utils.formatdate(st.st_mtime, usegmt=True)
        if self.headers.get("If-Modified-Since") == mtime:
            self.send_response(304)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        with open(full, "rb") as f:
            body = f.read()
        ext = os.path.splitext(full)[1].lower()
        self.send_bytes(body, MIME.get(ext, "application/octet-stream"), gz=ext in (".js", ".css", ".json", ".html", ".svg"),
                        extra={"Last-Modified": mtime, "Cache-Control": "no-cache"})

    # ---- POST
    def do_POST(self):
        p = urllib.parse.urlsplit(self.path).path
        try:
            body = self.read_json()
        except ValueError:
            return self.send_json({"ok": False, "error": "bad request"}, 400)
        if p == "/api/login":
            return self.login(body)
        if p == "/api/say":
            return self.say(body)
        self.send_json({"ok": False, "error": "not found"}, 404)

    def login(self, body):
        slot = str(body.get("slot") or "").strip()
        if AP_PASSWORD and not hmac.compare_digest(str(body.get("password") or ""), AP_PASSWORD):
            return self.send_json({"ok": False, "error": "InvalidPassword" if body.get("password") else "NeedPassword"})
        with lock:
            known = R.ready and any(v["name"] == slot for v in R.slot_info.values())
            ready = R.ready
        if not known:
            if not slot:
                return self.send_json({"ok": False, "error": "InvalidSlot"})
            if ready:
                return self.send_json({"ok": False, "error": "InvalidSlot"})
            try:
                res = run_coro(discover(slot))
            except Exception:
                res = "offline"
            if res != "ok":
                return self.send_json({"ok": False, "error": res})
        self.send_json({"ok": True, "token": token()})

    def say(self, body):
        if not token_ok(body.get("t")):
            return self.send_json({"ok": False, "error": "InvalidPassword"}, 403)
        text = str(body.get("text") or "")
        if not text.startswith(HINT_COMMANDS) or len(text) > 200:
            return self.send_json({"ok": False, "error": "Only hint requests can be sent from the tracker."}, 400)
        try:
            slot = int(body.get("slot"))
        except (TypeError, ValueError):
            return self.send_json({"ok": False, "error": "bad slot"}, 400)
        c = next((c for c in conns.values() if c.slot == slot), None)
        if not c or not c.ws or R.slots.get(slot, {}).get("conn") != "connected":
            return self.send_json({"ok": False, "error": "That slot isn't connected right now."})
        try:
            run_coro(c.ws.send([{"cmd": "Say", "text": text}]), 5)
        except Exception:
            return self.send_json({"ok": False, "error": "Couldn't reach the server."})
        self.send_json({"ok": True})

    # ---- live stream
    def stream(self, t):
        if not token_ok(t):
            return self.send_json({"error": "InvalidPassword"}, 403)
        gz = "gzip" in (self.headers.get("Accept-Encoding") or "")
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        if gz:
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        z = zlib.compressobj(6, zlib.DEFLATED, 31) if gz else None
        q = queue.Queue()
        with lock:
            snap = f"event: snap\ndata: {json.dumps(R.snapshot(), separators=(',', ':'))}\n\n".encode()
            clients.add(q)
        try:
            self.write_chunk(z, b"retry: 3000\n" + snap)
            while True:
                try:
                    msg = q.get(timeout=20)
                except queue.Empty:
                    msg = b": keep-alive\n\n"
                batch = [msg]
                while not q.empty() and len(batch) < 200:
                    batch.append(q.get_nowait())
                self.write_chunk(z, b"".join(batch))
        except (OSError, ValueError):
            pass
        finally:
            with lock:
                clients.discard(q)

    def write_chunk(self, z, data):
        if z:
            data = z.compress(data) + z.flush(zlib.Z_SYNC_FLUSH)
        self.wfile.write(data)
        self.wfile.flush()


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 64


def main():
    global loop
    if not PORT:
        sys.exit("TRACKER_PORT is not set")
    loop = asyncio.new_event_loop()
    threading.Thread(target=loop.run_forever, daemon=True).start()
    try:
        httpd = Server(("0.0.0.0", PORT), Handler)
    except OSError as e:
        sys.exit(f"could not listen on port {PORT}: {e}")
    log(f"tracker on port {PORT}, following the Archipelago server on port {AP_PORT}")
    saved = load_state()
    if saved:
        def first():
            asyncio.ensure_future(discover(saved))
        loop.call_soon_threadsafe(first)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
