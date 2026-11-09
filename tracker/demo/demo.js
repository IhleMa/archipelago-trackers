/* Tracker demo: plays a made-up multiworld so the trackers can be viewed without an Archipelago server.
   Open the tracker with ?demo. Every installed game tracker that has a demo.json in its folder adds one
   made-up player: that file holds the game's names (data package), slot data, its checks in a sensible
   order and the items that belong to it. The items of all players are shuffled across everyone's checks,
   so it plays like a real multiworld. Each player starts part way through, new checks keep coming every
   few seconds, and !hint / !hint_location are answered like the server would. Nothing talks to a server. */
"use strict";
(async () => {
const T = window.APTracker.internal, S = T.S;
const base = new URL(".", document.currentScript.src).href;
const gamesBase = new URL("../games/", base).href;
const link = document.createElement("link"); link.rel = "stylesheet"; link.href = base + "demo.css"; document.head.appendChild(link);

/* ---------- seeded randomness, so every visit starts from the same picture ---------- */
let seed = 20261104;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const shuffle = a => { for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- one player per installed game tracker with demo data ---------- */
let index = [];
for(const url of [new URL("../cgi-bin/games", base).href, gamesBase + "index.json"]){
  try { const r = await fetch(url, { cache:"no-store" }); if(r.ok){ index = await r.json(); break; } } catch(e){}
}
const found = (await Promise.all(index.filter(e => e && e.dir).sort((a, b) => a.dir.localeCompare(b.dir))
  .map(e => fetch(gamesBase + encodeURIComponent(e.dir) + "/demo.json").then(r => r.ok ? r.json() : null).catch(() => null))))
  .filter(x => x && x.game && Array.isArray(x.locations) && x.locations.length && x.datapackage);
const without = index.filter(e => e && e.dir).length - found.length;
if(!found.length) throw new Error("none of the installed game trackers has demo data (demo.json)");
const D = { seed:"DEMO-" + found.map(x => x.game.slice(0, 2)).join("").toUpperCase().slice(0, 12), hint_cost:10, slots:{}, datapackage:{} };
const used = new Set();
found.forEach((x, i) => {
  let name = x.name || x.game; for(let k = 2; used.has(name); k++) name = `${x.name || x.game} ${k}`; used.add(name);
  D.slots[i + 1] = { name, game:x.game, slot_data:x.slot_data || {}, pre:x.pre || [], locations:x.locations, spheres:x.spheres || null };
  D.datapackage[x.game] = x.datapackage;
});
T.applyDataPackage(D.datapackage);
const slots = Object.keys(D.slots).map(Number);

// the order things get found: each world in its own order (the file lists its checks roughly as a game reaches them),
// interleaved across worlds in proportion to what each has left
const queue = [], next = Object.fromEntries(slots.map(s => [s, 0]));
for(;;){
  let left = 0; for(const s of slots) left += D.slots[s].locations.length - next[s];
  if(!left) break;
  let r = rnd() * left;
  for(const s of slots){ const k = D.slots[s].locations.length - next[s]; if(r < k){ queue.push([s, D.slots[s].locations[next[s]++]]); break; } r -= k; }
}

// everyone's items over everyone's checks. Like a real seed's logic, progression comes early: those items go into
// checks in the first 55% of the order, the rest fill in around them. Filler pads the pool if it's short.
const prog = [], rest = [];
slots.forEach((s, i) => { for(const [item, flags] of found[i].pool || []) ((flags & 1) ? prog : rest).push([item, s, flags || 0]); });
shuffle(prog); shuffle(rest);
while(prog.length + rest.length > queue.length) (rest.length ? rest : prog).pop();
while(prog.length + rest.length < queue.length) rest.push((rest.length ? rest : prog)[Math.floor(rnd() * (rest.length || prog.length))].slice());
const placed = new Array(queue.length).fill(null), early = Math.max(prog.length, Math.floor(queue.length * 0.55));
const pick = shuffle([...Array(early).keys()]).slice(0, prog.length);
pick.forEach((q, i) => placed[q] = prog[i]);
for(let q = 0, r = 0; q < placed.length; q++) if(!placed[q]) placed[q] = rest[r++];
const W = {};   // slot -> {info:Map(loc -> [item, receiver, flags]), checked:Set, items:[], hints:[], points, spent, status, total}
for(const s of slots) W[s] = { info:new Map(), checked:new Set(), items:[], hints:[], spent:0, status:20, total:D.slots[s].locations.length };
queue.forEach(([s, l], q) => W[s].info.set(l, placed[q]));
for(const s of slots){ W[s].times = []; W[s].prog = []; for(const it of D.slots[s].pre){ W[s].items.push({ item:it, location:-2, player:0, flags:0 }); W[s].times.push(-1); } }
let order = 0;   // checks found before the page opened get times spread over the last six hours
const cost = s => S.hintCost ? Math.max(1, Math.floor(S.hintCost * 0.01 * W[s].total)) : 0;
const points = s => W[s].checked.size + 2 * cost(s) - W[s].spent;   // a starting bonus so the demo can afford a few hints

// how far along everyone is when the page opens; the smallest world has already reached its goal
const smallest = slots.reduce((a, b) => W[b].total < W[a].total ? b : a);
const starts = [0.42, 0.27, 0.61, 0.48, 0.55, 0.71, 0.35, 0.5];
const target = {}; slots.forEach((s, i) => target[s] = s === smallest ? 1 : starts[i % starts.length]);

/* ---------- printing like the server ---------- */
const P = s => ({ type:"player_id", text:String(s) });
const I = (item, recv, flags) => ({ type:"item_id", text:String(item), player:recv, flags });
const L = (loc, s) => ({ type:"location_id", text:String(loc), player:s });
const txt = t => ({ text:t });
const sendLine = (s, l, [item, recv, flags]) => ({ cmd:"PrintJSON", type:"ItemSend", data: recv === s
  ? [P(s), txt(" found their "), I(item, recv, flags), txt(" ("), L(l, s), txt(")")]
  : [P(s), txt(" sent "), I(item, recv, flags), txt(" to "), P(recv), txt(" ("), L(l, s), txt(")")] });
const hintLine = h => ({ cmd:"PrintJSON", type:"Hint", found:h.found, receiving:h.receiving_player, item:{ item:h.item, location:h.location, player:h.finding_player, flags:h.item_flags },
  data:[txt("[Hint]: "), P(h.receiving_player), txt("'s "), I(h.item, h.receiving_player, h.item_flags), txt(" is at "), L(h.location, h.finding_player), txt(" in "), P(h.finding_player), txt("'s World"), txt(h.found ? ". (found)" : ". (not found)")] });
const say = (s, text) => T.conns.get(s)?.handle({ cmd:"PrintJSON", type:"CommandResult", data:[txt(text)] });
const hintsKey = s => `_read_hints_0_${s}`;
const pushHints = s => T.conns.get(s)?.handle({ cmd:"SetReply", key:hintsKey(s), value:W[s].hints });

/* ---------- pretend "exact logic" for games that use it: everything up to the earliest sphere with checks left ---------- */
function demoLogic(s){
  const d = D.slots[s]; if(!d.spheres) return undefined;
  if(!d.sphereOf){ d.sphereOf = new Map(); let i = 0; d.spheres.forEach((n, k) => { for(let j = 0; j < n; j++) d.sphereOf.set(d.locations[i++], k); }); }
  let front = Infinity; for(const [l, k] of d.sphereOf) if(!W[s].checked.has(l) && k < front) front = k;
  const out = { logic:[...d.sphereOf].filter(([, k]) => k <= front).map(([l]) => l), goal:front >= d.spheres.length - 1 };
  // worlds the server rebuilds several ways (Ocarina of Time) also report checks that are only maybe in logic
  if(d.game === "Ocarina of Time") out.maybe = [...d.sphereOf].filter(([l, k]) => k === front + 1 && l % 5 === 0).map(([l]) => l);
  return out;
}

/* ---------- finding a check ---------- */
const prelude = [];
function check(s, l, live){
  const w = W[s]; if(w.checked.has(l)) return;
  const info = w.info.get(l); if(!info) return;
  const [item, recv, flags] = info;
  w.checked.add(l);
  const got = { item, location:l, player:s, flags };
  W[recv].items.push(got); W[recv].times.push(live ? Math.round(Date.now() / 1000) : order++);
  if(!live) w.prog.push([order - 1, w.checked.size]);
  const touched = new Set();
  for(const who of new Set([s, recv])) for(const h of W[who].hints) if(!h.found && h.finding_player === s && h.location === l){ h.found = true; h.status = 40; touched.add(who); }
  const line = sendLine(s, l, info);
  if(!live){ prelude.push(line); if(prelude.length > 400) prelude.shift(); return; }
  T.conns.get(s)?.handle({ cmd:"RoomUpdate", checked_locations:[l], hint_points:points(s) });
  const lg = demoLogic(s); if(lg){ const sl = T.ensureSlot(s); sl.logic = new Set(lg.logic); sl.logicGoal = lg.goal; sl.logicMaybe = lg.maybe ? new Set(lg.maybe) : null; }
  T.conns.get(recv)?.handle({ cmd:"ReceivedItems", index:W[recv].items.length - 1, items:[got], times:[W[recv].times[W[recv].times.length - 1]] });
  T.onPrint(line);
  for(const who of touched) pushHints(who);
  if(w.checked.size === w.total && w.status !== 30){
    w.status = 30; T.conns.get(s)?.handle({ cmd:"SetReply", key:`_read_client_status_0_${s}`, value:30 });
    T.onPrint({ cmd:"PrintJSON", type:"Goal", data:[P(s), txt(" has completed their goal.")] });
  }
}
const later = [];
for(const [s, l] of queue){ if(W[s].checked.size < target[s] * W[s].total) check(s, l, false); else later.push([s, l]); }
for(const s of slots) if(W[s].checked.size === W[s].total) W[s].status = 30;

// a few hints already out, so the hint lists aren't empty
for(const s of slots){
  const mine = [];
  for(const t of slots) for(const [l, [item, recv, flags]] of W[t].info) if(recv === s && (flags & 1) && !W[t].checked.has(l)) mine.push({ t, l, item, flags });
  for(const m of shuffle(mine).slice(0, 2)) addHint(s, m.t, m.l, m.item, m.flags);
}
function addHint(recv, finder, l, item, flags){
  const found = W[finder].checked.has(l);
  const h = { receiving_player:recv, finding_player:finder, location:l, item, found, entrance:"", item_flags:flags, status:found ? 40 : flags & 1 ? 30 : 10 };
  W[recv].hints.push(h); if(finder !== recv) W[finder].hints.push(h);
  return h;
}

/* ---------- when things arrived, and who's in game ---------- */
const NOW = Math.round(Date.now() / 1000), H = 3600, WINDOW = 6 * H;
const at = k => k < 0 ? NOW - WINDOW - 300 : Math.round(NOW - WINDOW + (k / Math.max(1, order)) * (WINDOW - 120));
for(const s of slots){
  W[s].times = W[s].times.map(at);
  const prog = [[NOW - WINDOW - 300, 0]];   // checks over time, one point per minute at most, like the relay keeps them
  for(const [k, n] of W[s].prog){ const t = at(k), last = prog[prog.length - 1]; if(prog.length >= 2 && t - last[0] < 60) last[1] = n; else prog.push([t, n]); }
  W[s].prog = prog;
}
// some players are in game; others left a while ago and have been receiving items since
const away = new Set(slots.filter((s, i) => i % 3 === 1));
for(const s of slots){
  if(s === smallest){ W[s].online = false; W[s].sessions = [[NOW - WINDOW, NOW - 4 * H]]; }
  else if(away.has(s)){ W[s].online = false; W[s].sessions = [[NOW - WINDOW, NOW - 4 * H], [NOW - 3.2 * H, NOW - 1.75 * H]]; }
  else { W[s].online = true; W[s].sessions = [[NOW - WINDOW, NOW - 2.5 * H], [NOW - 0.6 * H, null]]; }
}

/* ---------- hand the start to the tracker ---------- */
S.hintCost = D.hint_cost;
const players = slots.map(s => ({ team:0, slot:s, name:D.slots[s].name, alias:D.slots[s].name }));
const slotInfo = Object.fromEntries(slots.map(s => [s, { name:D.slots[s].name, game:D.slots[s].game, type:1, group_members:[] }]));
S.slotName = D.slots[slots[0]].name;   // "I'm playing as" starts on the first player so hints work straight away
const snap = { seed:D.seed, team:0, hint_cost:D.hint_cost, slots:{} };
for(const s of slots){
  const w = W[s];
  snap.slots[s] = { connected:{ slot:s, team:0, players, slot_info:slotInfo, slot_data:D.slots[s].slot_data,
      checked_locations:[...w.checked], missing_locations:[...w.info.keys()].filter(l => !w.checked.has(l)), hint_points:points(s) },
    items:w.items, times:w.times, status:w.status, hints:w.hints, conn:"connected", online:w.online, sessions:w.sessions, progress:w.prog, logic:demoLogic(s) };
}
T.applySnap(snap);
for(const line of prelude.filter(() => rnd() < 0.06)) T.onPrint(line);   // a recent-looking feed from across the multiworld

/* ---------- live: a new check every few seconds ---------- */
let paused = false, timer = 0;
function tick(){
  if(!paused && later.length){
    const i = Math.floor(rnd() * Math.min(later.length, 40));   // roughly in sphere order, not strictly
    const [s, l] = later.splice(i, 1)[0];
    check(s, l, true);
  }
  timer = setTimeout(tick, 1800 + rnd() * 2200);
}
timer = setTimeout(tick, 2500);

// a minute in, one of the players who were away comes back
const returning = [...away].find(s => s !== smallest);
if(returning != null) setTimeout(() => {
  const sl = T.ensureSlot(returning), now = Math.round(Date.now() / 1000);
  sl.sessions = [...sl.sessions, [now, null]]; sl.online = true;
  T.toast(`<span class="p">${T.slotAlias(returning)}</span> is back in game. Their History tab shows what came in while they were away.`);
  T.render();
}, 60000);

/* ---------- hints, answered like the server ---------- */
window.APTracker.demoPost = (url, body) => {
  if(url === "api/say") setTimeout(() => answer(+body.slot, String(body.text || "")), 350);
  return Promise.resolve({ ok:true });
};
function lookup(map, arg){
  if(/^\d+$/.test(arg)) return +arg;
  const k = Object.keys(map).find(n => n.toLowerCase() === arg.toLowerCase());
  return k == null ? null : map[k];
}
function pay(s){
  const c = cost(s), p = points(s);
  if(p < c){ say(s, `You can't afford the hint. You have ${p} points and need at least ${c}.`); return false; }
  W[s].spent += c; T.conns.get(s)?.handle({ cmd:"RoomUpdate", hint_points:points(s) });
  return true;
}
function answer(s, text){
  const game = D.slots[s].game, dp = D.datapackage[game];
  const m = /^!(hint|hint_location)\s+(.+)$/.exec(text.trim());
  if(!m){ say(s, "The demo only answers !hint and !hint_location."); return; }
  const arg = m[2].trim();
  if(m[1] === "hint"){
    const item = lookup(dp.item_name_to_id, arg);
    if(item == null){ say(s, `No item called ${arg} exists in ${game}.`); return; }
    const spots = [];
    for(const t of slots) for(const [l, [it, recv, flags]] of W[t].info) if(it === item && recv === s) spots.push({ t, l, flags });
    if(!spots.length){ say(s, `There's no ${T.itemName(game, item)} for you in this multiworld.`); return; }
    const known = W[s].hints.filter(h => h.receiving_player === s && h.item === item);
    const fresh = spots.filter(x => !W[x.t].checked.has(x.l) && !known.some(h => h.finding_player === x.t && h.location === x.l));
    if(fresh.length){
      if(!pay(s)) return;
      const x = fresh[Math.floor(rnd() * fresh.length)];
      known.push(addHint(s, x.t, x.l, item, x.flags));
      pushHints(s); if(x.t !== s) pushHints(x.t);
    }
    if(!known.length){ say(s, `Every ${T.itemName(game, item)} has already been found.`); return; }
    for(const h of known) T.conns.get(s)?.handle(hintLine(h));
  } else {
    const l = lookup(dp.location_name_to_id, arg);
    const info = l == null ? null : W[s].info.get(l);
    if(!info){ say(s, `No check called ${arg} exists in your world.`); return; }
    const [item, recv, flags] = info;
    let h = W[s].hints.find(x => x.finding_player === s && x.location === l);
    if(!h){
      if(!pay(s)) return;
      h = addHint(recv, s, l, item, flags);
      pushHints(s); if(recv !== s) pushHints(recv);
    }
    T.conns.get(s)?.handle(hintLine(h));
  }
}

/* ---------- the demo bar ---------- */
const bar = document.createElement("div");
bar.className = "demo-bar"; bar.setAttribute("role", "status");
bar.innerHTML = `<span class="demo-tag">Demo</span><span class="demo-txt">Made-up players, one for each game tracker. No Archipelago server is involved. New checks come in every few seconds, hints are answered as the server would, and some players are away so their History tab shows what they missed.${without ? ` ${without} installed game tracker${without === 1 ? " has" : "s have"} no demo data yet, so ${without === 1 ? "it isn't" : "they aren't"} in the demo.` : ""}</span>
  <span class="demo-btns"><button type="button" class="ghost" id="demoPause">Pause</button><button type="button" class="ghost" id="demoReset">Start over</button></span>`;
const board = document.getElementById("boardView"); board.insertBefore(bar, board.firstChild);
const leave = document.getElementById("leaveBtn"); if(leave) leave.hidden = true;
bar.addEventListener("click", e => {
  if(e.target.id === "demoPause"){ paused = !paused; e.target.textContent = paused ? "Resume" : "Pause"; }
  if(e.target.id === "demoReset") location.reload();
});
})().catch(err => {
  console.error("[demo]", err);
  const e = document.getElementById("cErr"); if(e) e.textContent = "The demo couldn't start: " + (err.message || err);
});
