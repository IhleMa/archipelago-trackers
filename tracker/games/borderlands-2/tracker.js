/* Borderlands 2 tracker (Bouncy Loot God by EdricY): a cel-shaded comic page. Ink outlines, halftone dots,
   loot rarity colours as information.
   What's in logic comes from Archipelago itself: the relay rebuilds the player's world from slot data and asks it
   (relay/ap_logic.py fetches the world at the seed's version), so "ready now" is exact. Without that the tracker
   still shows everything, just without the "ready now" marks.
   Data: data/bl2.json (regions, location kinds and areas from the world), data/icons.json (drawn for this tracker). */
(() => {
  const esc = APTracker.esc;
  let D = null, IC = {};
  const RARITY = [["Common", "#f4f1e6"], ["Uncommon", "#5fd45f"], ["Rare", "#3f8cff"], ["VeryRare", "#a855f7"], ["E-Tech", "#ff5fd2"], ["Legendary", "#ff9a1f"],
    ["Seraph", "#ff4f8b"], ["Rainbow", "rainbow"], ["Pearlescent", "#57e6e6"], ["Unique", "#ffe14f"]];
  const GEAR = [["Pistol", "Pistols"], ["Shotgun", "Shotguns"], ["SMG", "SMGs"], ["SniperRifle", "Snipers"], ["AssaultRifle", "Assault rifles"], ["RocketLauncher", "Launchers"],
    ["Shield", "Shields"], ["GrenadeMod", "Grenade mods"], ["ClassMod", "Class mods"], ["Relic", "Relics"]];
  const KIND = { "Quests":"quest", "Named enemies":"skull", "Chests":"chest", "Vending machines":"vending", "Vault symbols":"symbol", "Challenges":"challenge",
    "Gear":"gear", "Mobs":"mobs", "Levels":"level", "Other":"target" };
  const DLC = [["basegame", "Pandora, the story"], ["basegame_side", "Off the beaten path"], ["digi", "Digistruct Peak"], ["tina", "Tiny Tina's Assault on Dragon Keep"],
    ["torgue", "Mr. Torgue's Campaign of Carnage"], ["scarlett", "Captain Scarlett and Her Pirate's Booty"], ["hammerlock", "Sir Hammerlock's Big Game Hunt"],
    ["ffs", "Commander Lilith & the Fight for Sanctuary"], ["headhunter", "Headhunter packs"]];
  const PROG_TRAVEL = { basegame:"Base Game", basegame_side:"Side Area", ffs:"Fight For Sanctuary DLC", tina:"Tina DLC", torgue:"Torgue DLC", scarlett:"Scarlett DLC",
    hammerlock:"Hammerlock DLC", headhunter:"Headhunters" };
  const SHORT = { Common:"Com", Uncommon:"Unc", Rare:"Rare", VeryRare:"V.rare", "E-Tech":"E-Tech", Legendary:"Leg", Seraph:"Ser", Rainbow:"Rnbw", Pearlescent:"Pearl", Unique:"Uniq" };
  const rarityName = r => r === "VeryRare" ? "Very rare" : r;

  const icon = (k, size, fill, cls) => { const g = IC[k] || IC.target;
    return `<svg class="bl-i ${cls || ""}" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><path class="s" d="${g.s}" fill-rule="evenodd"${fill ? ` style="fill:${fill}"` : ""}/>${g.d ? `<path class="d" d="${g.d}"/>` : ""}</svg>`; };

  /* ---------- the slot ---------- */
  const cache = new Map();
  function model(t){
    const key = t.slot + "|" + t.items.length + "|" + t.checked.length + "|" + (t.inLogic ? t.inLogic.size : -1);
    if(cache.has(key)) return cache.get(key);
    const logic = t.inLogic, haveLogic = !!logic;
    const locs = t.locations.map(l => { const d = D.locs[l.name] || ["", "Other", null];
      return { id:l.id, name:l.name, done:l.done, region:d[0], kind:d[1], level:d[2], ready:!l.done && haveLogic && logic.has(l.id) }; });
    const byId = new Map(locs.map(l => [l.id, l]));
    const goals = (t.slotData.goals || []).map(raw => byId.get(raw + D.base) || { name:`Goal ${raw}`, done:false, ready:false });
    const m = { locs, byId, goals, haveLogic, ready:locs.filter(l => l.ready).length, left:locs.filter(l => !l.done).length };
    cache.set(key, m); if(cache.size > 30) cache.delete(cache.keys().next().value);
    return m;
  }
  const pretty = n => n.replace(/^(Enemy|Quest): /, "").replace(/^(Chest|Symbol|Vending) [A-Za-z]+: /, "").replace(/^Challenge [A-Za-z]+: /, "").replace(/^Generic: /, "");

  /* ---------- Vault Hunter ---------- */
  function renderHunter(t){
    const m = model(t), sd = t.slotData;
    let html = `<div class="bl">`;
    // the boss intro
    const g = m.goals[0], allDone = t.goal || (m.goals.length && m.goals.every(x => x.done));
    html += `<section class="bl-boss${allDone ? " done" : t.logicGoal ? " go" : ""}"><div class="bl-burst">${icon(allDone ? "check" : "skull", 74)}</div>
      <div><small>${m.goals.length > 1 ? "Your targets" : "Your target"}</small><h2>${m.goals.length ? m.goals.map(x => esc(pretty(x.name))).join(" · ") : "Unknown"}</h2>
      <p>${allDone ? "Goal complete. Loot the bodies." : t.logicGoal ? "Everything you need is in logic. Go get 'em." : m.haveLogic ? "Not in logic yet. Keep looting." : "&nbsp;"}</p></div></section>`;
    html += `<div class="bl-stats"><div class="bl-stat go">${m.haveLogic ? `<b>${m.ready}</b><span>checks you can do right now</span>` : `<b>${m.left}</b><span>checks left</span><em>"Ready now" needs exact logic on the server: run <code>tracker update</code> in the console.</em>`}</div>
      <div class="bl-stat"><b>${m.locs.length - m.left}<em>/${m.locs.length}</em></b><span>checks done</span><i class="bl-bar"><i style="width:${m.locs.length ? (1 - m.left / m.locs.length) * 100 : 0}%"></i></i></div></div>`;
    // abilities
    const ab = [["melee", "Melee", t.has("Melee")], ["crouch", "Crouch", t.has("Crouch")], ["vehicle", "Vehicle fire", t.has("Vehicle Fire")],
      ["jump", "Jump", t.count("Progressive Jump"), "Progressive Jump"], ["sprint", "Sprint", t.count("Progressive Sprint"), "Progressive Sprint"],
      ["slot", "Weapon slots", t.count("Progressive Weapon Slot"), "Progressive Weapon Slot"], ["money", "Money cap", t.count("Progressive Money Cap"), "Progressive Money Cap"],
      ["skill", "Skill points", (t.count("3 Skill Points (p)") + t.count("3 Skill Points")) * 3, null], ["backpack", "Backpack", t.has("Infinite Backpack") ? "∞" : t.count("Backpack Upgrade"), null]];
    html += `<section class="bl-panel"><h3>${icon("skill", 30, "#ffd23f")}Moves &amp; upgrades</h3><div class="bl-abil">${ab.map(([ic, label, v, item]) => {
      const on = v === true || (typeof v === "number" && v > 0) || v === "∞", hintName = item || (v === false ? { melee:"Melee", crouch:"Crouch", vehicle:"Vehicle Fire" }[ic] : null);
      return `<div class="bl-ab${on ? " on" : ""}"${hintName && (!on || item) ? t.hint([hintName], label) : ""}>${icon(ic, 40, on ? "#ffd23f" : null)}<b>${label}</b><span>${v === true ? "unlocked" : v === false ? "locked" : v === "∞" ? "infinite" : label === "Skill points" ? `+${v}` : `×${v}`}</span></div>`; }).join("")}</div></section>`;
    // ready by kind
    const kinds = [...new Set(m.locs.map(l => l.kind))].sort((a, b) => Object.keys(KIND).indexOf(a) - Object.keys(KIND).indexOf(b));
    html += `<section class="bl-panel"><h3>${icon("target", 30, "#2fe0e0")}Ready to loot <small>${m.haveLogic ? "in logic now, out of what's left" : "left to do"}</small></h3><div class="bl-kinds">${kinds.map(k => {
      const l = m.locs.filter(x => x.kind === k), left = l.filter(x => !x.done).length, r = l.filter(x => x.ready).length;
      return `<div class="bl-kind${r ? " go" : ""}${!left ? " full" : ""}">${icon(KIND[k] || "target", 36, r ? "#5fd45f" : !left ? "#ffd23f" : null)}<b>${m.haveLogic ? r : left}</b><span>${esc(k)}</span><small>${l.length - left} / ${l.length}</small></div>`; }).join("")}</div></section>`;
    // progressive travel groups
    const groups = (sd.progressive_travel_groups || []).map(gn => [gn, `Progressive Travel: ${PROG_TRAVEL[gn] || gn}`]).filter(([, n]) => t.itemNames.includes(n));
    if(groups.length) html += `<section class="bl-panel"><h3>${icon("travel", 30, "#ff9a1f")}Progressive travel</h3><div class="bl-chips">${groups.map(([, n]) => `<span class="${t.has(n) ? "on" : ""}"${t.hint([n], n)}>${esc(n.replace("Progressive Travel: ", ""))} <b>×${t.count(n)}</b></span>`).join("")}</div></section>`;
    return html + `</div>`;
  }

  /* ---------- Loot ---------- */
  function renderLoot(t){
    const m = model(t), lic = +(t.slotData.gear_licenses ?? 1) > 0, have = new Set(D.gear), found = new Map(m.locs.filter(l => l.kind === "Gear").map(l => [l.name, l]));
    const cols = RARITY.filter(([r]) => GEAR.some(([g]) => have.has(`${r} ${g}`)));
    let html = `<div class="bl"><section class="bl-panel bl-loot"><h3>${icon("gear", 30, "#ff9a1f")}Gear licenses <small>${lic ? "you can only use gear you hold the license for" : "licenses are off in this seed: the grid shows the \"found\" checks"}</small></h3>
      <div class="bl-grid" style="--cols:${cols.length}"><div class="bl-corner"></div>${cols.map(([r, c]) => `<div class="bl-col" style="--r:${c === "rainbow" ? "#ff9a1f" : c}"${c === "rainbow" ? ' data-rainbow=""' : ""}><span class="l">${rarityName(r)}</span><span class="sh">${SHORT[r] || r}</span></div>`).join("")}
      ${GEAR.map(([g, label]) => `<div class="bl-row">${icon(g, 30, "#f4f1e6")}<span>${label}</span></div>${cols.map(([r, c]) => {
        const name = `${r} ${g}`; if(!have.has(name)) return `<div class="bl-cell none"></div>`;
        const own = lic && t.has("License: " + name), f = found.get(name + " Found");
        const st = f ? (f.done ? "done" : f.ready ? "go" : "no") : "";
        return `<div class="bl-cell${own ? " own" : ""}${!lic ? " own" : ""} ${st}"${lic && !own ? t.hint(["License: " + name], `${rarityName(r)} ${label}`) : ""} title="${esc(`${rarityName(r)} ${g}`)}${lic ? (own ? ": license held" : ": no license yet") : ""}${f ? `\n"${f.name}": ${f.done ? "found" : f.ready ? "ready now" : "not yet"}` : ""}"${c === "rainbow" ? ' data-rainbow=""' : ""} style="--r:${c === "rainbow" ? "#ff9a1f" : c}">${icon(g, 30)}${f ? `<i class="bl-dot"></i>` : ""}</div>`; }).join("")}`).join("")}</div>
      <p class="bl-note"><i class="bl-dot go"></i> "found" check ready now <i class="bl-dot done"></i> found <i class="bl-dot"></i> not yet</p></section></div>`;
    return html;
  }

  /* ---------- Pandora ---------- */
  function renderMap(t){
    const m = model(t), byRegion = new Map();
    for(const l of m.locs) (byRegion.get(l.region) || byRegion.set(l.region, []).get(l.region)).push(l);
    let html = `<div class="bl">`;
    for(const [grp, title] of DLC){
      const regs = D.regions.filter(r => r[5] === grp && (byRegion.has(r[0]) || (r[4] && t.has(r[4]))));
      if(!regs.length) continue;
      const all = regs.flatMap(r => byRegion.get(r[0]) || []), done = all.filter(l => l.done).length, ready = all.filter(l => l.ready).length;
      const seen = new Map(); for(const r of D.regions) seen.set(r[1], (seen.get(r[1]) || 0) + 1);
      const label = r => seen.get(r[1]) > 1 ? r[0].replace(/(?<=[a-z])(?=[A-Z])/g, " ") : r[1];
      html += `<section class="bl-panel bl-dlc ${grp}"><h3>${esc(title)} <small>${done} / ${all.length} done${m.haveLogic && ready ? ` · <b>${ready} ready</b>` : ""}</small></h3><div class="bl-regs">${regs.map(rg => { const [id, , lo, hi, travel] = rg, name = label(rg);
        const l = byRegion.get(id) || [], d = l.filter(x => x.done).length, r = l.filter(x => x.ready).length, tr = travel ? t.has(travel) : null;
        const kinds = [...new Set(l.map(x => x.kind))];
        return `<article class="bl-reg${r ? " go" : ""}${l.length && d === l.length ? " full" : ""}"${travel && !tr ? t.hint([travel], name) : ""}>
          <header><span class="bl-tag${tr ? " on" : tr === false ? " off" : ""}" title="${travel ? (tr ? "Fast travel unlocked" : `Needs ${esc(travel)}`) : "No fast travel item"}">${icon("travel", 22, tr ? "#ffd23f" : null)}</span>
          <h4>${esc(name)}</h4><em title="Level range">Lv ${lo}–${hi}</em></header>
          <i class="bl-bar"><i style="width:${l.length ? d / l.length * 100 : 0}%"></i></i>
          <div class="bl-rk">${l.length && d === l.length ? `<span class="done">${icon("check", 16, "#ffd23f")}all done</span>` : kinds.map(k => { const kl = l.filter(x => x.kind === k), kr = kl.filter(x => x.ready).length, kd = kl.filter(x => x.done).length;
            return kd === kl.length ? "" : `<span class="${kr ? "go" : ""}" title="${esc(k)}: ${kd}/${kl.length} done${kr ? `, ${kr} ready now` : ""}">${icon(KIND[k] || "target", 16)}${kr ? `${kr} ready` : kl.length - kd}</span>`; }).join("")}</div>
        </article>`; }).join("")}</div></section>`;
    }
    return html + `</div>`;
  }

  APTracker.register({
    game:"Borderlands 2",
    slotData:true,
    async init(api){ [D, IC] = await Promise.all([api.json("data/bl2.json"), api.json("data/icons.json")]); },
    tabs:[{ id:"bl-hunter", label:"Vault Hunter", render:renderHunter }, { id:"bl-loot", label:"Loot", render:renderLoot }, { id:"bl-map", label:"Pandora", render:renderMap }],
    checksLabel:"All checks",
    locationGroup:n => D?.locs[n]?.[1] || "Other",
    groupOrder:["Quests", "Named enemies", "Chests", "Vending machines", "Vault symbols", "Challenges", "Gear", "Mobs", "Levels", "Other"],
    card(t){
      const m = model(t), g = m.goals[0];
      return `${m.haveLogic ? `${m.ready} ready now` : `${m.left} checks left`}${g ? ` · target: ${pretty(g.name)}` : ""}`;
    }
  });
})();
