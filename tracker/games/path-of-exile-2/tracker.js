/* Path of Exile 2 tracker (PathOfExile2 world by IhleMa).
   An inventory paper doll with each slot drawn in the rarity you've unlocked, a weapon rack for every weapon and
   off-hand type, flasks and charms, the route through the acts with exactly what the next act needs in logic,
   and every gem. Logic follows the world's hooks/poe2.py: entering an act needs usable skill gems (right tier, a
   weapon that can use them), gear unlocks, armour slots, supports, sockets, passives, charms, trials, ascendancy and
   flasks, each capped by what the seed contains.
   Data: data/poe2.json (from the world), data/icons.json (silhouettes drawn for this tracker). */
(() => {
  const esc = APTracker.esc;
  let D = null, ICONS = {};

  /* ---------- the world's tables (hooks/poe2.py) ---------- */
  const SKILLS_NEEDED = [0, 2, 4, 6, 8, 9, 10], GEM_TIER_CAP = [1, 3, 7, 11, 13, 14, 14];
  const GEAR_NEEDED = [0, 3, 8, 14, 20, 26, 32], ARMOUR_SLOTS_NEEDED = [0, 2, 4, 6, 7, 8, 8];
  const SUPPORTS_NEEDED = [0, 1, 4, 8, 12, 15, 18], SOCKETS_NEEDED = [0, 0, 1, 1, 2, 2, 3];
  const PASSIVES_NEEDED = [0, 2, 10, 22, 32, 38, 44], CHARMS_NEEDED = [0, 0, 0, 1, 1, 2, 2], TRIALS_NEEDED = [0, 0, 0, 0, 1, 1, 2];
  const PINNACLE = { skills:10, gear:44, armour:8, supports:22, sockets:3, passives:60, charms:3, trials:3 };
  const WEAPONS = ["One Hand Mace", "Two Hand Mace", "Quarterstaff", "Spear", "Bow", "Crossbow", "Wand", "Staff", "Sceptre", "Talisman"];
  const OFFHANDS = ["Shield", "Buckler", "Focus", "Quiver"];
  const ARMOUR = ["Helmet", "Body Armour", "Gloves", "Boots", "Belt", "Amulet", "Ring (Left)", "Ring (Right)"];
  const GEAR_ITEMS = [...WEAPONS, ...OFFHANDS, ...ARMOUR].map(x => "Progressive " + x);
  const CLASS_ORDER = ["random", "Warrior", "Mercenary", "Ranger", "Huntress", "Monk", "Sorceress", "Witch", "Druid"];
  const GOAL_REGION = { 0:6, 1:2, 2:3, 3:4, 4:5, 5:6 };   // the act you have to enter to win (campaign: The Ziggurat Refuge)
  const GOAL_TEXT = { 0:"Complete the campaign", 1:"Complete Act 1", 2:"Complete Act 2", 3:"Complete Act 3", 4:"Complete Act 4", 5:"Defeat pinnacle bosses" };
  const RARITY = ["Locked", "Normal", "Magic", "Rare", "Unique"];
  const REGION_SHORT = ["The Riverbank", "Act 1", "Act 2", "Act 3", "Act 4", "Interludes", "Endgame"];
  const NATURAL_OFFHAND = { Warrior:"Shield", Mercenary:"Buckler", Ranger:"Quiver", Huntress:"Buckler", Monk:"Focus", Sorceress:"Focus", Witch:"Focus", Druid:"Shield" };
  const GROUP_HUE = { Mace:"str", Spear:"dex", Bow:"dex", Crossbow:"dex", Quarterstaff:"dexint", Elemental:"int", Occult:"int", Primal:"strint" };

  const pythonRound = x => { const f = Math.floor(x), d = x - f; return d > 0.5 || (d === 0.5 && f % 2 === 1) ? f + 1 : f; };   // Python's round() rounds halves to even
  const usable = (g, weapons) => !g[2].length || g[2].some(w => weapons.has(w));

  /* How many of each logic-relevant thing the seed holds. Exact from a list of the seed's items; otherwise
     what the options put in a full pool (seeds trimmed to fit few checks hold less). */
  function availability(o, cls, names){
    if(names){
      const c = new Map(); for(const n of names) c.set(n, (c.get(n) || 0) + 1);
      const k = n => c.get(n) || 0;
      const weapons = new Set(WEAPONS.filter(w => k("Progressive " + w)));
      const a = { exact:true, gear:GEAR_ITEMS.reduce((s, n) => s + k(n), 0), armour:ARMOUR.filter(x => k("Progressive " + x)).length,
        supports:Object.keys(D.supports).reduce((s, n) => s + k(n), 0), sockets:k("Progressive Support Socket"), passives:k("Passive Skill Point"),
        charms:k("Progressive Charm Slot"), trials:k("Progressive Ascendancy Trial"), life:k("Life Flask Slot"), mana:k("Mana Flask Slot"),
        ascendancies:(D.classes[cls]?.ascendancies || []).reduce((s, x) => s + k("Ascendancy - " + x), 0) };
      for(let r = 0; r < 7; r++){ const cap = GEM_TIER_CAP[Math.max(r - 1, 0)]; a["skills_" + r] = Object.entries(D.gems).filter(([n, g]) => g[0] === "S" && k(n) && g[1] <= cap && usable(g, weapons)).length; }
      a.skills_any = Object.entries(D.gems).filter(([n, g]) => g[0] === "S" && k(n) && usable(g, weapons)).length;
      return a;
    }
    const asc = o.include_ascendancy ? 1 : 0;
    const a = { exact:false, gear:GEAR_ITEMS.length * 4, armour:ARMOUR.length, sockets:3, charms:3, trials:asc ? 4 : 0, life:1, mana:1,
      supports:o.progressive_support_gems ? Object.values(D.supports).reduce((s, t) => s + t.length, 0) : Object.keys(D.supports).length,
      passives:o.passive_points_in_pool, ascendancies:asc ? (D.classes[cls]?.ascendancies || []).length : 0 };
    for(let r = 0; r < 7; r++){ const cap = GEM_TIER_CAP[Math.max(r - 1, 0)]; a["skills_" + r] = Object.values(D.gems).filter(g => g[0] === "S" && g[1] <= cap).length; }
    a.skills_any = Object.values(D.gems).filter(g => g[0] === "S").length;
    return a;
  }
  function requirements(a, region){
    const scale = a.passives ? a.passives / 123 : 0;
    return { skills:Math.min(SKILLS_NEEDED[region], a["skills_" + region]), tier:GEM_TIER_CAP[Math.max(region - 1, 0)],
      gear:Math.min(GEAR_NEEDED[region], a.gear), armour:Math.min(ARMOUR_SLOTS_NEEDED[region], a.armour),
      supports:Math.min(SUPPORTS_NEEDED[region], a.supports), sockets:Math.min(SOCKETS_NEEDED[region], a.sockets),
      passives:Math.min(pythonRound(PASSIVES_NEEDED[region] * scale), a.passives), charms:Math.min(CHARMS_NEEDED[region], a.charms),
      trials:Math.min(TRIALS_NEEDED[region], a.trials), ascendancy:region >= 4 && a.ascendancies ? 1 : 0,
      life:region >= 1 && a.life ? 1 : 0, mana:region >= 2 && a.mana ? 1 : 0 };
  }
  function pinnacleReq(a){
    const scale = a.passives ? a.passives / 123 : 0;
    return Object.assign(requirements(a, 6), { skills:Math.min(PINNACLE.skills, a.skills_any), tier:20, gear:Math.min(PINNACLE.gear, a.gear),
      armour:Math.min(PINNACLE.armour, a.armour), supports:Math.min(PINNACLE.supports, a.supports), sockets:Math.min(PINNACLE.sockets, a.sockets),
      passives:Math.min(pythonRound(PINNACLE.passives * scale), a.passives), charms:Math.min(PINNACLE.charms, a.charms), trials:Math.min(PINNACLE.trials, a.trials) });
  }

  /* What the player has against each requirement. */
  function standing(t, S, req){
    const weapons = new Set(WEAPONS.filter(w => t.has("Progressive " + w)));
    const skills = Object.entries(D.gems).filter(([n, g]) => g[0] === "S" && g[1] <= req.tier && t.has(n) && usable(g, weapons)).length;
    const asc = (D.classes[S.cls]?.ascendancies || []).some(x => t.has("Ascendancy - " + x)) ? 1 : 0;
    return { skills, gear:GEAR_ITEMS.reduce((s, n) => s + t.count(n), 0), armour:ARMOUR.filter(x => t.has("Progressive " + x)).length,
      supports:Object.keys(D.supports).reduce((s, n) => s + t.count(n), 0), sockets:t.count("Progressive Support Socket"),
      passives:t.count("Passive Skill Point"), charms:t.count("Progressive Charm Slot"), trials:t.count("Progressive Ascendancy Trial"),
      ascendancy:asc, life:t.has("Life Flask Slot") ? 1 : 0, mana:t.has("Mana Flask Slot") ? 1 : 0 };
  }
  const meets = (have, req) => ["skills", "gear", "armour", "supports", "sockets", "passives", "charms", "trials", "ascendancy", "life", "mana"].every(k => have[k] >= req[k]);

  const cache = new Map();
  function compute(t){
    const key = t.slot + "|" + t.items.length + "|" + t.checked.length;
    if(cache.has(key)) return cache.get(key);
    const sd = t.slotData || {};
    const o = { goal:+(sd.goal ?? 0), include_ascendancy:sd.include_ascendancy == null ? 1 : +sd.include_ascendancy,
      progressive_support_gems:+(sd.progressive_support_gems ?? sd.poe2_progressive_supports ?? 0), passive_points_in_pool:sd.passive_points_in_pool == null ? 123 : +sd.passive_points_in_pool,
      pinnacle_bosses_required:+(sd.pinnacle_bosses_required ?? 3) };
    const cls = sd.poe2_class || CLASS_ORDER[+sd.starting_character] || D.classes && Object.keys(D.classes).find(c => t.has("Class - " + c)) || "Witch";
    let reqs, pin, exact;
    if(sd.poe2_requirements && Array.isArray(sd.poe2_requirements.regions)){ reqs = sd.poe2_requirements.regions; pin = sd.poe2_requirements.pinnacle; exact = true; }
    else { const a = availability(o, cls, sd.poe2_pool); reqs = [0, 1, 2, 3, 4, 5, 6].map(r => requirements(a, r)); pin = pinnacleReq(a); exact = a.exact; }
    const reach = [true];
    for(let r = 1; r < 7; r++) reach[r] = reach[r - 1] && meets(standing(t, { cls }, reqs[r]), reqs[r]);
    const pinOK = reach[6] && meets(standing(t, { cls }, pin), pin);
    const top = reach.lastIndexOf(true);
    // pinnacle goal: each pinnacle boss check holds a trophy, so it's in logic once enough of them are
    const pinChecks = t.locations.filter(l => D.locations[l.name]?.[1] === "Pinnacle Bosses").length;
    const goalOK = o.goal === 5 ? pinOK && pinChecks >= o.pinnacle_bosses_required : reach[GOAL_REGION[o.goal]];
    // a seed with fewer checks than its full item pool was trimmed, and its requirements may be lower than the full pool's
    const full = (o.progressive_support_gems ? Object.values(D.supports).reduce((s, x) => s + x.length, 0) : Object.keys(D.supports).length)
      + Object.keys(D.gems).length + o.passive_points_in_pool + (o.passive_points_in_pool ? 12 : 0)
      + (o.include_ascendancy ? (D.classes[cls]?.ascendancies || []).length + 4 : 0) + 1 + GEAR_ITEMS.length * 4 + 8;
    const trimmed = !exact && t.locations.length - pinChecks + t.items.filter(i => i.location === -2).length < full;
    const S = { o, cls, reqs, pin, exact, trimmed, reach, top, pinOK, goalOK,
      inLogic:name => { const l = D.locations[name]; if(!l) return false; return reach[l[0]] && (l[1] !== "Pinnacle Bosses" || pinOK); } };
    cache.set(key, S); if(cache.size > 40) cache.delete(cache.keys().next().value);
    return S;
  }

  /* ---------- drawing ---------- */
  let gid = 0;
  function icon(name, rarity, size){
    const ic = ICONS[name] || ICONS.Gem, id = "p2g" + (++gid);
    return `<svg class="p2-ic r${rarity}" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="a"/><stop offset="1" class="b"/></linearGradient></defs>
      <path class="s" d="${ic.s}" fill="url(#${id})" fill-rule="evenodd"/><path class="d" d="${ic.d}"/></svg>`;
  }
  const pips = n => `<span class="p2-pips" aria-hidden="true">${[1, 2, 3, 4].map(i => `<i class="${i <= n ? "on r" + i : ""}"></i>`).join("")}</span>`;
  function slot(t, piece, area, label){
    const n = Math.min(4, t.count("Progressive " + piece));
    return `<div class="p2-slot r${n}" style="grid-area:${area}"${t.hint(["Progressive " + piece], "Progressive " + piece)} title="${esc(`${label || piece}: ${n ? RARITY[n] + (n < 4 ? ", next " + RARITY[n + 1] : ", fully unlocked") : "locked, needs Progressive " + piece}`)}">
      ${icon(piece, n, 64)}<span class="p2-cap">${esc(label || piece)}</span><span class="p2-rar">${RARITY[n]}</span></div>`;
  }
  function flask(t, name, item, have, title){
    return `<div class="p2-fl ${have ? "on" : ""} ${name === "Life Flask" ? "life" : name === "Mana Flask" ? "mana" : "charm"}"${t.hint([item], item)} title="${esc(title)}">${icon(name, have ? 9 : 0, 40)}</div>`;
  }

  function renderChar(t){
    const S = compute(t), cls = S.cls, C = D.classes[cls] || {};
    const off = OFFHANDS.slice().sort((a, b) => t.count("Progressive " + b) - t.count("Progressive " + a))[0];
    const offShown = t.count("Progressive " + off) ? off : (NATURAL_OFFHAND[cls] || "Shield");
    const charms = t.count("Progressive Charm Slot");
    const ascs = C.ascendancies || [], ascHave = ascs.filter(x => t.has("Ascendancy - " + x));
    const doll = `<div class="p2-doll" aria-label="Equipment">
      ${slot(t, C.weapon || "Wand", "wpn", C.weapon)}${slot(t, offShown, "off", offShown)}
      ${slot(t, "Helmet", "helm")}${slot(t, "Amulet", "amu")}${slot(t, "Body Armour", "body")}
      ${slot(t, "Ring (Left)", "ringl", "Left ring")}${slot(t, "Ring (Right)", "ringr", "Right ring")}
      ${slot(t, "Gloves", "glov")}${slot(t, "Belt", "belt")}${slot(t, "Boots", "boot")}
      <div class="p2-flasks" style="grid-area:flask">
        ${flask(t, "Life Flask", "Life Flask Slot", t.has("Life Flask Slot"), t.has("Life Flask Slot") ? "Life flask: unlocked" : "Life flask: locked")}
        ${[1, 2, 3].map(i => flask(t, "Charm", "Progressive Charm Slot", charms >= i, `Charm slot ${i}: ${charms >= i ? "unlocked" : "locked"}`)).join("")}
        ${flask(t, "Mana Flask", "Mana Flask Slot", t.has("Mana Flask Slot"), t.has("Mana Flask Slot") ? "Mana flask: unlocked" : "Mana flask: locked")}
      </div></div>`;

    const sockets = t.count("Progressive Support Socket"), passives = t.count("Passive Skill Point"), trials = t.count("Progressive Ascendancy Trial");
    const sideStats = `<div class="p2-sheet">
      <div class="p2-who"><span class="p2-class">${esc(cls)}</span><span class="p2-asc">${ascHave.length ? esc(ascHave.join(" · ")) : S.o.include_ascendancy ? "Not ascended yet" : "No ascendancy in this seed"}</span></div>
      <dl class="p2-stats">
        <div${t.hint(["Passive Skill Point"], "Passive Skill Point")}><dt>Passive points</dt><dd>${passives}<small>${S.o.passive_points_in_pool ? ` of ${S.o.passive_points_in_pool}` : " (free in this seed)"}</small></dd></div>
        <div${t.hint(["Progressive Support Socket"], "Progressive Support Socket")}><dt>Supports per skill</dt><dd>${Math.min(5, 2 + sockets)}<small> of 5</small></dd></div>
        ${S.o.include_ascendancy ? `<div${t.hint(["Progressive Ascendancy Trial"], "Progressive Ascendancy Trial")}><dt>Ascendancy points</dt><dd>${trials * 2}<small> of 8</small></dd></div>
        <div${t.hint(ascs.map(x => "Ascendancy - " + x), "Ascendancy")}><dt>Ascendancies</dt><dd class="p2-ascs">${ascs.map(x => `<span class="${t.has("Ascendancy - " + x) ? "on" : ""}">${esc(x)}</span>`).join("")}</dd></div>` : ""}
        <div${t.hint(["Weapon Set Passive Points"], "Weapon Set Passive Points")}><dt>Weapon set points</dt><dd>${t.count("Weapon Set Passive Points") * 2}</dd></div>
      </dl></div>`;

    return `<div class="p2"><div class="p2-top">${doll}${sideStats}</div>${route(t, S)}${rack(t)}</div>`;
  }

  /* The route through the acts: where logic lets you go, and what the next act asks for. */
  const REQ_ROWS = [
    ["skills", r => `Skill gems you can use (tier ${r.tier === 20 ? "any" : "≤ " + r.tier})`],
    ["gear", () => "Gear unlocks"], ["armour", () => "Armour & jewellery slots"], ["supports", () => "Support gems"],
    ["sockets", () => "Support sockets"], ["passives", () => "Passive points"], ["charms", () => "Charm slots"],
    ["trials", () => "Ascendancy trials"], ["ascendancy", () => "An ascendancy"], ["life", () => "Life flask"], ["mana", () => "Mana flask"]
  ];
  function hintFor(t, S, k, req){
    if(k === "skills"){
      const group = D.classes[S.cls]?.gem_group;
      return Object.entries(D.gems).filter(([n, g]) => g[0] === "S" && g[1] <= req.tier && !t.has(n)).sort((a, b) => (b[1][3].includes(group) - a[1][3].includes(group)) || a[1][1] - b[1][1]).slice(0, 40).map(x => x[0]);
    }
    return { gear:GEAR_ITEMS.filter(n => t.count(n) < 4), armour:ARMOUR.map(x => "Progressive " + x).filter(n => !t.has(n)),
      supports:Object.keys(D.supports).filter(n => !t.has(n)).slice(0, 60), sockets:["Progressive Support Socket"], passives:["Passive Skill Point"],
      charms:["Progressive Charm Slot"], trials:["Progressive Ascendancy Trial"], ascendancy:(D.classes[S.cls]?.ascendancies || []).map(x => "Ascendancy - " + x),
      life:["Life Flask Slot"], mana:["Mana Flask Slot"] }[k] || [];
  }
  function reqTable(t, S, req){
    const have = standing(t, S, req);
    return `<ul class="p2-req">${REQ_ROWS.filter(([k]) => req[k] > 0).map(([k, label]) => {
      const ok = have[k] >= req[k], p = Math.min(100, have[k] / req[k] * 100), names = hintFor(t, S, k, req);
      return `<li class="${ok ? "ok" : ""}"${!ok && names.length ? t.hint(names, label(req)) : ""}><span>${esc(label(req))}</span><span class="p2-bar"><i style="width:${p}%"></i></span><b>${Math.min(have[k], 999)}<small> / ${req[k]}</small></b></li>`;
    }).join("")}</ul>`;
  }
  function route(t, S){
    const goalR = GOAL_REGION[S.o.goal], nextR = S.reach.indexOf(false);
    const stops = REGION_SHORT.map((name, r) => {
      const state = S.reach[r] ? "open" : r === nextR ? "next" : "shut";
      const total = t.locations.filter(l => D.locations[l.name]?.[0] === r), done = total.filter(l => l.done).length;
      return `<li class="p2-stop ${state}${r === goalR && S.o.goal !== 5 ? " goal" : ""}${r > goalR && S.o.goal !== 5 ? " past" : ""}">
        <span class="p2-node" aria-hidden="true"></span><span class="p2-act">${esc(name)}</span>
        <span class="p2-meta">${[total.length ? `${done} / ${total.length} checks` : r > goalR && S.o.goal !== 5 ? "beyond your goal" : "", r === goalR && S.o.goal !== 5 ? "your goal" : ""].filter(Boolean).join(", ")}</span></li>`;
    }).join("");
    let next = "";
    if(nextR > 0) next = `<div class="p2-next"><h4>To enter ${esc(REGION_SHORT[nextR])}</h4>${reqTable(t, S, S.reqs[nextR])}</div>`;
    else if(S.o.goal === 5) next = `<div class="p2-next"><h4>For the pinnacle bosses</h4>${reqTable(t, S, S.pin)}
      <p class="p2-dim">${t.count("Pinnacle Boss Trophy")} of ${S.o.pinnacle_bosses_required} trophies.</p></div>`;
    else next = `<div class="p2-next done"><h4>Every act is in logic</h4><p class="p2-dim">${t.goal ? "Goal complete." : S.goalOK ? "Your goal is in logic." : ""}</p></div>`;
    return `<section class="p2-route"><div><h3>The road</h3><p class="p2-goal">${esc(GOAL_TEXT[S.o.goal] || "")}${S.o.goal === 5 ? ` (${S.o.pinnacle_bosses_required})` : ""}${S.goalOK ? ` <em>in logic</em>` : ""}</p>
      <ol class="p2-stops">${stops}</ol></div>${next}${S.trimmed ? `<p class="p2-note">This seed has fewer checks than a full item pool, so the world trimmed its items and some requirements may be lower than shown.</p>` : ""}</section>`;
  }
  function rack(t){
    const tile = x => { const n = Math.min(4, t.count("Progressive " + x));
      return `<div class="p2-wp r${n}"${t.hint(["Progressive " + x], "Progressive " + x)} title="${esc(`${x}: ${n ? RARITY[n] : "locked"}`)}">${icon(x, n, 58)}<span>${esc(x)}</span>${pips(n)}</div>`; };
    return `<section><h3>Weapons & off-hands</h3><div class="p2-rack">${WEAPONS.map(tile).join("")}<span class="p2-sep" aria-hidden="true"></span>${OFFHANDS.map(tile).join("")}</div></section>`;
  }

  /* ---------- gems ---------- */
  const gemHue = g => GROUP_HUE[g[3][0]] || "int";
  function renderGems(t){
    const S = compute(t), group = D.classes[S.cls]?.gem_group, weapons = new Set(WEAPONS.filter(w => t.has("Progressive " + w)));
    const tierCap = GEM_TIER_CAP[Math.max(S.top, 0)];
    const chip = (n, g) => { const have = t.has(n), ok = have && usable(g, weapons);
      return `<li class="p2-gem ${gemHue(g)}${have ? " have" : ""}${have && !ok ? " nowep" : ""}"${t.hint([n], n)} title="${esc(`${n}, tier ${g[1]}${g[2].length ? ", needs " + g[2].join(" or ") : ""}${have && !ok ? " (no matching weapon unlocked)" : ""}`)}">${icon("Gem", have ? 9 : 0, 18)}<span>${esc(n)}</span></li>`; };
    const skills = Object.entries(D.gems).filter(([, g]) => g[0] === "S");
    const byTier = new Map(); for(const [n, g] of skills){ if(!byTier.has(g[1])) byTier.set(g[1], []); byTier.get(g[1]).push([n, g]); }
    let html = `<div class="p2"><p class="p2-dim">Received gems glow. Your class's gems (${esc(group || "")}) come first in each tier. Logic counts a skill gem once its tier is reachable and you have a weapon that can use it. Click any gem to ask where it is.</p>`;
    html += `<section><h3>Skill gems <small>${skills.filter(([n]) => t.has(n)).length} of ${skills.length}</small></h3><div class="p2-tiers">`;
    for(const tier of [...byTier.keys()].sort((a, b) => a - b)){
      const list = byTier.get(tier).sort((a, b) => (b[1][3].includes(group) - a[1][3].includes(group)) || (t.has(b[0]) - t.has(a[0])) || a[0].localeCompare(b[0]));
      html += `<div class="p2-tier${tier <= tierCap ? " reach" : ""}"><h4>Tier ${tier}<small>${list.filter(([n]) => t.has(n)).length} / ${list.length}</small></h4><ul>${list.map(([n, g]) => chip(n, g)).join("")}</ul></div>`;
    }
    html += `</div></section>`;
    for(const [kind, label] of [["P", "Spirit gems"], ["U", "Utility gems"], ["M", "Meta gems"]]){
      const list = Object.entries(D.gems).filter(([, g]) => g[0] === kind).sort((a, b) => a[1][1] - b[1][1] || a[0].localeCompare(b[0]));
      html += `<section><h3>${label} <small>${list.filter(([n]) => t.has(n)).length} of ${list.length}</small></h3><ul class="p2-flat">${list.map(([n, g]) => chip(n, g)).join("")}</ul></section>`;
    }
    const sup = Object.entries(D.supports).sort((a, b) => a[1][0] - b[1][0] || a[0].localeCompare(b[0]));
    const prog = S.o.progressive_support_gems;
    html += `<section><h3>Support gems <small>${sup.filter(([n]) => t.has(n)).length} of ${sup.length}${prog ? " · each copy unlocks the next level" : " · one item unlocks the whole lineage"}</small></h3>
      <ul class="p2-sups">${sup.map(([n, tiers]) => { const c = t.count(n), lv = prog ? Math.min(c, tiers.length) : c ? tiers.length : 0;
        return `<li class="${c ? "have" : ""}"${t.hint([n], n)}><span>${esc(n.replace(/ Support$/, ""))}</span>${tiers.length > 1 ? `<small>${lv ? ["I", "II", "III", "IV"].slice(0, lv).join(" ") : ""}${lv < tiers.length ? `<s>${["I", "II", "III", "IV"].slice(lv, tiers.length).join(" ")}</s>` : ""}</small>` : ""}</li>`; }).join("")}</ul></section>`;
    return html + `</div>`;
  }

  APTracker.register({
    game:"PathOfExile2",
    slotData:true,
    async init(api){ [D, ICONS] = await Promise.all([api.json("data/poe2.json"), api.json("data/icons.json")]); },
    tabs:[{ id:"p2-char", label:"Character", render:renderChar }, { id:"p2-gems", label:"Gems", render:renderGems }],
    checksLabel:"Checks by act",
    locationGroup:n => { const l = D.locations[n]; return l ? REGION_SHORT[l[0]] : "Other"; },
    groupOrder:REGION_SHORT.concat(["Other"]),
    _compute:t => compute(t),   // lets a test compare this logic with the world's own
    card(t){
      const S = compute(t), left = t.locations.filter(l => !l.done && S.inLogic(l.name)).length;
      return `${esc(S.cls)} · ${S.reach[1] ? "up to " + esc(REGION_SHORT[S.top]) : "still on The Riverbank"} · ${left} checks in logic`;
    }
  });
})();
