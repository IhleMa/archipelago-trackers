/* Wynncraft tracker (Wynnpelago by EpicPuppy613: the Wynncraft-APWorld and the Wynnpelago mod).
   Works out what's in logic the way the world's own rules do: a territory opens when its unlock item
   (Region:, Zone: or Area:, by Region Lock mode) is in and it's reachable from Ragni through open neighbours at a
   high enough level; levels need Progressive Max Level items, grind spots and (every fifth level) gear; checks
   need their territories, level, prerequisite quests and gear. Shows the territory map, what's in logic and why
   the rest isn't, level cap, gear and the goal.
   Data: data/wynncraft.json from the world's data tables; territory outlines from Wynncraft's territory list
   (see data/NOTICE.txt). */
(() => {
  const esc = APTracker.esc;
  let D = null;
  const REGION_COUNT = () => Object.keys(D.regions).length;

  /* ---------- options (slot data), with the world's defaults ---------- */
  const OPT = { goal_type:0, goal_level:30, extra_content_levels:0, region_lock_mode:1, starting_max_level:1, level_increment:1,
    gear_lock_mode:1, single_gear_rarity:0, starting_gear_level:1, gear_level_increment:5, early_territory_levels:5,
    logical_levels:1, logical_gear_levels:1, logical_grind_spots:1, logical_mounts:1, dungeon_quests:1, goal_dungeon:"", goal_quest:"" };
  const MODES = ["Region", "Zone", "Area", "Off"];
  const opts = sd => { const o = { ...OPT }; for(const k in OPT) if(sd && sd[k] != null) o[k] = sd[k]; for(const k in o) if(typeof OPT[k] === "number") o[k] = +o[k] || 0; return o; };
  const ceilDiv = (a, b) => Math.ceil(a / Math.max(1, b));

  /* The highest level the seed goes to; content above it isn't in this seed. */
  function worldMax(o){
    if(o.goal_type === 1 || o.goal_type === 2){
      const name = o.goal_type === 1 ? o.goal_dungeon : o.goal_quest, c = D.content[name];
      if(c) return c.l + o.extra_content_levels;
    }
    return o.goal_level - 1;
  }
  const goalText = o => o.goal_type === 1 ? (o.goal_dungeon || "a dungeon").replace(/^Complete: /, "") : o.goal_type === 2 ? (o.goal_quest || "a quest").replace(/^Complete: /, "") : `Level ${o.goal_level}`;

  /* The item that opens a territory under the seed's Region Lock mode (null: always open). */
  function unlockItem(o, r){
    const R = D.regions[r]; if(!R || R.d || o.region_lock_mode === 3) return null;
    return o.region_lock_mode === 0 ? "Region: " + r : o.region_lock_mode === 1 ? R.z || null : R.a || null;
  }

  /* ---------- logic ---------- */
  const cache = new Map();
  function compute(t){
    const key = t.slot + "|" + t.items.length + "|" + t.checked.length + "|" + JSON.stringify(t.slotData || {});
    if(cache.has(key)) return cache.get(key);
    const o = opts(t.slotData), M = worldMax(o), cnt = n => t.count(n);
    const inSeed = r => D.regions[r] && D.regions[r].l <= M;
    const unlocked = r => { if(!inSeed(r)) return false; const it = unlockItem(o, r); return !it || cnt(it) > 0; };
    const levelItems = cnt("Progressive Max Level");
    const needLv = n => Math.max(0, ceilDiv(n - o.starting_max_level, o.level_increment));
    const needGear = n => ceilDiv(n - o.starting_gear_level, o.gear_level_increment);
    const gearCount = (rarity, type) => o.single_gear_rarity ? cnt("Progressive " + type) : cnt(`Progressive ${rarity} ${type}`);
    function gearOK(req){
      if(o.gear_lock_mode === 2) return true;
      const [rar, typ, lvl] = req.split(" ");
      return gearCount(rar, o.gear_lock_mode === 1 ? "Gear" : typ) >= needGear(+lvl);
    }
    function gearAccess(n){
      if(o.gear_lock_mode === 2) return true;
      const need = needGear(n);
      return (o.gear_lock_mode === 1 ? ["Gear"] : ["Armor", "Weapons"]).every(ty =>
        o.single_gear_rarity ? cnt("Progressive " + ty) >= need : ["Unique", "Rare", "Legendary+"].some(r => cnt(`Progressive ${r} ${ty}`) >= need));
    }
    const ruleOn = ty => ty === "Region" ? o.logical_levels : ty === "Grind Spot" ? o.logical_grind_spots : ty === "Mount" ? o.logical_mounts : 0;

    let lv = 1, reach = new Set(), memo = new Map();
    function locOK(name, stack){
      if(memo.has(name)) return memo.get(name);
      const c = D.content[name]; if(!c || c.l > M) return false;
      if(stack.has(name)) return false;
      stack.add(name);
      let ok;
      if(c.t === "Level") ok = lv >= c.l;
      else {
        ok = (c.r || []).every(r => reach.has(r))
          && lv >= (c.t === "Territory" ? Math.max(1, c.l - o.early_territory_levels) : c.l)
          && (c.alt || []).every(unlocked)
          && (!c.pre || (c.t === "Dungeon" && !o.dungeon_quests) || c.pre.every(p => locOK(p, stack)))
          && (c.gear || []).every(gearOK);
      }
      stack.delete(name); memo.set(name, ok);
      return ok;
    }
    function walk(){
      const seen = new Set(inSeed("Ragni") ? ["Ragni"] : []), q = [...seen];
      while(q.length){
        const from = q.shift(), F = D.regions[from];
        for(const to of F.c){
          if(seen.has(to) || !inSeed(to)) continue;
          // walking into an unlockable territory needs its unlock item, a level based on the territory you come
          // from (as the world's rules have it) and any quest that guards it; towns and other default ones are free
          if(!D.regions[to].d){
            if(!unlocked(to)) continue;
            if(lv < Math.max(1, F.l - o.early_territory_levels)) continue;
            const acc = D.access[to];
            if(acc && acc.l <= M && !acc.pre.every(p => locOK(p, new Set()))) continue;
          }
          seen.add(to); q.push(to);
        }
      }
      return seen;
    }
    function levelChain(){
      let L = 1;
      for(let n = 2; n <= M; n++){
        if(levelItems < needLv(n)) break;
        let ok = true;
        for(const r of D.levels) if(r.l === n && ruleOn(r.t) && !(r.regions.some(x => reach.has(x)) || r.pre.some(p => locOK(p, new Set())))){ ok = false; break; }
        if(ok && (n - 1) % 5 === 0 && o.logical_gear_levels && !gearAccess(n)) ok = false;
        if(!ok) break;
        L = n;
      }
      return L;
    }
    for(let i = 0; i < 60; i++){
      memo = new Map();
      const nr = walk(), grew = nr.size !== reach.size; reach = nr;
      memo = new Map();
      const nl = levelChain(), up = nl !== lv; lv = nl;
      if(!grew && !up) break;
    }
    memo = new Map();
    const inLogic = name => locOK(name, new Set());
    const cap = Math.min(o.starting_max_level + levelItems * o.level_increment, 121);
    let goalOK;
    if(o.goal_type === 0) goalOK = levelItems >= needLv(o.goal_level) && lv >= o.goal_level - 1;
    else goalOK = inLogic(o.goal_type === 1 ? o.goal_dungeon : o.goal_quest);
    const r = { o, M, lv, cap, reach, unlocked, inSeed, inLogic, gearOK, needGear, gearCount, goalOK, levelItems, needLv, explain:null };
    r.explain = name => explain(r, name);
    cache.set(key, r); if(cache.size > 40) cache.delete(cache.keys().next().value);
    return r;
  }

  /* Why a check isn't in logic yet: the first thing missing, with the item to hint where there is one. */
  function explain(S, name, depth = 0){
    const c = D.content[name]; if(!c) return { text:"unknown check" };
    if(c.t === "Level") return { text:`needs level ${c.l} in logic (now ${S.lv})`, items:["Progressive Max Level"] };
    for(const r of c.r || []) if(!S.reach.has(r)){
      const it = unlockItem(S.o, r);
      if(it && !S.unlocked(r)) return { text:`${r} is locked`, items:[it] };
      return { text:`${r} isn't reachable yet` };
    }
    const need = c.t === "Territory" ? Math.max(1, c.l - S.o.early_territory_levels) : c.l;
    if(S.lv < need) return { text:`needs level ${need} (in logic: ${S.lv})`, items:["Progressive Max Level"] };
    for(const a of c.alt || []) if(!S.unlocked(a)) return { text:`needs ${a} unlocked`, items:[unlockItem(S.o, a)].filter(Boolean) };
    if(c.pre && !(c.t === "Dungeon" && !S.o.dungeon_quests)) for(const p of c.pre) if(!S.inLogic(p)){
      const sub = depth < 2 ? explain(S, p, depth + 1) : null;
      return { text:`needs ${p.replace(/^Complete: /, "")} first${sub && sub.text ? ` (${sub.text})` : ""}`, items:sub && sub.items };
    }
    for(const g of c.gear || []) if(!S.gearOK(g)){
      const [rar, typ] = g.split(" "), ty = S.o.gear_lock_mode === 1 ? "Gear" : typ;
      return { text:`needs ${g.replace(/ (\d+)$/, " gear up to level $1")}`, items:[S.o.single_gear_rarity ? "Progressive " + ty : `Progressive ${rar} ${ty}`] };
    }
    return { text:"" };
  }

  /* Why an unlocked territory isn't reachable: the level to enter from a reachable neighbour (the rules use the
     neighbour's level), a quest that guards it, or no open neighbour at all. */
  function gateReason(S, to){
    let need = Infinity;
    for(const r of S.reach) if(D.regions[r].c.includes(to)) need = Math.min(need, Math.max(1, D.regions[r].l - S.o.early_territory_levels));
    if(need === Infinity) return "no open neighbour leads there yet";
    if(S.lv < need) return `needs level ${need} in logic (now ${S.lv})`;
    const acc = D.access[to];
    if(acc){ const p = acc.pre.find(x => !S.inLogic(x)); if(p) return `needs ${p.replace(/^Complete: /, "")} first`; }
    return "not reachable yet";
  }

  /* ---------- groups ---------- */
  const TYPES = [["Quest","Quests"],["Mini-Quest","Mini-quests"],["Dungeon","Dungeons"],["C-Dungeon","Corrupted dungeons"],["Cave","Caves"],
    ["Secret","Secrets"],["Territory","Territories"],["Level","Levels"],["Time Trial","Time trials"],["World Event","World events"],["Raid","Raids"],["Lootrun","Lootruns"]];
  const typeLabel = ty => (TYPES.find(x => x[0] === ty) || [0, "Other"])[1];
  const short = n => n.replace(/^(Complete|Explore|Visit|Discover|Race|Clear|Run|Level Up): /, "");

  /* ---------- map ---------- */
  const VIEW = {};   // slot -> [x, z, w, h]
  const FULL = [-2340, -6640, 3980, 6440];
  const PRESETS = { all:FULL, wynn:[-2340, -2560, 3980, 2360], ocean:[-1300, -4450, 2950, 2050], gavel:[-2340, -5700, 3980, 1700], north:[-1050, -6640, 900, 900] };
  function viewFor(t, S){
    if(VIEW[t.slot]) return VIEW[t.slot];
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for(const r of S.reach){ const b = D.regions[r].r; x0 = Math.min(x0, b[0]); z0 = Math.min(z0, b[1]); x1 = Math.max(x1, b[2]); z1 = Math.max(z1, b[3]); }
    if(!isFinite(x0)) return PRESETS.wynn;
    const pad = 260, w = Math.max(1400, x1 - x0 + pad * 2), h = Math.max(1000, z1 - z0 + pad * 2);
    return [(x0 + x1) / 2 - w / 2, (z0 + z1) / 2 - h / 2, w, h];
  }
  function renderMap(t){
    const S = compute(t), vb = viewFor(t, S);
    const checksIn = new Map();
    for(const l of t.locations){ const c = D.content[l.name], r = c && c.r && c.r[0]; if(!r) continue; const e = checksIn.get(r) || [0, 0]; e[1]++; if(l.done) e[0]++; checksIn.set(r, e); }
    let rects = "", links = "", towns = "";
    const drawn = new Set();
    for(const [name, R] of Object.entries(D.regions)){
      const [x0, z0, x1, z1] = R.r, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      for(const to of R.c){ const k = [name, to].sort().join("|"); if(drawn.has(k) || !D.regions[to]) continue; drawn.add(k); const b = D.regions[to].r;
        links += `<line x1="${cx}" y1="${cz}" x2="${(b[0] + b[2]) / 2}" y2="${(b[1] + b[3]) / 2}"/>`; }
      const st = !S.inSeed(name) ? "out" : S.reach.has(name) ? "open" : S.unlocked(name) ? "gated" : "locked";
      const ch = checksIn.get(name), it = unlockItem(S.o, name);
      const why = st === "out" ? "Not in this seed (above its level range)" : st === "open" ? "Open" : st === "gated"
        ? `Unlocked, ${gateReason(S, name)}` : `Locked: needs ${it}`;
      const tip = `${name} · level ${R.l}${R.z ? ` · ${R.z.replace(/^Zone: /, "")}` : ""}\n${why}${ch ? `\nChecks: ${ch[0]} / ${ch[1]}` : ""}${st === "locked" ? "\nClick for a hint" : ""}`;
      const hint = st === "locked" && it ? t.hint([it], it) : "";
      const left = ch && ch[0] < ch[1] && st === "open" ? " todo" : "";
      rects += `<rect class="wy-t ${st}${left}${R.d ? " town" : ""}" x="${x0}" y="${z0}" width="${Math.max(8, x1 - x0)}" height="${Math.max(8, z1 - z0)}"${hint}><title>${esc(tip)}</title></rect>`;
      if(R.d) towns += `<text x="${cx}" y="${cz}">${esc(name)}</text>`;
    }
    const pressed = k => JSON.stringify(PRESETS[k]) === JSON.stringify(vb);
    return `<div class="wy">
      <div class="wy-maphead"><div class="wy-legend"><span><i class="open"></i>Open</span><span><i class="todo"></i>Open, checks left</span><span><i class="gated"></i>Unlocked, not reachable yet</span><span><i class="locked"></i>Locked (click for a hint)</span></div>
        <div class="wy-views" role="group" aria-label="Map view">${[["me","Where I can go"],["wynn","Wynn"],["ocean","Ocean & Corkus"],["gavel","Gavel"],["north","North"],["all","All"]].map(([k, l]) => `<button type="button" data-wyview="${k}" data-slot="${t.slot}" aria-pressed="${k !== "me" && pressed(k)}">${l}</button>`).join("")}</div></div>
      <div class="wy-map" data-wymap="${t.slot}"><svg viewBox="${vb.join(" ")}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Territory map">
        <g class="wy-links">${links}</g><g>${rects}</g><g class="wy-towns" style="font-size:${fontFor(vb)}px">${towns}</g></svg></div>
      <p class="wy-note">Scroll or pinch to zoom, drag to move. Hover a territory for its level, unlock item and checks. ${S.reach.size} of ${[...Object.keys(D.regions)].filter(S.inSeed).length} territories in this seed are open.</p></div>`;
  }
  const fontFor = vb => Math.max(14, vb[2] / 55);

  /* zoom and drag, kept per slot between redraws */
  let drag = null;
  document.addEventListener("wheel", e => {
    const box = e.target.closest && e.target.closest("[data-wymap]"); if(!box) return;
    e.preventDefault(); zoomAt(box, e.clientX, e.clientY, e.deltaY > 0 ? 1.2 : 1 / 1.2);
  }, { passive:false });
  function zoomAt(box, px, py, f){
    const svg = box.querySelector("svg"), vb = svg.getAttribute("viewBox").split(" ").map(Number), r = svg.getBoundingClientRect();
    const s = Math.max(vb[2] / r.width, vb[3] / r.height), ox = (r.width - vb[2] / s) / 2, oy = (r.height - vb[3] / s) / 2;
    const mx = vb[0] + (px - r.left - ox) * s, mz = vb[1] + (py - r.top - oy) * s;
    const w = Math.min(FULL[2] * 1.6, Math.max(300, vb[2] * f)), h = vb[3] * (w / vb[2]);
    setView(box, [mx - (mx - vb[0]) * (w / vb[2]), mz - (mz - vb[1]) * (h / vb[3]), w, h]);
  }
  function setView(box, vb){
    vb = vb.map(v => Math.round(v));
    const svg = box.querySelector("svg"); svg.setAttribute("viewBox", vb.join(" "));
    const g = svg.querySelector(".wy-towns"); if(g) g.style.fontSize = fontFor(vb) + "px";
    VIEW[box.dataset.wymap] = vb;
    box.parentElement.querySelectorAll("[data-wyview]").forEach(b => b.setAttribute("aria-pressed", "false"));
  }
  const pointers = new Map();
  document.addEventListener("pointerdown", e => {
    const box = e.target.closest && e.target.closest("[data-wymap]"); if(!box) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    const svg = box.querySelector("svg");
    drag = { box, x:e.clientX, y:e.clientY, vb:svg.getAttribute("viewBox").split(" ").map(Number), moved:false, pinch:pointers.size === 2 ? dist() : 0 };
  });
  const dist = () => { const p = [...pointers.values()]; return p.length < 2 ? 0 : Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); };
  document.addEventListener("pointermove", e => {
    if(!drag) return;
    if(pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if(pointers.size === 2 && drag.pinch){
      const d = dist(), p = [...pointers.values()];
      zoomAt(drag.box, (p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2, drag.pinch / d); drag.pinch = d; drag.moved = true; return;
    }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if(!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    const r = drag.box.querySelector("svg").getBoundingClientRect(), s = Math.max(drag.vb[2] / r.width, drag.vb[3] / r.height);
    setView(drag.box, [drag.vb[0] - dx * s, drag.vb[1] - dy * s, drag.vb[2], drag.vb[3]]);
  });
  const endDrag = e => { pointers.delete(e.pointerId); if(drag && drag.moved){ const stop = ev => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener("click", stop, { capture:true, once:true }); setTimeout(() => document.removeEventListener("click", stop, { capture:true }), 0); } if(!pointers.size) drag = null; };
  document.addEventListener("pointerup", endDrag); document.addEventListener("pointercancel", endDrag);
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("[data-wyview]"); if(!b) return;
    e.stopPropagation();
    const slot = b.dataset.slot, box = document.querySelector(`[data-wymap="${slot}"]`); if(!box) return;
    if(b.dataset.wyview === "me"){ delete VIEW[slot]; const cur = window.__wyLast && window.__wyLast[slot]; if(cur) setView(box, viewFor(cur.t, cur.S)); delete VIEW[slot]; }
    else setView(box, PRESETS[b.dataset.wyview].slice());
    b.setAttribute("aria-pressed", "true");
  }, true);

  /* ---------- progress ---------- */
  function renderProgress(t){
    const S = compute(t), o = S.o;
    (window.__wyLast = window.__wyLast || {})[t.slot] = { t, S };
    const missing = t.locations.filter(l => !l.done), inLogic = missing.filter(l => S.inLogic(l.name));
    const total = Object.keys(D.regions).filter(S.inSeed).length;
    const goalLine = o.goal_type === 0 ? `Reach level ${o.goal_level}` : `Complete ${goalText(o)}`;
    const lvNote = S.lv < Math.min(S.cap, S.M) ? `Logic expects level ${S.lv}: ${levelBlock(S, t)}` : "";
    let html = `<div class="wy"><div class="wy-hero">
      <div class="wy-stat"><span>Level cap</span><b>${S.cap}</b><small>${S.levelItems} Progressive Max Level${S.levelItems === 1 ? "" : "s"} received</small></div>
      <div class="wy-stat"><span>Level in logic</span><b>${S.lv}</b><small>${lvNote ? esc(lvNote) : "everything up to the cap"}</small></div>
      <div class="wy-stat"><span>Territories open</span><b>${S.reach.size}<em> / ${total}</em></b><small>${MODES[o.region_lock_mode]} lock${o.region_lock_mode === 3 ? "" : "s"}</small></div>
      <div class="wy-stat goal${t.goal ? " done" : S.goalOK ? " ready" : ""}"><span>Goal</span><b class="wy-goal">${esc(goalLine)}</b><small>${t.goal ? "Done!" : S.goalOK ? "In logic now" : "Not in logic yet"}</small></div>
    </div>`;
    html += `<div class="wy-row">
      <section class="wy-box"><h4>In logic now</h4><p class="wy-big">${inLogic.length}<em> of ${missing.length} checks left</em></p>
        <ul class="wy-counts">${TYPES.map(([ty, label]) => { const a = missing.filter(l => (D.content[l.name] || {}).t === ty); if(!a.length) return ""; const n = a.filter(l => S.inLogic(l.name)).length; return `<li><span>${label}</span><b>${n}</b><em>/ ${a.length}</em></li>`; }).join("")}</ul></section>
      <section class="wy-box"><h4>Level cap</h4>${capBar(S, t)}${gearHtml(S, t)}</section>
    </div>`;
    html += frontier(S, t) + "</div>";
    return html;
  }
  function levelBlock(S, t){
    const n = S.lv + 1, o = S.o;
    if(S.levelItems < S.needLv(n)) return `level ${n} needs another Progressive Max Level`;
    const blocks = D.levels.filter(r => r.l === n && (r.t === "Region" ? o.logical_levels : r.t === "Grind Spot" ? o.logical_grind_spots : o.logical_mounts));
    for(const r of blocks) if(!(r.regions.some(x => S.reach.has(x)) || r.pre.some(p => S.inLogic(p))))
      return `level ${n} needs ${[...r.regions, ...r.pre.map(p => p.replace(/^Complete: /, ""))].join(" or ")}`;
    if((n - 1) % 5 === 0 && o.logical_gear_levels) return `level ${n} needs gear for level ${n}`;
    return "";
  }
  function capBar(S, t){
    const top = S.o.goal_type === 0 ? S.o.goal_level : S.M, p = Math.min(100, S.cap / top * 100), q = Math.min(100, S.lv / top * 100);
    return `<div class="wy-capbar" title="Cap ${S.cap}, in logic ${S.lv}, goal range ${top}"><i class="cap" style="width:${p}%"></i><i class="lv" style="width:${q}%"></i></div>
      <p class="wy-dim">Cap ${S.cap} (dark) and level in logic ${S.lv} (bright), out of ${top}. Each Progressive Max Level raises the cap by ${S.o.level_increment}. <button type="button" class="wy-hintbtn"${t.hint(["Progressive Max Level"], "Progressive Max Level")}>Where are more?</button></p>`;
  }
  function gearHtml(S, t){
    const o = S.o; if(o.gear_lock_mode === 2) return `<p class="wy-dim">Gear isn't locked in this seed.</p>`;
    const types = o.gear_lock_mode === 1 ? ["Gear"] : ["Armor", "Accessories", "Weapons"], rars = o.single_gear_rarity ? [""] : ["Unique", "Rare", "Legendary+"];
    const lvl = n => Math.min(o.starting_gear_level + n * o.gear_level_increment, 121);
    return `<h4 class="wy-sub">Gear you can use</h4><table class="wy-gear"><thead><tr><th></th>${rars.map(r => `<th>${r || "All"}</th>`).join("")}</tr></thead><tbody>
      ${types.map(ty => `<tr><th scope="row">${ty}</th>${rars.map(r => { const name = r ? `Progressive ${r} ${ty}` : `Progressive ${ty}`, n = t.count(name);
        return `<td${t.hint([name], name)}><b>${n ? "≤ " + lvl(n) : "–"}</b><small>${n}×</small></td>`; }).join("")}</tr>`).join("")}</tbody></table>`;
  }
  /* What to unlock next: locked territories next to open ones, grouped by the item that opens them. */
  function frontier(S, t){
    const groups = new Map();
    for(const r of S.reach) for(const to of D.regions[r].c){
      if(S.reach.has(to) || !S.inSeed(to)) continue;
      const it = unlockItem(S.o, to);
      const key = it && !S.unlocked(to) ? it : "(unlocked)";
      if(!groups.has(key)) groups.set(key, new Set());
      groups.get(key).add(to);
    }
    const locked = [...groups].filter(([k]) => k !== "(unlocked)").sort((a, b) => lvOf(a[0]) - lvOf(b[0]));
    const gated = groups.get("(unlocked)");
    let h = `<section class="wy-box"><h4>Next to open</h4>`;
    if(!locked.length && !gated) h += `<p class="wy-dim">Nothing left next to your territories.</p>`;
    if(locked.length) h += `<p class="wy-dim">Locked territories bordering yours, by the item that opens them. Click one for a hint.</p><div class="wy-next">${locked.map(([it, set]) =>
      `<div class="wy-nx"${t.hint([it], it)}><b>${esc(it.replace(/^(Zone|Area|Region): /, ""))}</b><small>${esc(it.split(":")[0])} · level ${lvOf(it)} · opens ${[...set].slice(0, 4).map(esc).join(", ")}${set.size > 4 ? ` +${set.size - 4}` : ""}</small></div>`).join("")}</div>`;
    if(gated) h += `<p class="wy-dim">Unlocked but not reachable in logic yet: ${[...gated].slice(0, 8).map(r => `${esc(r)} (${esc(gateReason(S, r))})`).join(", ")}${gated.size > 8 ? "…" : ""}</p>`;
    return h + `</section>`;
  }
  const lvOf = it => { const n = it.replace(/^Region: /, ""); return (D.zones[it] || D.areas[it] || D.regions[n] || { l:0 }).l; };

  /* ---------- checks in logic ---------- */
  function renderLogic(t){
    const S = compute(t);
    const missing = t.locations.filter(l => !l.done);
    let html = `<div class="wy"><p class="wy-dim">Every check you haven't done, grouped by type. In logic first; the rest say what they're waiting for. Click a reason with an item to ask for a hint.</p>`;
    for(const [ty, label] of TYPES){
      const a = missing.filter(l => (D.content[l.name] || {}).t === ty).sort((x, y) => D.content[x.name].l - D.content[y.name].l || x.name.localeCompare(y.name));
      if(!a.length) continue;
      const yes = a.filter(l => S.inLogic(l.name)), no = a.filter(l => !S.inLogic(l.name));
      html += `<details class="wy-grp"${yes.length ? " open" : ""}><summary><b>${label}</b><span>${yes.length} in logic · ${no.length} not yet</span></summary>
        ${yes.length ? `<ul class="wy-list">${yes.map(l => `<li class="ok"><span class="wy-lv">${D.content[l.name].l}</span><span>${esc(short(l.name))}</span><small>${esc((D.content[l.name].r || [])[0] || "")}</small></li>`).join("")}</ul>` : ""}
        ${no.length ? `<ul class="wy-list wy-no">${no.slice(0, 120).map(l => { const w = S.explain(l.name), items = (w.items || []).filter(Boolean);
            return `<li><span class="wy-lv">${D.content[l.name].l}</span><span>${esc(short(l.name))}</span><small${items.length ? t.hint(items, items[0]) : ""}>${esc(w.text || "")}</small></li>`; }).join("")}</ul>${no.length > 120 ? `<p class="wy-dim">${no.length - 120} more, all higher level.</p>` : ""}` : ""}
      </details>`;
    }
    return html + `</div>`;
  }

  APTracker.register({
    game:"Wynncraft",
    slotData:true,
    _compute:t => compute(t),   // lets a test compare this logic with the world's own
    async init(api){ D = await api.json("data/wynncraft.json"); },
    tabs:[
      { id:"wy-progress", label:"Progress", render:renderProgress },
      { id:"wy-map", label:"Territory map", render:t => { (window.__wyLast = window.__wyLast || {})[t.slot] = { t, S:compute(t) }; return renderMap(t); } },
      { id:"wy-logic", label:"In logic", render:renderLogic }
    ],
    checksLabel:"Checks by type",
    locationGroup:n => typeLabel((D.content[n] || {}).t),
    groupOrder:TYPES.map(x => x[1]).concat(["Other"]),
    card(t){
      const S = compute(t), left = t.locations.filter(l => !l.done && S.inLogic(l.name)).length;
      const total = Object.keys(D.regions).filter(S.inSeed).length;
      return `Level cap ${S.cap} · ${S.reach.size}/${total} territories · ${left} in logic`;
    }
  });
})();
