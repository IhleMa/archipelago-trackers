/* StarCraft II tracker (Archipelago's "Starcraft 2" world, 0.6.x).
   Missions: the seed's mission order drawn as the client's mission map, each mission open, locked or beaten exactly
   as the SC2 client works it out from the entry rules in slot data (beat these missions, beat N of them, find these
   keys), with its checks. Army: every unit as a card in its race's colour with its upgrades as pips, weapon and armour
   levels, Kerrigan, Nova, the Spear of Adun and general upgrades.
   Data: data/sc2.json (missions and items from the world), data/icons.json (glyphs drawn for this tracker). */
(() => {
  const esc = APTracker.esc;
  let D = null, IC = {};
  const RACE = { T:"Terran", Z:"Zerg", P:"Protoss", A:"Any race" };

  /* ---------- glyphs ---------- */
  const glyph = (k, cls, size) => { const g = IC[k] || IC.A;
    return `<svg class="s2-g ${cls || ""}" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><path class="s" d="${g.s}" fill-rule="evenodd"/><path class="d" d="${g.d}"/></svg>`; };

  /* ---------- missions and locations ---------- */
  const missionOfLoc = id => { const L = D.loc; return id < L.hots ? Math.floor((id - L.wol) / L.mod) : Math.floor((id - (L.hots - L.allin * L.mod)) / L.mod); };
  const victoryLoc = m => { const L = D.loc; return (m <= L.allin ? L.wol : L.hots - L.allin * L.mod) + m * L.mod; };
  const mName = m => (D.missions[m] || [`Mission ${m}`])[0];
  const mRace = m => (D.missions[m] || [0, 0, "A"])[2];

  /* Entry rules, as the client reads them (mission_order/entry_rules.py). */
  function ruleOK(r, beaten, recv){
    if(!r) return true;
    if(r.sub_rules){ if(r.amount <= 0) return true; let n = 0; for(const x of r.sub_rules) if(ruleOK(x, beaten, recv) && ++n >= r.amount) return true; return false; }
    if(r.item_ids) return Object.entries(r.item_ids).every(([id, n]) => (recv.get(+id) || 0) >= n);
    if(r.amount != null) return r.mission_ids.filter(m => beaten.has(m)).length >= r.amount;
    return r.mission_ids.every(m => beaten.has(m));
  }
  /* Which missions are open: the client's calc_available_nodes. */
  function available(mo, beaten, recv){
    const objs = [], parents = [];
    for(const c of mo){ objs.push(c); parents.push([]);
      for(const l of c.layouts){ objs.push(l); parents.push([c]);
        for(const col of l.missions) for(const m of col){ if(m.mission_id === -1) continue; objs.push(m); parents.push([c, l]); } } }
    let cand = objs.map((o, i) => i).filter(i => ruleOK(objs[i].entry_rule, beaten, recv));
    const acc = new Set();
    for(;;){
      const ba = new Set([...acc].filter(i => objs[i].mission_id != null && beaten.has(objs[i].mission_id)).map(i => objs[i].mission_id));
      const add = cand.filter(i => ruleOK(objs[i].entry_rule, ba, recv) && parents[i].every(p => ruleOK(p.entry_rule, ba, recv)));
      if(!add.length) break;
      add.forEach(i => acc.add(i)); cand = cand.filter(i => !acc.has(i));
    }
    return new Set([...acc].filter(i => objs[i].mission_id != null).map(i => objs[i].mission_id));
  }
  /* A readable reason a mission is locked, and the key items that would open it. */
  function why(r, beaten, recv, out){
    if(!r || ruleOK(r, beaten, recv)) return out;
    if(r.sub_rules){ for(const x of r.sub_rules) why(x, beaten, recv, out); return out; }
    const label = v => typeof v === "number" ? mName(v) : v;
    if(r.item_ids){ out.text.push("Find " + r.visual_reqs.join(", ")); out.items.push(...r.visual_reqs); return out; }
    if(r.amount != null){ const have = r.mission_ids.filter(m => beaten.has(m)).length;
      out.text.push(`Beat ${r.amount === r.mission_ids.length ? "all" : r.amount} of ${r.visual_reqs.map(label).join(", ")} (${have} done)`); return out; }
    out.text.push("Beat " + r.visual_reqs.map(label).join(", "));
    return out;
  }

  const cache = new Map();
  function compute(t){
    const key = t.slot + "|" + t.items.length + "|" + t.checked.length;
    if(cache.has(key)) return cache.get(key);
    const sd = t.slotData || {}, mo = Array.isArray(sd.custom_mission_order) ? sd.custom_mission_order : [];
    const done = new Set(t.locations.filter(l => l.done).map(l => l.id));
    const beaten = new Set(); const byMission = new Map();
    for(const l of t.locations){ const m = missionOfLoc(l.id); if(!byMission.has(m)) byMission.set(m, []); byMission.get(m).push(l); }
    for(const m of byMission.keys()) if(done.has(victoryLoc(m))) beaten.add(m);
    const recv = new Map(); for(const it of t.items) recv.set(it.id, (recv.get(it.id) || 0) + 1);
    const open = available(mo, beaten, recv);
    const all = []; for(const c of mo) for(const l of c.layouts) for(const col of l.missions) for(const m of col) if(m.mission_id !== -1) all.push(m.mission_id);
    const finals = new Set(sd.final_mission_ids || []);
    const S = { sd, mo, beaten, recv, open, byMission, all, finals };
    cache.set(key, S); if(cache.size > 30) cache.delete(cache.keys().next().value);
    return S;
  }

  /* ---------- missions tab ---------- */
  function tile(t, S, ms, x, y, W, H){
    const m = ms.mission_id, locs = S.byMission.get(m) || [], n = locs.filter(l => l.done).length;
    const st = S.beaten.has(m) ? (n === locs.length ? "clear" : "won") : S.open.has(m) ? "open" : "shut";
    const race = mRace(m), fin = S.finals.has(m);
    let tip = `${mName(m)} (${RACE[race]})\n${n} of ${locs.length} checks`;
    let hint = "";
    if(st === "shut"){
      const w = why(ms.entry_rule, S.beaten, S.recv, { text:[], items:[] });
      if(w.text.length) tip += "\nLocked: " + w.text.join("; ");
      if(w.items.length) hint = t.hint(w.items, w.items[0]);
    } else if(n < locs.length){
      const left = locs.filter(l => !l.done).map(l => l.name);
      tip += "\nStill to do: " + left.map(n => n.split(": ").slice(1).join(": ") || n).join(", ");
    }
    const p = locs.length ? n / locs.length : 0, R = 30, C = 2 * Math.PI * R;
    return `<div class="s2-m ${st} r${race}${fin ? " final" : ""}" style="left:${x}px;top:${y}px;width:${W}px"${st === "shut" ? hint : ""} title="${esc(tip)}">
      <div class="s2-hex"><svg class="s2-ring" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="${R}"/><circle class="v" cx="36" cy="36" r="${R}" stroke-dasharray="${(p * C).toFixed(1)} ${C.toFixed(1)}"/></svg>
        ${glyph(race, "r" + race, 30)}${fin ? `<span class="s2-crown" aria-label="final mission"></span>` : ""}</div>
      <span class="s2-mn">${esc(mName(m))}</span><span class="s2-mc">${n}/${locs.length}</span></div>`;
  }
  function layoutHtml(t, S, L){
    let cols = L.missions.filter(c => c.some(m => m.mission_id !== -1));
    const flat = cols.length === 1;   // a single chain reads better left to right
    const W = 116, H = 112, pos = new Map(); let maxR = 0, maxC = 0, tiles = "";
    cols.forEach((col, ci) => col.forEach((ms, ri) => { if(ms.mission_id === -1) return;
      const c = flat ? ri : ci, r = flat ? 0 : ri; maxC = Math.max(maxC, c); maxR = Math.max(maxR, r);
      pos.set(ms.mission_id, [c * W, r * H]); }));
    let lines = "";
    for(const col of cols) for(const ms of col){ if(ms.mission_id === -1) continue; const b = pos.get(ms.mission_id);
      for(const p of ms.prev_mission_ids || []){ const a = pos.get(p); if(!a) continue;
        const lit = S.beaten.has(p) ? " lit" : "";
        lines += `<line class="${lit}" x1="${a[0] + W / 2}" y1="${a[1] + 38}" x2="${b[0] + W / 2}" y2="${b[1] + 38}"/>`; } }
    for(const col of cols) for(const ms of col){ if(ms.mission_id === -1) continue; const [x, y] = pos.get(ms.mission_id); tiles += tile(t, S, ms, x, y, W, H); }
    const w = (maxC + 1) * W, h = (maxR + 1) * H;
    const won = cols.flat().filter(m => m.mission_id !== -1 && S.beaten.has(m.mission_id)).length, tot = cols.flat().filter(m => m.mission_id !== -1).length;
    return `<section class="s2-layout"><header><h4>${esc(L.name || "Missions")}</h4><span>${won} / ${tot}</span></header>
      <div class="s2-grid" style="width:${w}px;height:${h}px"><svg class="s2-links" width="${w}" height="${h}" aria-hidden="true">${lines}</svg>${tiles}</div></section>`;
  }
  function renderMissions(t){
    const S = compute(t);
    if(!S.mo.length) return `<div class="s2"><p class="s2-dim">This seed's slot data has no mission order (it needs the 0.6 StarCraft II world).</p></div>`;
    const next = S.all.filter(m => S.open.has(m) && !S.beaten.has(m));
    const left = S.all.filter(m => S.open.has(m)).reduce((a, m) => a + (S.byMission.get(m) || []).filter(l => !l.done).length, 0);
    const goal = [...S.finals].map(m => `${S.beaten.has(m) ? "✓ " : ""}${mName(m)}`).join(", ");
    let html = `<div class="s2"><div class="s2-hud">
      <div class="s2-stat"><b>${S.all.filter(m => S.beaten.has(m)).length}<em>/${S.all.length}</em></b><span>missions won</span></div>
      <div class="s2-stat"><b>${next.length}</b><span>open to play</span></div>
      <div class="s2-stat"><b>${left}</b><span>checks in open missions</span></div>
      <div class="s2-stat goal${t.goal ? " done" : ""}"><b class="s2-goal">${esc(goal || "–")}</b><span>${t.goal ? "goal complete" : "to win"}</span></div></div>
      <div class="s2-legend"><span><i class="open"></i>Open</span><span><i class="won"></i>Won, checks left</span><span><i class="clear"></i>Cleared</span><span><i class="shut"></i>Locked (hover for why, click for a key hint)</span></div>`;
    for(const c of S.mo){
      if(c.name) html += `<h3 class="s2-camp">${esc(c.name)}</h3>`;
      html += `<div class="s2-layouts">${c.layouts.map(L => layoutHtml(t, S, L)).join("")}</div>`;
    }
    return html + `</div>`;
  }

  /* ---------- army tab ---------- */
  const GROUPS = { T:[["barracks", "Barracks"], ["factory", "Factory"], ["starport", "Starport"], ["tmerc", "Mercenaries"]],
    Z:[["zground", "Ground strains"], ["zair", "Air strains"], ["zmorph", "Morphs"], ["zmerc", "Mercenaries"]],
    P:[["gateway", "Gateway"], ["robo", "Robotics"], ["stargate", "Stargate"]] };
  const UPG = {
    T:[["Infantry Weapon", ["Infantry Weapon", "Infantry Upgrade", "Weapon Upgrade", "Weapon/Armor Upgrade"]], ["Infantry Armor", ["Infantry Armor", "Infantry Upgrade", "Armor Upgrade", "Weapon/Armor Upgrade"]],
       ["Vehicle Weapon", ["Vehicle Weapon", "Vehicle Upgrade", "Weapon Upgrade", "Weapon/Armor Upgrade"]], ["Vehicle Armor", ["Vehicle Armor", "Vehicle Upgrade", "Armor Upgrade", "Weapon/Armor Upgrade"]],
       ["Ship Weapon", ["Ship Weapon", "Ship Upgrade", "Weapon Upgrade", "Weapon/Armor Upgrade"]], ["Ship Armor", ["Ship Armor", "Ship Upgrade", "Armor Upgrade", "Weapon/Armor Upgrade"]]],
    Z:[["Melee Attack", ["Melee Attack", "Ground Upgrade", "Weapon Upgrade", "Weapon/Armor Upgrade"]], ["Missile Attack", ["Missile Attack", "Ground Upgrade", "Weapon Upgrade", "Weapon/Armor Upgrade"]],
       ["Ground Carapace", ["Ground Carapace", "Ground Upgrade", "Armor Upgrade", "Weapon/Armor Upgrade"]], ["Flyer Attack", ["Flyer Attack", "Flyer Upgrade", "Weapon Upgrade", "Weapon/Armor Upgrade"]],
       ["Flyer Carapace", ["Flyer Carapace", "Flyer Upgrade", "Armor Upgrade", "Weapon/Armor Upgrade"]]],
    P:[["Ground Weapon", ["Ground Weapon", "Ground Upgrade", "Weapon Upgrade", "Weapon/Armor Upgrade"]], ["Ground Armor", ["Ground Armor", "Ground Upgrade", "Armor Upgrade", "Weapon/Armor Upgrade"]],
       ["Shields", ["Shields", "Ground Upgrade", "Air Upgrade", "Armor Upgrade", "Weapon/Armor Upgrade"]], ["Air Weapon", ["Air Weapon", "Air Upgrade", "Weapon Upgrade", "Weapon/Armor Upgrade"]],
       ["Air Armor", ["Air Armor", "Air Upgrade", "Armor Upgrade", "Weapon/Armor Upgrade"]]] };
  function upgradeRows(t, race, max){
    const word = RACE[race];
    return UPG[race].map(([label, parts]) => {
      const names = parts.map(p => `Progressive ${word} ${p}`).filter(n => D.items[n]);
      const lv = Math.min(max, names.reduce((a, n) => a + t.count(n), 0));
      return `<li${t.hint(names, label)}><span>${esc(label)}</span><span class="s2-lv">${Array.from({ length:max }, (_, i) => `<i class="${i < lv ? "on" : ""}"></i>`).join("")}</span><b>${lv}</b></li>`;
    }).join("");
  }
  function unitCard(t, race, name, group){
    const kids = Object.entries(D.items).filter(([, e]) => e[2] === name);
    const total = kids.reduce((a, [, e]) => a + Math.max(1, e[4]), 0), got = kids.reduce((a, [n, e]) => a + Math.min(Math.max(1, e[4]), t.count(n)), 0);
    const have = t.has(name);
    const missing = kids.filter(([n, e]) => t.count(n) < Math.max(1, e[4])).map(([n]) => n);
    const tip = `${name}${have ? "" : " (not unlocked)"}${kids.length ? `\nUpgrades ${got}/${total}:\n` + kids.map(([n, e]) => `${t.count(n) ? "■" : "□"} ${n.replace(/ \(.*\)$/, "")}${e[4] > 1 ? ` ${Math.min(t.count(n), e[4])}/${e[4]}` : ""}`).join("\n") : ""}`;
    const names = have ? missing : [name];
    return `<li class="s2-u r${race}${have ? " on" : ""}"${names.length ? t.hint(names, have ? `${name} upgrades` : name) : ""} title="${esc(tip)}">
      ${glyph(group, "r" + race, 34)}<span class="s2-un">${esc(name)}</span>
      ${total ? `<span class="s2-pips">${Array.from({ length:Math.min(total, 12) }, (_, i) => `<i class="${i < got ? "on" : ""}"></i>`).join("")}${total > 12 ? `<em>+${total - 12}</em>` : ""}</span>` : ""}</li>`;
  }
  function chips(t, list, race, kind){
    return `<ul class="s2-chips">${list.map(n => { const e = D.items[n] || [], q = Math.max(1, e[4] || 1), c = t.count(n);
      return `<li class="r${race}${c ? " on" : ""}"${c < q ? t.hint([n], n) : ""} title="${esc(n)}">${glyph(kind, "r" + race, 18)}<span>${esc(n.replace(/ \((Kerrigan|Nova|Spear of Adun|Nova Equipment|Nova Ability|Nova Suit Module|Nova Weapon|Nova Gadget)[^)]*\)$/, "").replace(/ \(Kerrigan (Ability|Passive)\)$/, ""))}</span>${q > 1 ? `<em>${Math.min(c, q)}/${q}</em>` : ""}</li>`; }).join("")}</ul>`;
  }
  function renderArmy(t){
    const S = compute(t), sd = S.sd, max = sd.max_upgrade_level || 3;
    const races = new Set(S.all.map(mRace).filter(r => r !== "A"));
    for(const it of t.items){ const e = D.items[it.name]; if(e && e[0] !== "A") races.add(e[0]); }
    if(!races.size) ["T", "Z", "P"].forEach(r => races.add(r));
    let html = `<div class="s2">`;
    // resources and general
    const res = [["minerals", "Starting minerals", "Additional Starting Minerals", sd.minerals_per_item || 25], ["minerals", "Starting vespene", "Additional Starting Vespene", sd.vespene_per_item || 25],
      ["supply", "Starting supply", "Additional Starting Supply", sd.starting_supply_per_item || 2]];
    html += `<div class="s2-hud">${res.map(([g, l, n, per]) => `<div class="s2-stat"${t.hint([n], n)}>${glyph(g, "rA", 26)}<b>+${t.count(n) * per}</b><span>${l}</span></div>`).join("")}
      <div class="s2-stat">${glyph("upgrade", "rA", 26)}<b>${max}</b><span>max upgrade level</span></div></div>`;
    for(const race of ["T", "Z", "P"].filter(r => races.has(r))){
      html += `<section class="s2-race r${race}"><header>${glyph(race, "r" + race, 34)}<h3>${RACE[race]}</h3></header>`;
      html += `<div class="s2-cols"><div>`;
      for(const [g, label] of GROUPS[race]){
        const morphs = new Set(D.groups.zmorph || []);
        const units = (D.groups[g] || []).filter(n => D.items[n] && D.items[n][0] === race && (g === "zmorph" || !morphs.has(n)));   // morphs only under Morphs
        if(!units.length) continue;
        const own = units.filter(n => t.has(n)).length;
        html += `<h4>${esc(label)}<small>${own} / ${units.length}</small></h4><ul class="s2-units">${units.map(n => unitCard(t, race, n, g)).join("")}</ul>`;
      }
      html += `</div><aside><h4>Weapons & armour</h4><ul class="s2-upg">${upgradeRows(t, race, max)}</ul>`;
      const unitSet = new Set(Object.values(D.groups).flat());
      const general = Object.entries(D.items).filter(([n, e]) => e[0] === race && !unitSet.has(n) && !e[2] && !/Progressive (Terran|Zerg|Protoss) /.test(n)
        && !["Level", "Ability", "Nova_Gear", "Spear_Of_Adun", "Primal_Form", "Unit", "Unit_2", "Mercenary", "Morph"].includes(e[1])
        && !(D.special.kerrigan.includes(n) || D.special.nova.includes(n) || D.special.soa_active.includes(n) || D.special.soa_passive.includes(n))).map(([n]) => n);
      if(general.length) html += `<h4>Structures & general<small>${general.filter(n => t.has(n)).length} / ${general.length}</small></h4>${chips(t, general, race, "building")}`;
      html += `</aside></div>`;
      if(race === "Z" && sd.kerrigan_presence !== 2){
        const lvItems = Object.entries(D.items).filter(([, e]) => e[1] === "Level").reduce((a, [n, e]) => a + t.count(n) * Math.max(1, e[3]), 0);
        const per = sd.kerrigan_levels_per_mission_completed || 0, capM = sd.kerrigan_levels_per_mission_completed_cap ?? -1, capT = sd.kerrigan_total_level_cap ?? -1;
        let fromM = S.beaten.size * per; if(capM !== -1) fromM = Math.min(fromM, capM);
        let lv = lvItems + fromM; if(capT !== -1) lv = Math.min(lv, capT);
        html += `<div class="s2-hero rZ"><div class="s2-heroh">${glyph("kerrigan", "rZ", 40)}<div><h4>Kerrigan</h4><span>Level <b>${lv}</b>${per ? ` (${lvItems} from items, ${fromM} from missions)` : ""}${t.has("Kerrigan Primal Form") ? " · Primal Form" : ""}</span></div></div>${chips(t, D.special.kerrigan.filter(n => D.items[n]), "Z", "kerrigan")}</div>`;
      }
      if(race === "T"){
        const nova = D.special.nova.filter(n => D.items[n]);
        if(nova.length) html += `<div class="s2-hero rT"><div class="s2-heroh">${glyph("nova", "rT", 40)}<div><h4>Nova</h4><span>${nova.filter(n => t.has(n)).length} of ${nova.length} pieces of equipment</span></div></div>${chips(t, nova, "T", "nova")}</div>`;
      }
      if(race === "P" && sd.spear_of_adun_presence !== 0){
        const soa = [...D.special.soa_active, ...D.special.soa_passive].filter(n => D.items[n]);
        html += `<div class="s2-hero rP"><div class="s2-heroh">${glyph("soa", "rP", 40)}<div><h4>Spear of Adun</h4><span>${soa.filter(n => t.has(n)).length} of ${soa.length} calldowns and passives</span></div></div>${chips(t, soa, "P", "soa")}</div>`;
      }
      html += `</section>`;
    }
    return html + `</div>`;
  }

  APTracker.register({
    game:"Starcraft 2",
    slotData:true,
    async init(api){ [D, IC] = await Promise.all([api.json("data/sc2.json"), api.json("data/icons.json")]); },
    tabs:[{ id:"s2-missions", label:"Missions", render:renderMissions }, { id:"s2-army", label:"Army", render:renderArmy }],
    checksLabel:"Checks by mission",
    locationGroup:n => n.split(": ")[0],
    _compute:t => compute(t),   // lets a test compare mission availability with the client's
    card(t){
      const S = compute(t), won = S.all.filter(m => S.beaten.has(m)).length, open = S.all.filter(m => S.open.has(m) && !S.beaten.has(m)).length;
      return `${won}/${S.all.length} missions won · ${open} open`;
    }
  });
})();
