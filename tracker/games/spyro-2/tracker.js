/* Spyro 2: Ripto's Rage tracker (S2AP by Uroogla and contributors).
   A sky banner on every tab (goal, ready count, talismans, orbs, skill points, Sparx buzzing about), then:
   Avalar: the three homeworlds as floating islands in their seasons (fireflies in summer, falling leaves in autumn, snow
   in winter), each level a swirling portal around its homeworld; the swirl speeds up and glows where something is ready
   now, turns gold when the level is done and goes to stone while it's key-locked. Hover or tap a portal to see what you
   can do there; every ready check is listed underneath, level by level.
   Collection: talismans, orbs, skill points, tokens and gems, then moves and powers. Levels: every check, level by level.
   What's in logic comes from Archipelago itself: the relay rebuilds the player's world from slot data (options,
   key-locked levels and the seed's own gemsanity picks; relay/ap_logic.py fetches the world at the seed's version), so
   "ready now" is exact. Data: data/s2.json (levels, check kinds from the world), data/icons.json (drawn for this tracker). */
(() => {
  const esc = APTracker.esc;
  let D = null, IC = {};
  const HOME_STYLE = { "Summer Forest":["tree", "summer"], "Autumn Plains":["leaf", "autumn"], "Winter Tundra":["snow", "winter"] };
  const GOALS = { 0:"Defeat Ripto", 3:"Collect 64 orbs", 4:"100% completion", 5:"Ten Dragon Shores tokens", 6:"Every skill point", 7:"The epilogue", 8:"Orb hunt" };
  const KIND = { TALISMAN:["talisman", "Talisman"], ORB:["orb", "Orbs"], GEM_25:["gem", "25% gems"], GEM_50:["gem", "50% gems"], GEM_75:["gem", "75% gems"],
    GEM_100:["gem", "All gems"], SKILLPOINT:["skill", "Skill points"], SKILLPOINT_GOAL:["skill", "Skill points"], LIFE_BOTTLE:["bottle", "Life bottles"],
    SPIRIT_PARTICLE:["spirit", "Spirit particles"], MONEYBAGS:["moneybags", "Moneybags"], SHORES_TOKEN:["token", "Dragon Shores"], TOTAL_GEM:["gem", "Gem totals"],
    GEM:["gem", "Gems"], EVENT:["boss", "Boss"] };
  const GEM_VALUE = { Red:1, Green:2, Blue:5, Gold:10, Pink:25 };
  const slugify = s => s.replace(/[^A-Za-z0-9]+/g, "-");

  const icon = (k, size, cls) => { const g = IC[k] || IC.orb;
    return `<svg class="sp-i ${cls || ""}" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><path class="s" d="${g.s}" fill-rule="evenodd"/>${g.d ? `<path class="d" d="${g.d}"/>` : ""}</svg>`; };

  /* ---------- the slot ---------- */
  let levelSet = null;
  const cache = new Map();
  function model(t){
    if(!levelSet) levelSet = new Set(Object.entries(D.home).flatMap(([h, l]) => [h, ...l]));
    const key = t.slot + "|" + t.items.length + "|" + t.checked.length + "|" + (t.inLogic ? t.inLogic.size : -1);
    if(cache.has(key)) return cache.get(key);
    const logic = t.inLogic, haveLogic = !!logic, o = (t.slotData || {}).options || {};
    const locs = t.locations.map(l => {
      const g = /^(.+): Gem \d+$/.exec(l.name), d = D.locs[l.name];
      const pre = l.name.split(": ")[0], level = levelSet.has(pre) ? pre : d ? d[0] : "Inventory";
      return { id:l.id, name:l.name, done:l.done, level, kind:g ? "GEM" : d ? d[1] : "OTHER", ready:!l.done && haveLogic && logic.has(l.id) };
    });
    const byLevel = new Map(); for(const l of locs) (byLevel.get(l.level) || byLevel.set(l.level, []).get(l.level)).push(l);
    const keyLocked = new Set(o.level_lock_options === 1 ? (t.slotData.key_locked_levels || []) : []);
    const m = { o, locs, byLevel, keyLocked, haveLogic, ready:locs.filter(l => l.ready).length, left:locs.filter(l => !l.done).length };
    cache.set(key, m); if(cache.size > 30) cache.delete(cache.keys().next().value);
    return m;
  }
  const levelOpen = (t, m, lv) => !m.keyLocked.has(lv) || t.has(lv + " Unlock");
  const short = (n, lv) => n.startsWith(lv + ": ") ? n.slice(lv.length + 2) : n;
  const noLogic = t => t.logicNote ? esc(t.logicNote) : `"Ready now" needs exact logic on the server: run <code>tracker update</code> in the console.`;
  // a list of ready checks, gems folded into one line
  function readyList(list, lv, max){
    const gems = list.filter(l => l.kind === "GEM"), rest = list.filter(l => l.kind !== "GEM");
    const shown = max && rest.length > max ? rest.slice(0, max - 1) : rest;
    return `<ul>${shown.map(l => `<li>${icon((KIND[l.kind] || ["orb"])[0], 18)}${esc(short(l.name, lv))}</li>`).join("")}${max && rest.length > max ? `<li class="more">and ${rest.length - shown.length} more</li>` : ""}${gems.length ? `<li class="gems">${icon("gem", 18)}${gems.length} gem${gems.length === 1 ? "" : "s"}</li>` : ""}</ul>`;
  }

  /* ---------- the sky banner (every tab) ---------- */
  function banner(t, m){
    const o = m.o, goal = GOALS[o.goal] || "Defeat Ripto";
    const tal = t.count("Summer Forest Talisman") + t.count("Autumn Plains Talisman"), orbs = t.count("Orb");
    const mini = [["talisman", tal, 14, "Talismans"], ["orb", orbs, 64, "Orbs"], ["skill", t.count("Skill Point"), 16, "Skill points"]];
    if(t.itemNames.includes("Dragon Shores Token")) mini.push(["token", t.count("Dragon Shores Token"), 10, "Shores tokens"]);
    return `<section class="sp-hero${t.goal ? " done" : t.logicGoal ? " go" : ""}">
      <span class="sp-sparx" aria-hidden="true">${icon("sparx", 34)}</span>
      <div class="sp-goal"><small>Goal</small><h2>${esc(goal)}</h2>
        <p>${t.goal ? "Done. Avalar is saved!" : t.logicGoal ? "Everything you need for it is in logic." : m.haveLogic ? "Not in logic yet." : ""}</p>
        ${m.haveLogic ? "" : `<p class="sp-warn">${noLogic(t)}</p>`}</div>
      ${m.haveLogic ? `<div class="sp-big go"><b>${m.ready}</b><span>ready right now</span></div>` : ""}
      <div class="sp-big"><b>${m.locs.length - m.left}<em>/${m.locs.length}</em></b><span>checks done</span></div>
      <div class="sp-mini">${mini.map(([ic, n, of, label]) => `<span class="${ic}" title="${label}">${icon(ic, 26)}<b>${n}</b><em>/${of}</em></span>`).join("")}</div>
    </section>`;
  }

  /* ---------- Avalar: islands of portals ---------- */
  let openLevel = null;
  function toggle(e){
    if(e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
    const hot = e.target.closest && e.target.closest(".sp-portal");
    if(hot && e.target.closest(".sp-pop") && e.type === "click") return;   // clicks inside the card don't close it
    if(hot && e.target.closest("[data-hint]")) return;                     // a locked portal asks for a hint instead
    if(e.type === "keydown"){ if(!hot) return; e.preventDefault(); }
    const lv = hot ? hot.dataset.level : null;
    openLevel = lv && openLevel !== lv ? lv : null;
    for(const h of document.querySelectorAll(".sp-portal")){ const on = h.dataset.level === openLevel; h.classList.toggle("open", on); h.setAttribute("aria-expanded", on); }
  }
  document.addEventListener("click", toggle);
  document.addEventListener("keydown", toggle);

  function portal(t, m, lv, home, x, y){
    const l = m.byLevel.get(lv) || [], done = l.filter(z => z.done).length, ready = l.filter(z => z.ready), open = levelOpen(t, m, lv);
    const p = l.length ? done / l.length : 0, full = l.length && done === l.length;
    const kind = /Speedway/.test(lv) ? "speedway" : /Dungeon|Overlook|Arena/.test(lv) ? "boss" : null;
    const st = !open ? "shut" : full ? "full" : ready.length ? "go" : m.haveLogic && l.length ? "idle" : "open", isHome = lv === home;
    const pop = `<div class="sp-pop${x > 60 ? " l" : ""}${y > 55 ? " u" : ""}"><header><b>${esc(lv)}</b><span>${ready.length ? `<em>${ready.length} ready</em> · ` : ""}${done}/${l.length} done</span></header>
      ${!open ? `<p class="sp-need">${icon("key", 18)}Needs <b>${esc(lv)} Unlock</b></p>` : ready.length ? readyList(ready, lv, 8) : `<small>${full ? "Everything here is done." : l.length ? (m.haveLogic ? "Nothing reachable here yet." : `${l.length - done} checks left.`) : "No checks in this level."}</small>`}</div>`;
    return `<div class="sp-portal ${st}${isHome ? " home" : ""}${openLevel === lv ? " open" : ""}" style="left:${x}%;top:${y}%" data-level="${esc(lv)}" tabindex="0" role="button" aria-expanded="${openLevel === lv}" aria-label="${esc(lv)}: ${done} of ${l.length} done${ready.length ? `, ${ready.length} ready now` : ""}">
      <span class="sp-gate"${!open ? t.hint([lv + " Unlock"], lv) : ""}>
        <svg class="sp-ring" viewBox="0 0 80 80" aria-hidden="true"><circle class="bg" cx="40" cy="40" r="35"/><circle class="p" cx="40" cy="40" r="35" style="stroke-dasharray:${(p * 219.9).toFixed(1)} 230"/></svg>
        <span class="sp-swirl"></span>
        <span class="sp-core">${!open ? icon("lock", isHome ? 30 : 22) : full ? icon("check", isHome ? 30 : 22) : isHome ? icon(HOME_STYLE[home][0], 34) : kind ? icon(kind, 22) : `<b>${ready.length || l.length - done}</b>`}</span>
        ${ready.length && (isHome || kind) ? `<i class="sp-count">${ready.length}</i>` : ""}</span>
      <strong>${esc(lv)}</strong>${pop}</div>`;
  }
  function island(t, m, home, levels){
    const all = [home, ...levels].flatMap(lv => m.byLevel.get(lv) || []), ready = all.filter(l => l.ready).length, done = all.filter(l => l.done).length;
    // levels on an ellipse around the homeworld, starting at the top
    const n = levels.length, many = n > 8, rx = many ? 40 : 37, ry = many ? 39 : 36;
    const ring = levels.map((lv, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return portal(t, m, lv, home, 50 + rx * Math.cos(a), 50 + ry * Math.sin(a)); }).join("");
    const flakes = Array.from({ length:9 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i * 1.7) % 7}s;--s:${6 + (i * 13) % 6}s"></i>`).join("");
    return `<section class="sp-island ${HOME_STYLE[home][1]}${many ? " many" : ""}">
      <header>${icon(HOME_STYLE[home][0], 34)}<div><h3>${esc(home)}</h3><span>${done} / ${all.length} done${m.haveLogic && ready ? ` · <b>${ready} ready now</b>` : ""}</span></div></header>
      <div class="sp-sky"><div class="sp-weather" aria-hidden="true">${flakes}</div><div class="sp-land" aria-hidden="true"></div>${portal(t, m, home, home, 50, 50)}${ring}</div>
    </section>`;
  }
  function renderAvalar(t){
    const m = model(t);
    let html = `<div class="sp">${banner(t, m)}<div class="sp-islands">${Object.entries(D.home).map(([h, l]) => island(t, m, h, l)).join("")}</div>
      <p class="sp-legend"><span class="go">swirling bright: something ready now</span><span class="full">gold: level done</span><span class="shut">stone: needs its key</span><span>hover or tap a portal to see its checks</span></p>`;
    // every ready check, level by level
    if(m.haveLogic){
      const cards = Object.entries(D.home).flatMap(([home, levels]) => [home, ...levels].map(lv => {
        const r = (m.byLevel.get(lv) || []).filter(l => l.ready); if(!r.length) return "";
        const l = m.byLevel.get(lv), d = l.filter(z => z.done).length;
        return `<article class="sp-rcard ${HOME_STYLE[home][1]}"><header>${icon(lv === home ? HOME_STYLE[home][0] : "portal", 24)}<b>${esc(lv)}</b><span>${r.length} ready · ${d}/${l.length}</span></header>${readyList(r, lv)}</article>`; })).join("");
      const inv = (m.byLevel.get("Inventory") || []).filter(l => l.ready);
      html += `<section class="sp-panel"><h3>${icon("sparx", 30)}Ready now <small>${m.ready ? `${m.ready} check${m.ready === 1 ? "" : "s"} you can do with what you have` : m.left ? "nothing reachable right now: wait for more items, or ask for a hint" : "every check done"}</small></h3>
        ${cards || inv.length ? `<div class="sp-rcards">${cards}${inv.length ? `<article class="sp-rcard"><header>${icon("gem", 24)}<b>Across Avalar</b><span>${inv.length} ready</span></header>${readyList(inv, "")}</article>` : ""}</div>` : ""}</section>`;
    }
    return html + `</div>`;
  }

  /* ---------- Collection ---------- */
  function renderCollection(t){
    const m = model(t), o = m.o;
    const tal = t.count("Summer Forest Talisman") + t.count("Autumn Plains Talisman"), orbs = t.count("Orb");
    const gemItems = t.items.reduce((n, it) => { const g = /^.+ (Red|Green|Blue|Gold|Pink) Gem$/.exec(it.name); return n + (g ? GEM_VALUE[g[1]] : / Gem Bundle$/.test(it.name) ? +(o.gemsanity_gem_bundle_size || 0) : 0); }, 0);
    const stats = [["talisman", tal, 14, "Talismans", ["Summer Forest Talisman", "Autumn Plains Talisman"]], ["orb", orbs, 64, "Orbs", ["Orb"], o.ripto_door_orbs ? `Ripto's door needs ${o.ripto_door_orbs}` : ""],
      ["skill", t.count("Skill Point"), 16, "Skill points", ["Skill Point"]], ["token", t.count("Dragon Shores Token"), 10, "Shores tokens", ["Dragon Shores Token"]]];
    if(o.enable_gemsanity) stats.push(["gem", gemItems, 10000, "Gems from items", []]);
    const tiles = stats.filter(s => s[1] || t.itemNames.includes(s[4][0]) || s[0] === "talisman" || s[0] === "orb").map(([ic, n, of, label, items, note], i) =>
      `<div class="sp-stat ${ic}${n >= of ? " full" : ""}" style="--d:${i * .4}s"${n < of && items.length ? t.hint(items, label) : ""}>${icon(ic, 46)}<b>${n.toLocaleString("en-US")}<em>/${of.toLocaleString("en-US")}</em></b><span>${label}</span>
        <i class="sp-fill"><u style="width:${Math.min(100, n / of * 100)}%"></u></i>${note ? `<small>${esc(note)}</small>` : ""}</div>`).join("");
    const ab = o.moneybags_settings === 2;   // moneybagssanity: the moves are items
    const moves = [["swim", "Swim", ab ? t.has("Moneybags Unlock - Swim") : null, "Moneybags Unlock - Swim"], ["climb", "Climb", ab ? t.has("Moneybags Unlock - Climb") : null, "Moneybags Unlock - Climb"],
      ["headbash", "Headbash", ab ? t.has("Moneybags Unlock - Headbash") : null, "Moneybags Unlock - Headbash"],
      ["wings", "Double jump", o.double_jump_ability === 1 ? t.has("Double Jump Ability") : o.double_jump_ability === 3 ? true : o.double_jump_ability === 2 ? "off" : null, "Double Jump Ability"],
      ["fire", "Permanent fireball", o.permanent_fireball_ability === 1 ? t.has("Permanent Fireball Ability") : o.permanent_fireball_ability === 3 ? true : o.permanent_fireball_ability === 2 ? "off" : null, "Permanent Fireball Ability"],
      ["sparx", "Sparx health", o.enable_progressive_sparx_health ? t.count("Progressive Sparx Health Upgrade") : null, "Progressive Sparx Health Upgrade"],
      ["gem", "Sparx gem finder", o.sparx_gem_finder === 1 ? t.has("Sparx Gem Finder") : null, "Sparx Gem Finder"],
      ["heart", "Extra hit point", o.extra_hit_point ? t.has("Extra Hit Point") : null, "Extra Hit Point"]].filter(x => x[2] !== "off");
    const inv = m.byLevel.get("Inventory") || [];
    return `<div class="sp">${banner(t, m)}<div class="sp-stats">${tiles}</div>
      <section class="sp-panel"><h3>${icon("wings", 30)}Moves &amp; powers</h3><div class="sp-moves">${moves.map(([ic, label, v, item]) => {
        const on = v === true || (typeof v === "number" && v > 0), vanilla = v === null;
        return `<div class="sp-move ${ic}${on ? " on" : vanilla ? " vanilla" : ""}"${!on && !vanilla ? t.hint([item], label) : ""}>${icon(ic, 40)}<b>${label}</b><span>${vanilla ? "as in the game" : typeof v === "number" ? `level ${v}` : on ? "yours" : "not yet"}</span></div>`; }).join("")}</div></section>
      ${inv.length ? `<section class="sp-panel"><h3>${icon("gem", 30)}Across Avalar <small>${inv.filter(l => l.done).length} / ${inv.length} done${inv.some(l => l.ready) ? ` · ${inv.filter(l => l.ready).length} ready` : ""}</small></h3>${chips(inv, "")}</section>` : ""}
    </div>`;
  }

  /* ---------- Levels ---------- */
  function chips(list, lv){
    const groups = new Map(); for(const l of list) (groups.get(l.kind) || groups.set(l.kind, []).get(l.kind)).push(l);
    return `<div class="sp-groups">${[...groups].map(([k, l]) => {
      if(k === "GEM"){ const d = l.filter(x => x.done).length, r = l.filter(x => x.ready).length;
        return `<div class="sp-gemrow">${icon("gem", 22)}<b>Gems</b><span class="sp-meter"><i style="width:${d / l.length * 100}%"></i><i class="r" style="width:${r / l.length * 100}%"></i></span><small>${d} / ${l.length}${r ? `, ${r} ready` : ""}</small></div>`; }
      const [ic] = KIND[k] || ["orb"];
      return l.map(x => `<span class="sp-chip ${x.done ? "done" : x.ready ? "go" : "no"}" title="${esc(x.name)}">${icon(x.done ? "check" : ic, 18)}${esc(short(x.name, lv))}</span>`).join("");
    }).join("")}</div>`;
  }
  function renderLevels(t){
    const m = model(t);
    let html = `<div class="sp">${banner(t, m)}`;
    for(const [home, levels] of Object.entries(D.home)){
      html += `<section class="sp-world ${HOME_STYLE[home][1]}"><header>${icon(HOME_STYLE[home][0], 36)}<div><h3>${esc(home)}</h3></div></header><div class="sp-cards">`;
      for(const lv of [home, ...levels]){
        const l = m.byLevel.get(lv) || []; if(!l.length && !m.keyLocked.has(lv)) continue;
        const open = levelOpen(t, m, lv), d = l.filter(x => x.done).length, r = l.filter(x => x.ready).length;
        html += `<article class="sp-card${open ? "" : " shut"}${r ? " go" : ""}${l.length && d === l.length ? " full" : ""}" id="sp-${slugify(lv)}"><header>${icon(open ? (lv === home ? HOME_STYLE[home][0] : "portal") : "lock", 28)}<h4>${esc(lv)}</h4><span>${d} / ${l.length}${r ? ` · <b>${r} ready</b>` : ""}</span></header>
          ${open ? "" : `<p class="sp-need"${t.hint([lv + " Unlock"], lv)}>${icon("key", 18)}Needs <b>${esc(lv)} Unlock</b></p>`}${chips(l, lv)}</article>`;
      }
      html += `</div></section>`;
    }
    return html + `</div>`;
  }

  APTracker.register({
    game:"Spyro 2",
    slotData:true,
    async init(api){ [D, IC] = await Promise.all([api.json("data/s2.json"), api.json("data/icons.json")]); },
    tabs:[{ id:"sp-avalar", label:"Avalar", render:renderAvalar }, { id:"sp-collection", label:"Collection", render:renderCollection }, { id:"sp-levels", label:"Levels", render:renderLevels }],
    checksLabel:"All checks",
    locationGroup:n => { const p = n.split(": ")[0]; return D && (D.locs[n]?.[0] === "Inventory" && !Object.values(D.home).flat().includes(p) && !(p in D.home)) ? "Across Avalar" : p; },
    card(t){
      const m = model(t);
      return `${m.haveLogic ? `${m.ready} ready now` : `${m.left} checks left`} · ${t.count("Orb")} orbs · ${t.count("Summer Forest Talisman") + t.count("Autumn Plains Talisman")} talismans`;
    }
  });
})();
