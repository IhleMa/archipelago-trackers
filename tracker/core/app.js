/* Archipelago Live Tracker — core.
   Follows every slot live. Normally the relay on this server holds one tracker connection per
   slot and streams it to the page (api/stream); without the relay the page connects to the
   Archipelago server itself, one tracker connection per slot. Either way it keeps progress live, renders the generic views, handles hints, and loads game trackers from
   games/<folder>/ (see games/README.md). */
"use strict";
(() => {
const VERSION = "1.4.1";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const store = {
  get(k){ try { return localStorage.getItem("aptracker." + k); } catch(e){ return null; } },
  set(k, v){ try { v == null ? localStorage.removeItem("aptracker." + k) : localStorage.setItem("aptracker." + k, v); } catch(e){} }
};
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const STATUS = { UNKNOWN:0, CONNECTED:5, READY:10, PLAYING:20, GOAL:30 };
const HINT_STATUS = { 0:["",""], 10:["No priority",""], 20:["Avoid","avoid"], 30:["Priority","prio"], 40:["Found","found"] };

/* ================= state ================= */
const S = {
  cfg:{}, server:"", password:"", slotName:"", team:0, seed:"", hintCost:0, needsPassword:false,
  players:{},  // slot -> {name, alias, game, type}
  slots:{},    // slot -> {checked:Set, missing:Set, items:[], status, conn, hints:[], points, slotData}
  dp:{},       // game -> {items:{id:name}, locs:{id:name}}
  feed:[], me:null, view:null, tab:null,
  filter:"", show:"missing", hintQ:"", itemQ:"", pending:null, histProg:false, histCap:200, range:0, focus:null, hoverX:null
};
const conns = new Map();
let primary = null, stopped = true, relayES = null;

/* ================= game trackers (plugins) ================= */
const plugins = {};      // game name -> plugin definition
const broken = {};       // game name -> error message
let gameIndex = null;    // [{dir, meta}] from cgi-bin/games
const loads = new Map(); // dir -> Promise

window.APTracker = {
  version: VERSION,
  /** Register a game tracker. Call once from games/<folder>/tracker.js. See games/README.md. */
  register(def){
    const src = document.currentScript && document.currentScript.src;
    const base = src ? new URL(".", src).href : "";
    const names = [].concat(def.game || def.games || []);
    if(!names.length){ console.error("[tracker] register() needs a game name", def); return; }
    for(const g of names) plugins[g] = Object.assign({}, def, { base, gameName: g });
  },
  esc
};

async function loadGameIndex(){
  if(gameIndex) return gameIndex;
  gameIndex = [];
  for(const url of ["cgi-bin/games", "games/index.json"]){   // index.json: for hosts without the cgi script
    try { const r = await fetch(url, { cache:"no-store" }); if(r.ok){ gameIndex = await r.json(); break; } } catch(e){}
  }
  if(!Array.isArray(gameIndex)) gameIndex = [];
  return gameIndex;
}
function loadScript(url){ return new Promise((ok, fail) => { const s = document.createElement("script"); s.src = url; s.onload = ok; s.onerror = () => fail(new Error("could not load " + url)); document.head.appendChild(s); }); }
function loadStyle(url){ const l = document.createElement("link"); l.rel = "stylesheet"; l.href = url; document.head.appendChild(l); }

async function loadPluginsFor(games){
  const index = await loadGameIndex();
  const jobs = [];
  for(const game of games){
    if(plugins[game] || broken[game]) continue;
    const entry = index.find(e => e && e.meta && [].concat(e.meta.game || e.meta.games || []).includes(game));
    if(!entry) continue;
    if(!loads.has(entry.dir)) loads.set(entry.dir, (async () => {
      const base = `games/${encodeURIComponent(entry.dir)}/`;
      for(const css of [].concat(entry.meta.style || [])) loadStyle(base + css);
      await loadScript(base + (entry.meta.script || "tracker.js"));
    })());
    jobs.push(loads.get(entry.dir).then(async () => {
      const p = plugins[game];
      if(!p) throw new Error("tracker.js did not call APTracker.register for " + game);
      if(p.init && !p._ready){
        p._ready = true;
        await p.init({ url: path => p.base + path, json: path => fetch(p.base + path).then(r => { if(!r.ok) throw new Error(path + " " + r.status); return r.json(); }) });
      }
    }).catch(err => { console.error("[tracker]", game, err); broken[game] = err.message || String(err); delete plugins[game]; }));
  }
  await Promise.all(jobs);
  render();
}
const pluginFor = slot => plugins[slotGame(slot)] || null;

/* ================= lookups ================= */
const slotGame  = s => S.players[s]?.game || "";
const slotAlias = s => S.players[s]?.alias || S.players[s]?.name || `Player ${s}`;
const itemName  = (game, id) => S.dp[game]?.items[id] ?? `Item ${id}`;
const locName   = (game, id) => S.dp[game]?.locs[id] ?? `Location ${id}`;
const itemId    = (game, name) => S.dp[game]?.itemIds?.[name];
const itemClass = f => f & 4 ? "it-trap" : f & 1 ? "it-prog" : f & 2 ? "it-useful" : "";
const ensureSlot = s => S.slots[s] || (S.slots[s] = { checked:new Set(), missing:new Set(), items:[], times:[], status:0, conn:"connecting", hints:[], points:null, slotData:null, online:null, sessions:[], games:0, prog:[] });
/** Progress over time: [unix seconds, checks done], one point per change (checks within a minute share one). */
function noteChecks(sl){
  const c = sl.prog, now = Math.round(Date.now() / 1000), n = sl.checked.size;
  if(c.length && c[c.length - 1][1] === n) return;
  if(c.length >= 2 && now - c[c.length - 1][0] < 60) c[c.length - 1][1] = n; else c.push([now, n]);
}
const counts = s => { const sl = S.slots[s]; const c = sl.checked.size; return { c, t: c + sl.missing.size }; };
const pct = s => { const { c, t } = counts(s); return t ? c / t : 0; };
/** A player's name in their own color (the same one their line has in the progress chart). */
const pname = s => `<span class="p c${seriesOf(s)}">${esc(slotAlias(s))}</span>`;
const slotList = () => Object.keys(S.players).map(Number).filter(s => S.players[s].type !== 2 && S.slots[s]).sort((a, b) => pct(b) - pct(a) || slotAlias(a).localeCompare(slotAlias(b)));

/* ================= connection ================= */
function wsUrls(addr){
  addr = addr.trim().replace(/\/+$/, "");
  if(/^wss?:\/\//.test(addr)) return [addr];
  if(!/:\d+$/.test(addr)) addr += ":38281";
  return location.protocol === "https:" ? ["wss://" + addr] : ["ws://" + addr, "wss://" + addr];
}
class Conn {
  constructor(name, isPrimary, wantSlotData, viaRelay){
    this.name = name; this.primary = isPrimary; this.wantSlotData = !!wantSlotData; this.relay = !!viaRelay;
    this.state = "connecting"; this.tries = 0;
    if(!this.relay){ this.urls = wsUrls(S.server); this.urlIdx = 0; this.open(); }
  }
  open(){
    if(stopped) return;
    let ws; this.opened = false; this.sentConnect = false;
    try { ws = new WebSocket(this.urls[this.urlIdx]); } catch(e){ return this.refuse("bad-url"); }
    this.ws = ws;
    ws.onopen = () => { this.opened = true; };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch(_){ return; } for(const x of m) this.handle(x); };
    ws.onclose = () => {
      if(stopped || this.state === "refused") return;
      if(!this.opened && this.urlIdx < this.urls.length - 1){ this.urlIdx++; return this.open(); }
      this.urlIdx = 0;   // every retry starts with the plain address again; otherwise a server restart leaves it stuck on wss://
      this.setState("offline");
      setTimeout(() => this.open(), Math.min(30000, 2000 * 2 ** this.tries++));
    };
  }
  send(cmds){
    if(!this.relay){ if(this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(cmds)); return; }
    for(const c of cmds){   // through the relay only hint requests go out; it keeps everything else in sync itself
      if(c.cmd === "Say") relayPost("api/say", { slot:this.slot, text:c.text, t:S.token }).then(r => { if(!r.ok) showReply(esc(r.error || "The hint wasn't sent.")); });
      else if(c.cmd === "Sync") openStream();
    }
  }
  close(){ try { this.ws && this.ws.close(); } catch(e){} }
  setState(st){ this.state = st; if(this.slot != null && S.slots[this.slot]) S.slots[this.slot].conn = st; render(); }
  refuse(code){ this.state = "refused"; if(this.primary) connectError(code); else this.setState("refused"); this.close(); }
  connect(){
    this.sentConnect = true;
    const v = this.version || { major:0, minor:6, build:0 };
    this.send([{ cmd:"Connect", password:S.password, game:"", name:this.name, uuid:uuid(),
      version:{ major:v.major, minor:v.minor, build:v.build, class:"Version" },
      items_handling:7, tags:["Tracker"], slot_data:this.wantSlotData }]);
  }
  handle(m){
    switch(m.cmd){
      case "RoomInfo": {
        this.version = m.version; S.seed = m.seed_name || S.seed;
        if(m.hint_cost != null) S.hintCost = m.hint_cost;
        if(this.primary && m.password && !S.password){ needPassword(); this.state = "refused"; this.close(); return; }
        const need = (m.games || []).filter(g => !S.dp[g]);
        if(this.primary && need.length) this.send([{ cmd:"GetDataPackage", games:need }]);
        else this.connect();
        break;
      }
      case "DataPackage": {
        for(const [g, d] of Object.entries(m.data.games || {})){
          const items = {}, locs = {}, itemIds = {};
          for(const [n, i] of Object.entries(d.item_name_to_id || {})){ items[i] = n; itemIds[n] = i; }
          for(const [n, i] of Object.entries(d.location_name_to_id || {})) locs[i] = n;
          S.dp[g] = { items, locs, itemIds };
        }
        if(!this.sentConnect) this.connect();
        break;
      }
      case "Connected": {
        this.tries = 0; this.slot = m.slot; S.team = m.team;
        for(const p of m.players || []) S.players[p.slot] = { ...S.players[p.slot], name:p.name, alias:p.alias };
        for(const [k, info] of Object.entries(m.slot_info || {})) S.players[k] = { ...S.players[k], name:S.players[k]?.name || info.name, game:info.game, type:info.type };
        const sl = ensureSlot(m.slot);
        sl.checked = new Set(m.checked_locations); sl.missing = new Set(m.missing_locations);
        if(!S.cfg.relay) noteChecks(sl);
        if(m.hint_points != null) sl.points = m.hint_points;
        if(m.slot_data) sl.slotData = m.slot_data;
        this.setState("connected");
        if(this.primary) onPrimaryConnected();
        break;
      }
      case "ConnectionRefused": this.refuse((m.errors || [])[0] || "refused"); break;
      case "ReceivedItems": {
        const sl = ensureSlot(this.slot);
        if(m.index === 0){ sl.items = []; sl.times = []; }
        if(m.index === sl.items.length){   // times: when each item arrived (from the relay); unknown for what came before this page opened
          sl.items.push(...m.items);
          sl.times.push(...(m.times || m.items.map(() => m.index === 0 ? null : Math.round(Date.now() / 1000))));
        } else this.send([{ cmd:"Sync" }]);
        render(); break;
      }
      case "RoomUpdate": {
        if(this.slot != null){
          const sl = ensureSlot(this.slot); let n = 0;
          for(const l of m.checked_locations || []) if(!sl.checked.has(l)){ sl.checked.add(l); sl.missing.delete(l); n++; }
          if(n) noteChecks(sl);
          if(m.hint_points != null) sl.points = m.hint_points;
          if(n) flash(this.slot);
        }
        for(const p of m.players || []) if(S.players[p.slot]) S.players[p.slot].alias = p.alias;
        if(m.hint_cost != null) S.hintCost = m.hint_cost;
        render(); break;
      }
      case "Retrieved": for(const [k, v] of Object.entries(m.keys || {})) storeKey(k, v); render(); break;
      case "SetReply": storeKey(m.key, m.value); render(); break;
      case "PrintJSON":
        if(this.primary && (m.type === "Join" || m.type === "Part")) presence(m);
        if(this.primary) onPrint(m);
        if(this.slot != null && this.slot === S.me && (m.type === "CommandResult" || (m.type === "Hint" && !m.found))) onHintReply(m);
        break;
    }
  }
}
/** Without the relay: follow game clients joining and leaving while this page is open. */
function presence(m){
  if(m.slot == null || (m.team ?? S.team) !== S.team) return;
  const game = m.type === "Join" ? !(m.tags || []).some(t => ["Tracker","TextOnly","HintGame"].includes(t))
    : (m.data || []).map(p => p.text || "").join("").includes(" has left the game");
  if(!game) return;
  const sl = ensureSlot(m.slot), now = Date.now() / 1000;
  if(m.type === "Join"){ sl.games++; if(!sl.online) sl.sessions.push([now, null]); sl.online = true; }
  else {
    sl.games = Math.max(0, sl.games - 1);
    if(!sl.games){ const last = sl.sessions[sl.sessions.length - 1]; if(last && last[1] == null) last[1] = now; else if(sl.online == null) sl.sessions.push([null, now]); sl.online = false; }
  }
  render();
}
function storeKey(key, v){
  let m = /^_read_client_status_\d+_(\d+)$/.exec(key);
  if(m){ ensureSlot(+m[1]).status = v || 0; return; }
  m = /^_read_hints_\d+_(\d+)$/.exec(key);
  if(m) ensureSlot(+m[1]).hints = Array.isArray(v) ? v : [];
}
function onPrimaryConnected(){
  $("connectView").hidden = true; $("boardView").hidden = false;
  store.set("slot:" + S.server, S.slotName);
  if(S.password) store.set("pass:" + S.server, S.password);
  const games = [...new Set(Object.values(S.players).map(p => p.game).filter(Boolean))];
  loadPluginsFor(games).then(() => {
    for(const [k, p] of Object.entries(S.players)){
      const slot = +k;
      if(p.type === 2 || conns.has(slot)) continue;
      if(slot === primary.slot){ conns.set(slot, primary); continue; }
      ensureSlot(slot); conns.set(slot, new Conn(p.name, false, plugins[p.game]?.slotData));
    }
    const keys = Object.keys(S.players).filter(k => S.players[k].type !== 2).flatMap(k => [`_read_client_status_${S.team}_${k}`, `_read_hints_${S.team}_${k}`]);
    primary.send([{ cmd:"Get", keys }, { cmd:"SetNotify", keys }]);
    if(primary.slot != null && S.me == null){ const saved = store.get("me:" + S.seed); S.me = saved === "" ? null : saved != null && S.players[saved] ? +saved : primary.slot; }
    readHash(); render();
  });
}
function connectError(code){
  const msg = {
    InvalidSlot: "There's no slot with that name in this multiworld. Names are case-sensitive.",
    InvalidPassword: "That password is wrong.",
    IncompatibleVersion: "The server refused this tracker's version.",
    "bad-url": "That server address isn't valid.",
    offline: "Couldn't reach the Archipelago server. Check that it's running."
  }[code] || `The server refused the connection (${code}).`;
  if(code === "InvalidPassword"){ $("passField").hidden = false; store.set("pass:" + S.server, null); }
  $("cErr").textContent = msg; $("cBtn").disabled = false; $("cBtn").textContent = "Open tracker";
  stop(); $("connectView").hidden = false; $("boardView").hidden = true;
}
function needPassword(){
  stop(); $("passField").hidden = false; $("connectView").hidden = false; $("boardView").hidden = true;
  $("cErr").textContent = "This server has a password. Enter it to continue.";
  $("cBtn").disabled = false; $("cBtn").textContent = "Open tracker"; $("cPass").focus();
}
function start(){
  if(S.cfg.relay) return relayStart();
  stop(); stopped = false;
  Object.assign(S, { players:{}, slots:{}, feed:[], view:null, me:null });
  $("cErr").textContent = ""; $("cBtn").disabled = true; $("cBtn").textContent = "Connecting…";
  primary = new Conn(S.slotName, true, true);
  const p = primary;
  setTimeout(() => { if(primary === p && p.state === "connecting" && !stopped) connectError("offline"); }, 12000);
}
function stop(){ stopped = true; if(relayES){ relayES.close(); relayES = null; } for(const c of conns.values()) c.close(); if(primary) primary.close(); conns.clear(); primary = null; }

/* ================= through the relay ================= */
function relayPost(url, body){
  if(S.demo) return window.APTracker.demoPost(url, body);
  return fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body) })
    .then(r => r.json()).catch(() => ({ ok:false, error:"offline" }));
}
function applyDataPackage(games){
  for(const [g, d] of Object.entries(games || {})){
    const items = {}, locs = {}, itemIds = {};
    for(const [n, i] of Object.entries(d.item_name_to_id || {})){ items[i] = n; itemIds[n] = i; }
    for(const [n, i] of Object.entries(d.location_name_to_id || {})) locs[i] = n;
    S.dp[g] = { items, locs, itemIds };
  }
}
async function relayStart(){
  stop(); stopped = false;
  Object.assign(S, { players:{}, slots:{}, feed:[], view:null, me:null, token:"", relayReady:false });
  $("cErr").textContent = ""; $("cBtn").disabled = true; $("cBtn").textContent = "Connecting…";
  const r = await relayPost("api/login", { slot:S.slotName, password:S.password });
  if(stopped) return;
  if(!r.ok) return r.error === "NeedPassword" ? needPassword() : connectError(r.error || "offline");
  S.token = r.token || "";
  try {
    const dp = await fetch("api/datapackage").then(x => { if(!x.ok) throw new Error(x.status); return x.json(); });
    applyDataPackage(dp.games);
  } catch(e){ return connectError("offline"); }
  openStream();
}
function openStream(){
  if(S.demo) return;
  if(relayES) relayES.close();
  const es = relayES = new EventSource("api/stream?t=" + encodeURIComponent(S.token || ""));
  let fails = 0;
  const on = (ev, fn) => es.addEventListener(ev, e => { fails = 0; try { fn(JSON.parse(e.data)); } catch(err){ console.error("[tracker]", ev, err); } });
  on("snap", applySnap);
  on("pkt", ({ slot, m }) => { const c = conns.get(slot); if(c) c.handle(m); });
  on("state", ({ slot, conn }) => { const c = conns.get(slot); if(c) c.setState(conn); });
  on("feed", m => onPrint(m));
  on("presence", p => { const sl = ensureSlot(p.slot); sl.online = p.online; sl.sessions = p.sessions || []; render(); });
  on("reset", () => { toast("The server started a new seed. Reloading the tracker…"); setTimeout(() => relayStart(), 1500); });
  es.onerror = () => {
    if(es.readyState === 2 && relayES === es){   // the relay turned the stream down (password changed?)
      relayES = null; if(++fails > 2) connectError("offline"); else setTimeout(() => !stopped && openStream(), 3000);
    }
    for(const c of conns.values()) if(c.state === "connected") c.setState("offline");
  };
}
function applySnap(sn){
  // a page left open from before a tracker update reloads itself (once per version) instead of running old code
  if(sn.version && sn.version !== VERSION){
    let done = null; try { done = sessionStorage.getItem("aptracker.reloaded"); } catch(e){}
    if(done !== sn.version){ try { sessionStorage.setItem("aptracker.reloaded", sn.version); } catch(e){} location.reload(); return; }
  }
  if(S.seed && sn.seed && sn.seed !== S.seed){ relayStart(); return; }
  S.seed = sn.seed || S.seed; S.team = sn.team || 0; if(sn.hint_cost != null) S.hintCost = sn.hint_cost;
  for(const [k, x] of Object.entries(sn.slots || {})){
    const slot = +k, info = x.connected.slot_info?.[k] || {};
    let c = conns.get(slot);
    if(!c){ c = new Conn(info.name || `Player ${slot}`, false, true, true); c.slot = slot; conns.set(slot, c); }
    c.handle(Object.assign({ cmd:"Connected" }, x.connected));
    c.handle({ cmd:"ReceivedItems", index:0, items:x.items || [], times:x.times });
    const sl = ensureSlot(slot); if(x.online !== undefined) sl.online = x.online; if(x.sessions) sl.sessions = x.sessions;
    if(x.progress) sl.prog = x.progress.map(p => p.slice());
    storeKey(`_read_client_status_${S.team}_${slot}`, x.status);
    storeKey(`_read_hints_${S.team}_${slot}`, x.hints);
    c.setState(x.conn || "connected");
  }
  if(!S.relayReady && Object.keys(S.players).length){ S.relayReady = true; onRelayReady(); }
  render();
}
function onRelayReady(){
  $("connectView").hidden = true; $("boardView").hidden = false;
  store.set("slot:" + S.server, S.slotName);
  if(S.password) store.set("pass:" + S.server, S.password);
  const games = [...new Set(Object.values(S.players).map(p => p.game).filter(Boolean))];
  loadPluginsFor(games).then(() => {
    const mine = Object.keys(S.players).find(k => S.players[k].name === S.slotName);
    if(S.me == null){ const saved = store.get("me:" + S.seed); S.me = saved === "" ? null : saved != null && S.players[saved] ? +saved : mine != null ? +mine : null; }
    readHash(); render();
  });
}

/* ================= feed + toasts ================= */
function jsonText(m){
  return (m.data || []).map(p => {
    if(p.type === "player_id") return pname(+p.text);
    if(p.type === "item_id") return `<span class="it ${itemClass(p.flags || 0)}">${esc(itemName(slotGame(p.player), +p.text))}</span>`;
    if(p.type === "location_id") return esc(locName(slotGame(p.player), +p.text));
    if(p.type === "hint_status") return "";
    return esc(p.text);
  }).join("");
}
function onPrint(m){
  if(!["ItemSend","Goal","Release","Collect"].includes(m.type)) return;
  S.feed.unshift({ html:jsonText(m), t:Date.now(), goal:m.type === "Goal" });
  if(S.feed.length > 150) S.feed.length = 150;
  renderFeed();
}
function toast(html, ms = 8000){
  const t = document.createElement("div"); t.className = "toast"; t.innerHTML = html; $("toasts").prepend(t);
  while($("toasts").children.length > 3) $("toasts").lastChild.remove();
  setTimeout(() => t.remove(), ms);
}
function flash(slot){ const el = document.querySelector(`.card[data-slot="${slot}"]`); if(el){ el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1400); } }

/* ================= hints ================= */
const hintCost = s => { const { t } = counts(s); return S.hintCost ? Math.max(1, Math.floor(S.hintCost * 0.01 * t)) : 0; };
const openHints = s => (S.slots[s]?.hints || []).filter(h => h.receiving_player === s && !h.found).length;
function hintsForItem(s, name){
  const game = slotGame(s);
  return (S.slots[s]?.hints || []).filter(h => h.receiving_player === s && itemName(game, h.item) === name);
}
function hintLine(h, who){
  const it = `<span class="it ${itemClass(h.item_flags || 0)}">${esc(itemName(slotGame(h.receiving_player), h.item))}</span>`;
  const loc = esc(locName(slotGame(h.finding_player), h.location)) + (h.entrance ? ` <span class="sub">(${esc(h.entrance)})</span>` : "");
  const st = h.found ? HINT_STATUS[40] : (HINT_STATUS[h.status] || HINT_STATUS[0]);
  const lead = who === "recv" ? `${pname(h.receiving_player)} needs ${it} <span class="sub">from</span> ${loc}` :
    `${it} <span class="sub">is at</span> ${loc} <span class="sub">in</span> ${pname(h.finding_player)}'s world`;
  return `<li class="${h.found ? "found" : ""}"><span>${lead}</span>${st[0] ? `<span class="hs ${st[1]}">${st[0]}</span>` : ""}</li>`;
}
function pointsLine(s){
  const pts = S.slots[s]?.points, cost = hintCost(s);
  if(!cost) return `<div class="stats"><span>Hints are <b>free</b> on this server</span></div>`;
  const afford = pts == null ? "" : pts >= cost ? `You can afford <b>${Math.floor(pts / cost)}</b>` : `<span class="sub">${cost - pts} more points needed for the next hint</span>`;
  return `<div class="stats"><span>Your points <b>${pts ?? "?"}</b></span><span>One hint costs <b>${cost}</b></span><span>${afford}</span></div>`;
}

/** Open the hint dialog. kind: "item" with a list of item names, or "loc" with one location id. */
function openHintDialog(s, kind, payload, label){
  const game = slotGame(s), mine = s === S.me, sl = S.slots[s];
  const dlg = $("hintDlg"); let body = "";
  if(kind === "item"){
    const names = [...new Set(payload)].filter(n => itemId(game, n) != null);
    $("hintTitle").textContent = label ? `Hint: ${label}` : "Hint";
    if(!names.length) body = `<p class="empty">None of these items exist in ${esc(game)}.</p>`;
    else {
      const have = new Map(); for(const it of sl.items){ const n = itemName(game, it.item); have.set(n, (have.get(n) || 0) + 1); }
      body = `<ul class="pick">${names.map(n => {
        const known = hintsForItem(s, n);
        return `<li><span>${esc(n)}${have.get(n) ? ` <span class="sub">· received ×${have.get(n)}</span>` : ""}${known.map(h => `<br><span class="sub">Known: ${h.found ? "found" : "at"} ${esc(locName(slotGame(h.finding_player), h.location))} (${esc(slotAlias(h.finding_player))})</span>`).join("")}</span>
          ${mine ? `<button type="button" class="hbtn" data-ask="item" data-id="${itemId(game, n)}">Ask</button>` : ""}</li>`;
      }).join("")}</ul>`;
    }
  } else {
    $("hintTitle").textContent = "What's at this check?";
    body = `<p style="margin:0"><b>${esc(locName(game, payload))}</b></p><p class="sub" style="margin:0">The server tells you which item is there and whose it is.</p>
      ${mine ? `<div><button type="button" class="primary" data-ask="loc" data-id="${payload}">Ask for this hint</button></div>` : ""}`;
  }
  body += mine ? pointsLine(s) : `<p class="sub" style="margin:0">${S.me == null ? "To ask for hints, choose your slot under “I'm playing as”." : `Hints are paid with ${esc(slotAlias(s))}'s own points, so only they can ask from here.`}</p>`;
  body += `<div id="hintReply"></div>`;
  $("hintBody").innerHTML = body;
  if(!dlg.open) dlg.showModal();
}
function askHint(kind, id){
  const c = conns.get(S.me);
  if(!c || c.state !== "connected"){ showReply("Your slot isn't connected right now, so the hint wasn't sent."); return; }
  c.send([{ cmd:"Say", text:(kind === "loc" ? "!hint_location " : "!hint ") + id }]);
  S.pending = Date.now();
  showReply("Asking the server…");
}
function showReply(html){ const r = $("hintReply"); if(r && $("hintDlg").open) r.innerHTML = `<div class="reply">${html}</div>`; }
function onHintReply(m){
  const html = jsonText(m);
  if(S.pending && Date.now() - S.pending < 15000 && $("hintDlg").open){
    const r = $("hintReply"); if(r){ r.innerHTML = (r.textContent.startsWith("Asking") ? "" : r.innerHTML) + `<div class="reply">${html}</div>`; }
  } else if(m.type === "Hint" || S.pending) toast(html);
}

/* ================= context handed to game trackers ================= */
function context(s){
  const game = slotGame(s), sl = S.slots[s];
  const items = sl.items.map(it => ({ id:it.item, name:itemName(game, it.item), flags:it.flags, from:it.player, location:it.location }));
  const tally = new Map(); for(const it of items) tally.set(it.name, (tally.get(it.name) || 0) + 1);
  const count = q => q instanceof RegExp ? [...tally].reduce((a, [n, k]) => a + (q.test(n) ? k : 0), 0) : (tally.get(q) || 0);
  return {
    slot:s, name:slotAlias(s), game, isMine:s === S.me, goal:sl.status === STATUS.GOAL, slotData:sl.slotData || {},
    items, count, has:q => count(q) > 0,
    itemNames:Object.values(S.dp[game]?.items || {}),
    checked:[...sl.checked].map(id => locName(game, id)), missing:[...sl.missing].map(id => locName(game, id)),
    locations:[...[...sl.checked].map(id => ({ id, name:locName(game, id), done:true })), ...[...sl.missing].map(id => ({ id, name:locName(game, id), done:false }))],
    hints:(sl.hints || []).filter(h => h.receiving_player === s).map(h => ({ item:itemName(game, h.item), location:locName(slotGame(h.finding_player), h.location), player:slotAlias(h.finding_player), found:h.found })),
    /** Attribute string that makes an element open the hint dialog for these item names. */
    hint:(names, label) => ` data-hint="${esc(JSON.stringify([].concat(names)))}"${label ? ` data-hint-label="${esc(label)}"` : ""} tabindex="0" role="button"`,
    url:path => (plugins[game]?.base || "") + path,
    esc
  };
}

/* ================= rendering ================= */
let raf = 0;
function render(){ if(!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }
function draw(){
  if($("boardView").hidden) return;
  const all = [...conns.values()], on = all.filter(c => c.state === "connected").length;
  $("connDot").className = "dot " + (all.length && on === all.length ? "on" : on ? "wait" : "off");
  $("connText").textContent = `${on}/${all.length} slots live`;
  $("seedLine").textContent = S.seed ? `Seed ${S.seed}` : "Archipelago multiworld";
  if(S.cfg.title) $("boardTitle").textContent = S.cfg.title;
  const list = slotList();
  const sel = $("meSel"), want = list.length + 1;
  if(sel.options.length !== want){
    sel.innerHTML = '<option value="">Just watching</option>' + [...list].sort((a, b) => slotAlias(a).localeCompare(slotAlias(b))).map(s => `<option value="${s}">${esc(slotAlias(s))}</option>`).join("");
  }
  sel.value = S.me == null ? "" : String(S.me);
  let c = 0, t = 0, g = 0, n = 0;
  for(const s of list){ const x = counts(s); c += x.c; t += x.t; n += S.slots[s].items.length; if(S.slots[s].status === STATUS.GOAL) g++; }
  const p = t ? Math.floor(c / t * 100) : 0;
  $("sChecks").textContent = `${c} / ${t}`; $("sBar").style.width = p + "%"; $("sPct").textContent = p + "%";
  $("sGoals").textContent = `${g} / ${list.length}`; $("sItems").textContent = n;
  $("grid").innerHTML = list.map(cardHtml).join("") || '<p class="empty">Waiting for slot data from the server…</p>';
  if(S.view == null) drawProgress();
  if(S.view != null) drawDetail();
}
function cardHtml(s){
  const sl = S.slots[s], { c, t } = counts(s), p = t ? Math.floor(c / t * 100) : 0, goal = sl.status === STATUS.GOAL;
  const away = awaySpan(s), waiting = away && away.to == null ? away.idx.length : 0;
  const pill = goal ? '<span class="pill goal">Goal!</span>' : sl.conn !== "connected" ? '<span class="pill off">Not tracked</span>'
    : sl.online === true ? '<span class="pill playing">In game</span>'
    : sl.online === false ? `<span class="pill" title="Last in game ${esc(ago(sl.sessions[sl.sessions.length - 1]?.[1]))}">Offline</span>`
    : sl.status >= STATUS.PLAYING ? '<span class="pill playing">Playing</span>' : sl.status >= STATUS.CONNECTED ? '<span class="pill playing">Connected</span>' : '<span class="pill" title="No game client is connected for this slot right now">Offline</span>';
  const P = pluginFor(s); let extra = "";
  if(P && P.card){ try { extra = P.card(context(s)) || ""; } catch(e){ console.error("[tracker] card", e); } }
  return `<button class="card${goal ? " goal" : ""}${s === S.me ? " mine" : ""}" type="button" data-slot="${s}">
    <div class="ctop"><div class="min0"><div class="name c${seriesOf(s)}">${esc(slotAlias(s))}${s === S.me ? ' <span class="sub">(you)</span>' : ""}</div><div class="game">${esc(slotGame(s))}</div></div>${pill}</div>
    <div><div class="checks"><b>${c}<span> / ${t}</span></b><span>${p}%</span></div><div class="bar"><i style="width:${p}%"></i></div></div>
    ${extra ? `<div class="cline">${extra}</div>` : `<div class="sub">${sl.items.length} items received</div>`}
    ${waiting ? `<div class="away-note">${waiting} new item${waiting === 1 ? "" : "s"} while away</div>` : ""}
  </button>`;
}
function renderFeed(){
  $("feed").innerHTML = S.feed.length ? S.feed.map(f => `<li class="${f.goal ? "goal" : ""}">${f.html}<time>${new Date(f.t).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}</time></li>`).join("") : '<li class="empty">Items appear here the moment someone finds them.</li>';
}

/* ---------- slot detail ---------- */
function openSlot(s){ S.view = s; S.tab = null; S.histCap = 200; S.filter = ""; S.show = "missing"; S.hintQ = ""; S.itemQ = ""; $("listView").hidden = true; $("progView").hidden = true; $("detailView").hidden = false; setHash("slot-" + s); drawDetail(); window.scrollTo(0, 0); }
function closeSlot(){ S.view = null; $("listView").hidden = false; $("progView").hidden = false; $("detailView").hidden = true; setHash(""); render(); }
function setHash(h){ try { history.replaceState(null, "", h ? "#" + h : location.pathname + location.search); } catch(e){} }
function readHash(){ const m = /^#slot-(\d+)$/.exec(location.hash); if(m && S.players[m[1]]) openSlot(+m[1]); }

function drawDetail(){
  const s = S.view, sl = S.slots[s]; if(!sl) return;
  const game = slotGame(s), { c, t } = counts(s), p = t ? Math.floor(c / t * 100) : 0, P = pluginFor(s);
  $("dName").textContent = slotAlias(s) + (s === S.me ? " (you)" : ""); $("dName").className = "dname c" + seriesOf(s);
  $("dGame").textContent = game + (sl.status === STATUS.GOAL ? " · Goal complete" : "");
  $("dChecks").innerHTML = `${c}<span> / ${t}</span>`; $("dPct").textContent = p + "%"; $("dBar").style.width = p + "%";
  $("dNotice").hidden = !broken[game];
  if(broken[game]) $("dNotice").textContent = `The ${game} tracker couldn't load (${broken[game]}), so this slot uses the standard view.`;
  const open = openHints(s), away = awaySpan(s), fresh = away && away.to == null ? away.idx.length : 0;
  const tabs = (P && P.tabs ? P.tabs.map(x => [x.id, x.label, x]) : [])
    .concat([["items", P && P.tabs ? "Items" : "Overview"], ["checks", P?.checksLabel || "Checks"], ["hints", `Hints${open ? ` (${open})` : ""}`], ["history", `History${fresh ? ` (${fresh} new)` : ""}`]]);
  if(!S.tab || !tabs.some(x => x[0] === S.tab)) S.tab = tabs[0][0];
  $("dTabs").innerHTML = tabs.map(([k, l]) => `<button role="tab" type="button" data-tab="${esc(k)}" aria-selected="${S.tab === k}">${esc(l)}</button>`).join("");
  const ae = document.activeElement, keep = ae && ae.tagName === "INPUT" && ae.id ? ae.id : null;
  const panelY = window.scrollY;
  let html = "";
  const custom = tabs.find(x => x[0] === S.tab && x[2]);
  try {
    if(custom) html = custom[2].render(context(s));
    else if(S.tab === "checks") html = checksView(s, P);
    else if(S.tab === "hints") html = hintsView(s);
    else if(S.tab === "history") html = historyView(s);
    else html = itemsView(s);
  } catch(e){ console.error("[tracker]", e); html = `<p class="err">This view failed to draw: ${esc(e.message)}</p>` + itemsView(s); }
  $("dPanel").innerHTML = html;
  if(keep && $(keep)){ const el = $(keep); el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch(e){} }
  if(Math.abs(window.scrollY - panelY) > 2) window.scrollTo(0, panelY);
}

/* ---------- generic: items ---------- */
function itemsView(s){
  const sl = S.slots[s], game = slotGame(s);
  const groups = [["Progression", "it-prog", f => f & 1], ["Useful", "it-useful", f => !(f & 1) && f & 2], ["Traps", "it-trap", f => f & 4 && !(f & 3)], ["Other items", "", f => !(f & 7)]];
  const ctx = context(s);
  let out = `<div class="group"><div class="stats"><span>Items received <b>${sl.items.length}</b></span><span>Checks done <b>${sl.checked.size}</b> of <b>${sl.checked.size + sl.missing.size}</b></span><span>Open hints <b>${openHints(s)}</b></span></div>
    ${s === S.me ? '<p class="sub" style="margin:0">Click any item to find out where (more of) it is.</p>' : ""}</div>`;
  for(const [label, cls, test] of groups){
    const tally = new Map(); for(const it of sl.items) if(test(it.flags)){ const n = itemName(game, it.item); tally.set(n, (tally.get(n) || 0) + 1); }
    if(!tally.size) continue;
    out += `<div class="group"><div class="ghead"><h3>${label}</h3><span class="sub">${[...tally.values()].reduce((a, b) => a + b, 0)}</span></div>
      <div class="tiles">${[...tally].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric:true })).map(([n, k]) => `<div class="tile ${cls}"${ctx.hint(n)}><span>${esc(n)}</span>${k > 1 ? `<small>×${k}</small>` : ""}</div>`).join("")}</div></div>`;
  }
  if(!sl.items.length) out += '<p class="empty">Nothing received yet.</p>';
  // every item the game has: received ones lit, the rest dimmed, all clickable for hints
  const have = new Map(); for(const it of sl.items){ const n = itemName(game, it.item); have.set(n, (have.get(n) || 0) + 1); }
  const words = S.itemQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const every = Object.values(S.dp[game]?.items || {}).filter(n => words.every(w => n.toLowerCase().includes(w)))
    .sort((a, b) => (have.has(b) - have.has(a)) || a.localeCompare(b, undefined, { numeric:true }));
  const cap = words.length ? 120 : 60;
  out += `<div class="group"><div class="ghead"><h3>Everything in ${esc(game)}</h3><span class="sub">${have.size} of ${Object.keys(S.dp[game]?.items || {}).length} kinds received</span></div>
    <input id="itemSearch" type="search" placeholder="Search items" value="${esc(S.itemQ)}" aria-label="Search all items" style="max-width:320px">
    <div class="tiles">${every.slice(0, cap).map(n => `<div class="tile${have.has(n) ? "" : " off"}"${ctx.hint(n)}><span>${esc(n)}</span>${have.get(n) > 1 ? `<small>×${have.get(n)}</small>` : ""}</div>`).join("")}</div>
    ${every.length > cap ? `<span class="sub">${every.length - cap} more. Search to narrow it down.</span>` : ""}${!every.length ? '<p class="empty">No item matches.</p>' : ""}</div>`;
  if(sl.items.length) out += `<div class="group"><h3>Most recent</h3><ul class="hlist">${sl.items.slice(-10).reverse().map(it => `<li><span><span class="it ${itemClass(it.flags)}">${esc(itemName(game, it.item))}</span> <span class="sub">from ${esc(locName(slotGame(it.player), it.location))} · ${esc(slotAlias(it.player))}</span></span></li>`).join("")}</ul></div>`;
  return out;
}

/* ---------- generic: checks ---------- */
function checksView(s, P){
  const sl = S.slots[s], game = slotGame(s), mine = s === S.me, ctx = context(s);
  const grp = P && P.locationGroup ? n => { try { return P.locationGroup(n, ctx) || "Other"; } catch(e){ return "Other"; } } : () => "Locations";
  const order = P && P.groupOrder ? (Array.isArray(P.groupOrder) ? g => { const i = P.groupOrder.indexOf(g); return i < 0 ? 999 : i; } : P.groupOrder) : () => 0;
  const rows = [...sl.checked].map(id => ({ id, n:locName(game, id), d:true })).concat([...sl.missing].map(id => ({ id, n:locName(game, id), d:false })));
  const f = S.filter.trim().toLowerCase();
  const visible = r => (S.show === "all" || (S.show === "missing" ? !r.d : r.d)) && (!f || r.n.toLowerCase().includes(f));
  const groups = new Map();
  for(const r of rows){ const g = grp(r.n); if(!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
  const shownCount = rows.filter(visible).length;
  let out = `<div class="filters"><input id="locSearch" type="search" placeholder="Search checks" value="${esc(S.filter)}" aria-label="Search checks">
    <div class="seg" role="group" aria-label="Show">${[["missing","Left"],["checked","Done"],["all","All"]].map(([k, l]) => `<button type="button" data-show="${k}" aria-pressed="${S.show === k}">${l}</button>`).join("")}</div>
    <span class="sub">${shownCount} shown${mine ? " · Hint tells you what's at a check" : ""}</span></div>`;
  for(const g of [...groups.keys()].sort((a, b) => order(a) - order(b) || a.localeCompare(b))){
    const all = groups.get(g), done = all.filter(r => r.d).length, tot = all.length, pc = tot ? Math.floor(done / tot * 100) : 0;
    const shown = all.filter(visible).sort((a, b) => a.d - b.d || a.n.localeCompare(b.n, undefined, { numeric:true }));
    if(!shown.length && groups.size === 1) continue;
    out += `<div class="group"><div class="ghead"><h3>${esc(g)}</h3><span class="sub">${done} / ${tot}${done === tot ? " · complete" : ""}</span></div><div class="bar"><i style="width:${pc}%"></i></div>
      ${shown.length ? `<ul class="locs">${shown.map(r => `<li class="${r.d ? "done" : ""}"><span>${esc(r.n)}</span>${!r.d && mine ? `<button type="button" class="hbtn" data-loc="${r.id}">Hint</button>` : ""}</li>`).join("")}</ul>` : ""}</div>`;
  }
  if(!shownCount) out += '<p class="empty">No checks match.</p>';
  return out;
}

/* ---------- progress over time ---------- */
// Each player's checks as a share of their world, so big and small worlds compare fairly.
// Colors follow the slot (its place among all players), never the ranking.
const SERIES = 8;
const seriesOf = s => { const all = Object.keys(S.players).map(Number).filter(k => S.players[k].type !== 2).sort((a, b) => a - b); const i = all.indexOf(s); return i >= 0 && i < SERIES ? i + 1 : 0; };
const progAt = (pts, t) => { let v = null; for(const [pt, n] of pts){ if(pt > t) break; v = n; } return v; };
function pace(s){
  const sl = S.slots[s], pts = sl.prog, now = Date.now() / 1000;
  if(!pts.length) return { hour:null, rate:null };
  const at = t => progAt(pts, t) ?? pts[0][1];
  const hour = sl.checked.size - at(now - 3600);
  let gain = 0, secs = 0;
  for(const [a, b] of sl.sessions || []){
    if(a == null) continue;
    const end = b ?? now, from = Math.max(a, pts[0][0]);
    if(end <= from) continue;
    gain += at(end) - at(from); secs += end - from;
  }
  if(!secs){ secs = now - pts[0][0]; gain = sl.checked.size - pts[0][1]; }   // no join/leave seen: the whole recorded span
  return { hour, rate:secs >= 900 ? gain / (secs / 3600) : null };
}
function niceStep(span){
  for(const m of [5, 10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080]) if(span / (m * 60) <= 6) return m * 60;
  return 20160 * 60;
}
function drawProgress(){
  const box = $("progBody"); if(!box || $("progView").hidden) return;
  document.querySelectorAll("#progView [data-range]").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.range === S.range)));
  const list = slotList().filter(s => S.slots[s].prog.length), now = Date.now() / 1000;
  if(!list.length){ box.innerHTML = `<p class="empty">The chart fills in as checks come in. ${S.cfg.relay ? "" : "Without the relay it only covers the time this page has been open."}</p>`; return; }
  const first = Math.min(...list.map(s => S.slots[s].prog[0][0]));
  const t0 = S.range ? Math.max(first, now - S.range * 3600) : first, t1 = now;
  const pctAt = (s, t) => { const v = progAt(S.slots[s].prog, t); const { t:tot } = counts(s); return v == null || !tot ? null : v / tot * 100; };
  let top = 0; for(const s of list){ const { c, t } = counts(s); top = Math.max(top, t ? c / t * 100 : 0); }
  const yMax = top > 50 ? 100 : top > 25 ? 50 : top > 10 ? 25 : 10, yStep = yMax / 5;
  const W = Math.max(280, box.clientWidth - 32), H = W < 520 ? 200 : 260, L = 40, R = 14, T = 10, B = 26;
  const x = t => L + (t - t0) / Math.max(1, t1 - t0) * (W - L - R), y = p => T + (1 - p / yMax) * (H - T - B);
  const step = niceStep(t1 - t0), longSpan = t1 - t0 > 36 * 3600;
  let grid = "";
  for(let p = 0; p <= yMax + 1e-9; p += yStep) grid += `<line class="pg-grid" x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}"/><text class="pg-ax" x="${L - 6}" y="${y(p) + 4}" text-anchor="end">${Math.round(p)}%</text>`;
  const off = new Date().getTimezoneOffset() * 60;
  for(let t = Math.ceil((t0 - off) / step) * step + off; t <= t1; t += step){
    const d = new Date(t * 1000), lbl = longSpan && step >= 86400 ? d.toLocaleDateString([], { weekday:"short", day:"numeric" }) : d.getHours() === 0 && d.getMinutes() === 0 ? d.toLocaleDateString([], { weekday:"short" }) : clock(t);
    grid += `<text class="pg-ax" x="${x(t)}" y="${H - 6}" text-anchor="middle">${esc(lbl)}</text>`;
  }
  let lines = "", dots = "";
  for(const s of list){
    const k = seriesOf(s), pts = S.slots[s].prog, { t:tot } = counts(s); if(!tot) continue;
    const start = progAt(pts, t0);
    let d = start != null ? `M${x(t0)},${y(start / tot * 100)}` : "";
    for(const [t, n] of pts){ if(t <= t0) continue; const yy = y(n / tot * 100); d += d ? `H${x(t)}V${yy}` : `M${x(t)},${yy}`; }
    if(!d) continue;
    const endY = y(S.slots[s].checked.size / tot * 100); d += `H${x(t1)}V${endY}`;
    const dim = S.focus != null && S.focus !== s ? " dim" : "";
    lines += `<path class="pg-line s${k}${dim}" d="${d}"/>`;
    dots += `<circle class="pg-dot s${k}${dim}" cx="${x(t1)}" cy="${endY}" r="4"/>`;
  }
  const rows = list.slice().sort((a, b) => seriesOf(a) - seriesOf(b) || a - b).map(s => {
    const { c, t } = counts(s), p = pace(s), k = seriesOf(s);
    return `<tr class="${S.focus != null && S.focus !== s ? "dim" : ""}"><th scope="row"><button type="button" class="pg-key" data-focus="${s}" aria-pressed="${S.focus === s}"><i class="sw s${k}"></i>${esc(slotAlias(s))}</button></th>
      <td>${t ? Math.floor(c / t * 100) : 0}%</td><td class="pg-n">${c} / ${t}</td><td>${p.hour == null ? "–" : (p.hour > 0 ? "+" : "") + p.hour}</td><td>${p.rate == null ? "–" : p.rate < 10 ? p.rate.toFixed(1) : Math.round(p.rate)}</td></tr>`;
  }).join("");
  box.innerHTML = `<div class="pg-plot" id="pgPlot"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Each player's share of checks done over time. The table below has the same numbers.">
      ${grid}<g>${lines}</g><g>${dots}</g><line class="pg-cross" id="pgCross" x1="0" x2="0" y1="${T}" y2="${H - B}" hidden/></svg><div class="pg-tip" id="pgTip" hidden></div></div>
    <div class="pg-tablewrap"><table class="pg-table"><thead><tr><th scope="col">Player</th><th scope="col">Done</th><th scope="col" class="pg-n">Checks</th><th scope="col">Last hour</th><th scope="col" title="Checks per hour while their game was connected">Per hour played</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="sub" style="margin:0">Click a player to pick out their line. ${S.cfg.relay ? "Per hour played counts only the time their game was connected." : "Without the relay this covers only the time this page has been open."}</p>`;
  S.pv = { t0, t1, L, R, W, list };
  if(S.hoverX != null) hoverProgress(S.hoverX);
}
function hoverProgress(px){
  const v = S.pv, tip = $("pgTip"), cross = $("pgCross"); if(!v || !tip) return;
  if(px == null || px < v.L || px > v.W - v.R){ tip.hidden = true; cross.setAttribute("hidden", ""); return; }
  const t = v.t0 + (px - v.L) / (v.W - v.L - v.R) * (v.t1 - v.t0);
  cross.removeAttribute("hidden"); cross.setAttribute("x1", px); cross.setAttribute("x2", px);
  const rows = v.list.map(s => { const n = progAt(S.slots[s].prog, t), { t:tot } = counts(s); return { s, n, p:n == null || !tot ? null : n / tot * 100 }; })
    .filter(r => r.n != null).sort((a, b) => b.p - a.p);
  tip.innerHTML = `<b>${esc(when(t))}</b>` + (rows.length ? rows.map(r => `<div><i class="sw s${seriesOf(r.s)}"></i><span>${esc(slotAlias(r.s))}</span><b>${Math.floor(r.p)}%</b><span class="sub">${r.n}</span></div>`).join("") : '<div class="sub">No checks recorded yet</div>');
  tip.hidden = false;
  const plot = $("pgPlot"), w = tip.offsetWidth, room = plot.clientWidth;
  tip.style.left = (px + 14 + w > room ? Math.max(0, px - 14 - w) : px + 14) + "px";
}
document.addEventListener("pointermove", e => {
  const svg = e.target.closest && e.target.closest("#pgPlot svg");
  if(!svg){ if(S.hoverX != null){ S.hoverX = null; hoverProgress(null); } return; }
  const r = svg.getBoundingClientRect(); S.hoverX = (e.clientX - r.left) * (S.pv.W / r.width); hoverProgress(S.hoverX);
});
let progResize = 0;
window.addEventListener("resize", () => { clearTimeout(progResize); progResize = setTimeout(drawProgress, 150); });
setInterval(() => { if(S.view == null && !$("boardView").hidden) drawProgress(); }, 60000);   // the lines run on to "now"

/* ---------- unlock history ---------- */
const clock = t => new Date(t * 1000).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
function dayLabel(t){
  const d = new Date(t * 1000), today = new Date(), y = new Date(); y.setDate(y.getDate() - 1);
  return d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString([], { weekday:"long", day:"numeric", month:"short" });
}
const when = t => dayLabel(t) === "Today" ? clock(t) : `${dayLabel(t)} ${clock(t)}`;
function ago(t){
  if(t == null) return "a while ago";
  const m = Math.round((Date.now() / 1000 - t) / 60);
  if(m < 1) return "just now"; if(m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if(h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24); return d === 1 ? "yesterday" : `${d} days ago`;
}
/** The slot's most recent time away from the game: from when it left to when it came back (to = null: still away),
    and which items arrived meanwhile. Needs to know when the game was connected, which the relay records. */
function awaySpan(s){
  const sl = S.slots[s], ss = sl?.sessions || []; let from = null, to = null;
  if(sl?.online === false && ss.length) from = ss[ss.length - 1][1];
  else if(sl?.online === true && ss.length >= 2){ from = ss[ss.length - 2][1]; to = ss[ss.length - 1][0]; }
  if(from == null) return null;
  const idx = []; sl.times.forEach((t, i) => { if(t != null && t > from && (to == null || t <= to)) idx.push(i); });
  return { from, to, idx };
}
function histRow(s, i){
  const sl = S.slots[s], it = sl.items[i], t = sl.times[i];
  const src = it.location < 0 || !it.player ? (it.location === -2 ? "starting inventory" : "given by the server")
    : it.player === s ? `found it · ${esc(locName(slotGame(s), it.location))}` : `from ${pname(it.player)} · ${esc(locName(slotGame(it.player), it.location))}`;
  return `<li><time>${t != null ? clock(t) : ""}</time><span><span class="it ${itemClass(it.flags)}">${esc(itemName(slotGame(s), it.item))}</span> <span class="sub">${src}</span></span></li>`;
}
function historyView(s){
  const sl = S.slots[s], who = esc(slotAlias(s)), ss = sl.sessions || [], last = ss[ss.length - 1];
  const away = awaySpan(s);
  const pres = sl.online === true ? `In game now${last && last[0] ? ` <span class="sub">since ${when(last[0])}</span>` : ""}`
    : sl.online === false ? `Last in game <b>${ago(last?.[1])}</b>` : "";
  let out = `<div class="group"><div class="stats"><span>Items received <b>${sl.items.length}</b></span>${pres ? `<span>${pres}</span>` : ""}</div>
    ${sl.online == null ? `<p class="sub" style="margin:0">${S.cfg.relay ? `The tracker hasn't seen ${who}'s game connect or leave yet, so it can't tell what came in while they were away. That starts once they next join or leave.` : "This page only knows what arrives while it's open. With the relay on the server, it remembers when every item arrived and when each player was away."}</p>` : ""}</div>`;
  if(away && away.idx.length){
    const n = away.idx.length, prog = away.idx.filter(i => sl.items[i].flags & 1);
    const span = away.to == null ? `since ${when(away.from)}` : `${when(away.from)} to ${dayLabel(away.from) === dayLabel(away.to) ? clock(away.to) : when(away.to)}`;
    const tally = new Map(); for(const i of prog){ const nm = itemName(slotGame(s), sl.items[i].item); tally.set(nm, (tally.get(nm) || 0) + 1); }
    out += `<div class="group away"><div class="ghead"><h3>${away.to == null ? `New while ${who} is away` : `While ${who} was away`}</h3><span class="sub">${n} item${n === 1 ? "" : "s"} · ${span}</span></div>
      ${tally.size ? `<div class="sub">Progression</div><div class="tiles">${[...tally].map(([nm, k]) => `<div class="tile it-prog"><span>${esc(nm)}</span>${k > 1 ? `<small>×${k}</small>` : ""}</div>`).join("")}</div>` : ""}
      <ul class="hlist hist">${away.idx.slice(-100).reverse().map(i => histRow(s, i)).join("")}</ul>
      ${n > 100 ? `<span class="sub">${n - 100} earlier ones are in the full list below.</span>` : ""}</div>`;
  }
  const all = sl.items.map((_, i) => i).filter(i => !S.histProg || sl.items[i].flags & 1).reverse();
  const timed = all.filter(i => sl.times[i] != null), untimed = all.filter(i => sl.times[i] == null);
  const shown = timed.slice(0, S.histCap), rest = Math.max(0, S.histCap - shown.length);
  let body = "", day = null;
  for(const i of shown){
    const d = dayLabel(sl.times[i]);
    if(d !== day){ if(day != null) body += "</ul>"; body += `<h4 class="hday">${esc(d)}</h4><ul class="hlist hist">`; day = d; }
    body += histRow(s, i);
  }
  if(day != null) body += "</ul>";
  if(untimed.length && rest){
    body += `<h4 class="hday">${timed.length ? "Earlier, before the tracker kept times" : "Received so far"}</h4><ul class="hlist hist">${untimed.slice(0, rest).map(i => histRow(s, i)).join("")}</ul>`;
  }
  const hidden = all.length - shown.length - (rest ? Math.min(untimed.length, rest) : 0);
  out += `<div class="group"><div class="ghead"><h3>Everything ${who} received</h3>
      <div class="seg" role="group" aria-label="Show">${[["all", "All"], ["prog", "Progression"]].map(([k, l]) => `<button type="button" data-hist="${k}" aria-pressed="${(k === "prog") === S.histProg}">${l}</button>`).join("")}</div></div>
    ${all.length ? body : `<p class="empty">${S.histProg ? "No progression items yet." : "Nothing received yet."}</p>`}
    ${hidden > 0 ? `<div><button type="button" id="histMore">Show ${Math.min(400, hidden)} more</button> <span class="sub">${hidden} older not shown</span></div>` : ""}</div>`;
  return out;
}

/* ---------- generic: hints ---------- */
function hintsView(s){
  const sl = S.slots[s], game = slotGame(s), mine = s === S.me, hs = sl.hints || [];
  const sortH = a => a.slice().sort((x, y) => x.found - y.found || (y.status || 0) - (x.status || 0));
  const want = sortH(hs.filter(h => h.receiving_player === s)), owe = sortH(hs.filter(h => h.finding_player === s && h.receiving_player !== s));
  let out = "";
  if(mine){
    const words = S.hintQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const names = Object.values(S.dp[game]?.items || {});
    const hits = words.length ? names.filter(n => words.every(w => n.toLowerCase().includes(w))).sort((a, b) => a.localeCompare(b, undefined, { numeric:true })).slice(0, 50) : [];
    out += `<div class="group"><h3>Ask for a hint</h3>${pointsLine(s)}
      <input id="hintSearch" type="search" placeholder="Search any item in ${esc(game)}" value="${esc(S.hintQ)}" aria-label="Search items to hint">
      ${words.length ? (hits.length ? `<ul class="pick">${hits.map(n => `<li><span>${esc(n)}</span><button type="button" class="hbtn" data-hint="${esc(JSON.stringify([n]))}">Hint</button></li>`).join("")}</ul>` : '<p class="empty">No item in this game matches that.</p>') : '<p class="sub" style="margin:0">Type part of an item name, or click things in the other tabs.</p>'}</div>`;
  } else if(S.me == null){
    out += `<p class="sub" style="margin:0">To ask for hints, choose your slot under <b>I'm playing as</b> at the top.</p>`;
  }
  const list = (arr, who, empty) => arr.length ? `<ul class="hlist">${arr.map(h => hintLine(h, who)).join("")}</ul>` : `<p class="empty">${empty}</p>`;
  out += `<div class="group"><div class="ghead"><h3>What ${esc(slotAlias(s))} is looking for</h3><span class="sub">${want.filter(h => !h.found).length} open</span></div>${list(want, "find", "No hints yet.")}</div>
    <div class="group"><div class="ghead"><h3>What others need from ${esc(slotAlias(s))}'s world</h3><span class="sub">${owe.filter(h => !h.found).length} open</span></div>${list(owe, "recv", "Nobody has a hint pointing here yet.")}</div>`;
  return out;
}

/* ================= events ================= */
document.addEventListener("click", e => {
  const dlgAsk = e.target.closest("[data-ask]");
  if(dlgAsk){ e.preventDefault(); askHint(dlgAsk.dataset.ask, +dlgAsk.dataset.id); return; }
  const h = e.target.closest("[data-hint]");
  if(h && S.view != null){ e.preventDefault(); let names = []; try { names = JSON.parse(h.dataset.hint); } catch(_){} openHintDialog(S.view, "item", names, h.dataset.hintLabel); return; }
  const b = e.target.closest("button"); if(!b) return;
  if(b.dataset.loc){ openHintDialog(S.view, "loc", +b.dataset.loc); return; }
  if(b.dataset.slot != null){ openSlot(+b.dataset.slot); return; }
  if(b.dataset.tab){ S.tab = b.dataset.tab; drawDetail(); return; }
  if(b.dataset.show){ S.show = b.dataset.show; drawDetail(); return; }
  if(b.dataset.range != null){ S.range = +b.dataset.range; S.hoverX = null; drawProgress(); return; }
  if(b.dataset.focus != null){ S.focus = S.focus === +b.dataset.focus ? null : +b.dataset.focus; drawProgress(); return; }
  if(b.dataset.hist){ S.histProg = b.dataset.hist === "prog"; S.histCap = 200; drawDetail(); return; }
  if(b.id === "histMore"){ S.histCap += 400; drawDetail(); return; }
  if(b.id === "backBtn") return closeSlot();
  if(b.id === "leaveBtn"){ stop(); $("boardView").hidden = true; $("connectView").hidden = false; $("cBtn").disabled = false; $("cBtn").textContent = "Open tracker"; $("cSlot").focus(); }
});
document.addEventListener("keydown", e => {
  const h = e.target.closest && e.target.closest("[data-hint]");
  if(h && h.tagName !== "BUTTON" && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); h.click(); }
});
document.addEventListener("input", e => {
  if(e.target.id === "locSearch"){ S.filter = e.target.value; drawDetail(); }
  if(e.target.id === "hintSearch"){ S.hintQ = e.target.value; drawDetail(); }
  if(e.target.id === "itemSearch"){ S.itemQ = e.target.value; drawDetail(); }
});
$("meSel").addEventListener("change", e => { S.me = e.target.value === "" ? null : +e.target.value; store.set("me:" + S.seed, e.target.value); render(); });
$("hintDlg").addEventListener("close", () => { S.pending = null; });
window.addEventListener("hashchange", () => { if(!location.hash) closeSlot(); else readHash(); });
$("connectForm").addEventListener("submit", e => {
  e.preventDefault();
  if(!$("serverField").hidden){ S.server = $("cServer").value.trim(); store.set("server", S.server); }
  S.slotName = $("cSlot").value.trim(); S.password = $("cPass").value;
  if(!S.server){ $("serverField").hidden = false; $("cErr").textContent = "Enter the server address."; return; }
  start();
});

/* ================= boot ================= */
(async () => {
  renderFeed();
  const q = new URLSearchParams(location.search);
  try { const r = await fetch("config.json", { cache:"no-store" }); if(r.ok) S.cfg = await r.json(); } catch(e){}
  if(q.get("demo") != null || S.cfg.demo){   // demo: made-up players from demo/, no Archipelago server needed
    Object.assign(S, { demo:true, server:"demo", slotName:"" }); S.cfg.relay = true; stopped = false;
    window.APTracker.internal = { S, conns, applySnap, applyDataPackage, onPrint, render, toast, slotAlias, itemName, locName, ensureSlot };
    $("cBtn").disabled = true; $("cBtn").textContent = "Loading the demo…";
    return loadScript("demo/demo.js").catch(() => { $("cErr").textContent = "The demo files (demo/) aren't on this server."; });
  }
  if(q.get("server") || q.get("direct") != null) S.cfg.relay = false;   // a different server, or ?direct: connect from the page
  if(S.cfg.title) document.title = S.cfg.title;
  S.server = q.get("server") || (S.cfg.port && location.hostname ? `${location.hostname}:${S.cfg.port}` : "") || store.get("server") || "";
  if(!S.cfg.port || q.get("server")){ $("serverField").hidden = false; $("cServer").value = S.server; }
  $("cServer").addEventListener("change", () => store.set("server", $("cServer").value.trim()));
  const slot = q.get("slot") || store.get("slot:" + S.server) || S.cfg.slot || "";
  $("cSlot").value = slot;
  const pass = store.get("pass:" + S.server); if(pass){ $("cPass").value = pass; }
  loadGameIndex();
  if(S.server && slot){ S.slotName = slot; S.password = pass || ""; start(); }
})();
})();
