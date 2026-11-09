/* Spyro 2: Ripto's Rage tracker (S2AP by Uroogla and contributors). Avalar at three times of year: each homeworld is a
   sky in its season's colours and every level is a portal ring that fills as you clear it.
   What's in logic comes from Archipelago itself: the relay rebuilds the player's world from slot data (options, key-locked
   levels and the seed's own gemsanity picks; relay/ap_logic.py fetches the world at the seed's version), so "ready now"
   is exact. Without that the tracker still shows everything, just without the "ready now" marks.
   Data: data/s2.json (levels, check kinds from the world), data/icons.json (drawn for this tracker). */
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

  /* ---------- Avalar ---------- */
  function portal(t, m, lv, home){
    const l = m.byLevel.get(lv) || [], done = l.filter(x => x.done).length, ready = l.filter(x => x.ready).length, open = levelOpen(t, m, lv);
    const p = l.length ? done / l.length : 0, full = l.length && done === l.length;
    const kind = /Speedway/.test(lv) ? "speedway" : /Dungeon|Overlook|Arena/.test(lv) ? "boss" : null;
    const st = !open ? "shut" : full ? "full" : ready ? "go" : "open";
    return `<li class="sp-portal ${st}${lv === home ? " home" : ""}"><a href="#sp-${slugify(lv)}" data-sp-jump${!open ? t.hint([lv + " Unlock"], lv) : ""}>
      <svg class="sp-ring" viewBox="0 0 80 80" aria-hidden="true"><circle class="bg" cx="40" cy="40" r="33"/><circle class="p" cx="40" cy="40" r="33" style="stroke-dasharray:${(p * 207.3).toFixed(1)} 210"/></svg>
      <span class="sp-core">${!open ? icon("lock", 26) : full ? icon("check", 26) : kind ? icon(kind, 26) : `<b>${ready || l.length - done}</b>`}</span></a>
      <strong>${esc(lv)}</strong><small>${!open ? "needs its key" : full ? "all done" : ready ? `${ready} ready` : l.length ? `${done} / ${l.length}` : "no checks"}</small></li>`;
  }
  function renderAvalar(t){
    const m = model(t), o = m.o, goal = GOALS[o.goal] || "Defeat Ripto";
    const tal = t.count("Summer Forest Talisman") + t.count("Autumn Plains Talisman"), orbs = t.count("Orb");
    let html = `<div class="sp">`;
    html += `<section class="sp-hero${t.goal ? " done" : t.logicGoal ? " go" : ""}"><div><small>Goal</small><h2>${esc(goal)}</h2>
        <p>${t.goal ? "Done. Avalar is saved!" : t.logicGoal ? "Everything you need for it is in logic." : m.haveLogic ? "Not in logic yet." : ""}</p></div>
      <div class="sp-big go">${m.haveLogic ? `<b>${m.ready}</b><span>ready right now</span>` : `<b>${m.left}</b><span>checks left</span>`}</div>
      <div class="sp-big"><b>${m.locs.length - m.left}<em>/${m.locs.length}</em></b><span>checks done</span></div>
      ${m.haveLogic ? "" : `<p class="sp-warn">"Ready now" needs exact logic on the server: run <code>tracker update</code> in the console.</p>`}</section>`;
    // collectibles
    const gemItems = t.items.reduce((n, it) => { const g = /^.+ (Red|Green|Blue|Gold|Pink) Gem$/.exec(it.name); return n + (g ? GEM_VALUE[g[1]] : / Gem Bundle$/.test(it.name) ? +(o.gemsanity_gem_bundle_size || 0) : 0); }, 0);
    const stats = [["talisman", tal, 14, "Talismans", ["Summer Forest Talisman", "Autumn Plains Talisman"]], ["orb", orbs, 64, "Orbs", ["Orb"], o.ripto_door_orbs ? `Ripto's door needs ${o.ripto_door_orbs}` : ""],
      ["skill", t.count("Skill Point"), 16, "Skill points", ["Skill Point"]], ["token", t.count("Dragon Shores Token"), 10, "Shores tokens", ["Dragon Shores Token"]]];
    if(o.enable_gemsanity) stats.push(["gem", gemItems, 10000, "Gems from items", []]);
    html += `<div class="sp-stats">${stats.filter(s => s[1] || t.itemNames.includes(s[4][0]) || s[0] === "talisman" || s[0] === "orb").map(([ic, n, of, label, items, note]) =>
      `<div class="sp-stat ${ic}"${n < of && items.length ? t.hint(items, label) : ""}>${icon(ic, 40)}<b>${n}<em>/${of}</em></b><span>${label}</span>${note ? `<small>${esc(note)}</small>` : ""}</div>`).join("")}</div>`;
    // abilities
    const ab = o.moneybags_settings === 2;   // moneybagssanity: the moves are items
    const moves = [["swim", "Swim", ab ? t.has("Moneybags Unlock - Swim") : null, "Moneybags Unlock - Swim"], ["climb", "Climb", ab ? t.has("Moneybags Unlock - Climb") : null, "Moneybags Unlock - Climb"],
      ["headbash", "Headbash", ab ? t.has("Moneybags Unlock - Headbash") : null, "Moneybags Unlock - Headbash"],
      ["wings", "Double jump", o.double_jump_ability === 1 ? t.has("Double Jump Ability") : o.double_jump_ability === 3 ? true : o.double_jump_ability === 2 ? "off" : null, "Double Jump Ability"],
      ["fire", "Permanent fireball", o.permanent_fireball_ability === 1 ? t.has("Permanent Fireball Ability") : o.permanent_fireball_ability === 3 ? true : o.permanent_fireball_ability === 2 ? "off" : null, "Permanent Fireball Ability"],
      ["sparx", "Sparx health", o.enable_progressive_sparx_health ? t.count("Progressive Sparx Health Upgrade") : null, "Progressive Sparx Health Upgrade"],
      ["gem", "Sparx gem finder", o.sparx_gem_finder === 1 ? t.has("Sparx Gem Finder") : null, "Sparx Gem Finder"],
      ["heart", "Extra hit point", o.extra_hit_point ? t.has("Extra Hit Point") : null, "Extra Hit Point"]].filter(x => x[2] !== "off");
    html += `<section class="sp-panel"><h3>${icon("wings", 30)}Moves &amp; powers</h3><div class="sp-moves">${moves.map(([ic, label, v, item]) => {
      const on = v === true || (typeof v === "number" && v > 0), vanilla = v === null;
      return `<div class="sp-move${on ? " on" : vanilla ? " vanilla" : ""}"${!on && !vanilla ? t.hint([item], label) : ""}>${icon(ic, 36)}<b>${label}</b><span>${vanilla ? "as in the game" : typeof v === "number" ? `level ${v}` : on ? "yours" : "not yet"}</span></div>`; }).join("")}</div></section>`;
    // the three worlds
    for(const [home, levels] of Object.entries(D.home)){
      const all = [home, ...levels].flatMap(lv => m.byLevel.get(lv) || []), ready = all.filter(l => l.ready).length, done = all.filter(l => l.done).length;
      html += `<section class="sp-world ${HOME_STYLE[home][1]}"><header>${icon(HOME_STYLE[home][0], 40)}<div><h3>${esc(home)}</h3><span>${done} / ${all.length} done${m.haveLogic && ready ? ` · <b>${ready} ready now</b>` : ""}</span></div></header>
        <ul class="sp-portals">${[home, ...levels].map(lv => portal(t, m, lv, home)).join("")}</ul></section>`;
    }
    const inv = m.byLevel.get("Inventory") || [];
    if(inv.length){ const d = inv.filter(l => l.done).length, r = inv.filter(l => l.ready).length;
      html += `<section class="sp-panel"><h3>${icon("gem", 30)}Across Avalar <small>${d} / ${inv.length} done${r ? ` · ${r} ready` : ""}</small></h3>${chips(inv, "")}</section>`; }
    return html + `</div>`;
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
    let html = `<div class="sp">`;
    for(const [home, levels] of Object.entries(D.home)){
      html += `<section class="sp-world ${HOME_STYLE[home][1]} flat"><header>${icon(HOME_STYLE[home][0], 36)}<div><h3>${esc(home)}</h3></div></header><div class="sp-cards">`;
      for(const lv of [home, ...levels]){
        const l = m.byLevel.get(lv) || []; if(!l.length && !m.keyLocked.has(lv)) continue;
        const open = levelOpen(t, m, lv), d = l.filter(x => x.done).length, r = l.filter(x => x.ready).length;
        html += `<article class="sp-card${open ? "" : " shut"}${r ? " go" : ""}" id="sp-${slugify(lv)}"><header>${icon(open ? (lv === home ? HOME_STYLE[home][0] : "portal") : "lock", 28)}<h4>${esc(lv)}</h4><span>${d} / ${l.length}${r ? ` · <b>${r} ready</b>` : ""}</span></header>
          ${open ? "" : `<p class="sp-need"${t.hint([lv + " Unlock"], lv)}>${icon("key", 18)}Needs <b>${esc(lv)} Unlock</b></p>`}${chips(l, lv)}</article>`;
      }
      html += `</div></section>`;
    }
    return html + `</div>`;
  }

  document.addEventListener("click", e => {
    const a = e.target.closest("[data-sp-jump]"); if(!a || a.hasAttribute("data-hint")) return;
    e.preventDefault(); const id = a.getAttribute("href").slice(1);
    document.querySelector('[data-tab="sp-levels"]')?.click();
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior:"smooth", block:"start" }), 120);
  });

  APTracker.register({
    game:"Spyro 2",
    slotData:true,
    async init(api){ [D, IC] = await Promise.all([api.json("data/s2.json"), api.json("data/icons.json")]); },
    tabs:[{ id:"sp-avalar", label:"Avalar", render:renderAvalar }, { id:"sp-levels", label:"Levels", render:renderLevels }],
    checksLabel:"All checks",
    locationGroup:n => { const p = n.split(": ")[0]; return D && (D.locs[n]?.[0] === "Inventory" && !Object.values(D.home).flat().includes(p) && !(p in D.home)) ? "Across Avalar" : p; },
    card(t){
      const m = model(t);
      return `${m.haveLogic ? `${m.ready} ready now` : `${m.left} checks left`} · ${t.count("Orb")} orbs · ${t.count("Summer Forest Talisman") + t.count("Autumn Plains Talisman")} talismans`;
    }
  });
})();
