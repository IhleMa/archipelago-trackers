/* Baldur's Gate 3 tracker (ArchipelagoBG3 by zane31415).
   Level from Level Fragments, a region map per act that follows the world's own access rules
   (levels + blocked entrances), the gate items, companions, ability scores (statsanity) and
   treasure by equipment slot.
   Data: data/regions.json (which region every check belongs to), data/equipment.json
   (equipment slot and act per item), both generated from the world's source (MIT licence). */
(() => {
  /* ---------- the world's rules, ported from worlds/bg3/regions.py ---------- */
  const REGIONS = [
    // key, display name, act
    ["tutorial","Nautiloid",1],["beach","Beach",1],["crypt","Dank Crypt",1],["grove","Emerald Grove",1],["blighted_village","Blighted Village",1],
    ["underwell","Underwell",1],["waukeen","Waukeen's Rest",1],["zhentarim_basement","Zhentarim Hideout",1],["goblin_camp","Goblin Camp",1],
    ["inside_goblin_camp","Shattered Sanctum",1],["hag","Sunlit Wetlands",1],["underdark","Underdark",1],["grymforge","Grymforge",1],
    ["monastery","Rosymorn Monastery",1],["creche","Creche Y'llek",1],
    ["east_act2","Shadow-Cursed Lands",2],["last_light","Last Light Inn",2],["last_light_basement","Last Light Cellar",2],["west_act2","Reithwin",2],
    ["masons_guild","Mason's Guild",2],["moonrise","Moonrise Towers",2],["shar_gauntlet","Gauntlet of Shar",2],["moonrise_rooftop","Moonrise Rooftop",2],
    ["mindflayer","Mindflayer Colony",2],
    ["astral","Astral Plane",3],["rivington","Rivington",3],["wyrms_crossing","Wyrm's Crossing",3],["lower_city_east","Lower City East",3],
    ["elfsong_basement","Elfsong Basement",3],["sorcerous_sundries","Sorcerous Sundries",3],["house_of_hope","House of Hope",3],["murder_tribunal","Murder Tribunal",3],
    ["lower_city_central","Lower City Central",3],["iron_throne","Iron Throne",3],["blushing_mermaid","Blushing Mermaid",3],["cazador","Cazador's Palace",3],
    ["counting_house","Counting House",3],["lower_city_west","Lower City West",3],["steel_watch_foundry","Steel Watch Foundry",3],["house_of_grief","House of Grief",3],
    ["lower_city_sewers","Lower City Sewers",3],["undercity_ruins","Undercity Ruins",3],["ancient_lair","Ancient Lair",3],["endgame","Netherbrain",3]
  ];
  const NAME = Object.fromEntries(REGIONS.map(r => [r[0], r[1]]));
  // [from, to, level fragments, gates, stat points, minimum goal tier]  tiers: 0 Halsin, 1 Act 1, 2 Act 2, 3 Act 3
  const CONNECT = [
    ["tutorial","beach",1,["Nautiloid Control Panel"],0,0],["beach","crypt",0,["Wither's Crypt"],0,0],["beach","grove",3,[],0,0],
    ["beach","blighted_village",3,[],0,0],["blighted_village","underwell",6,["@well"],0,0],["blighted_village","goblin_camp",8,[],0,0],
    ["goblin_camp","inside_goblin_camp",8,["Goblin Camp"],0,0],["blighted_village","hag",10,["Hag's Fireplace"],4,0],
    ["blighted_village","waukeen",6,[],0,0],["waukeen","zhentarim_basement",6,["Zhentarim Basement"],0,0],
    ["inside_goblin_camp","underdark",10,["Underdark"],0,1],["underdark","grymforge",14,["Grymforge"],0,1],["underwell","underdark",10,["Underdark"],0,1],
    ["blighted_village","monastery",18,["Goblin Camp","Mountain Pass"],0,1],["monastery","creche",0,["Creche"],0,1],
    ["monastery","east_act2",22,["Act 2"],0,2],["grymforge","east_act2",22,["Goblin Camp","Act 2"],0,2],["east_act2","west_act2",26,[],0,2],
    ["west_act2","masons_guild",26,["Reithwin's Mason's Guild"],0,2],["east_act2","last_light",26,[],0,2],
    ["last_light","last_light_basement",26,["Last Light Basement"],0,2],["west_act2","moonrise",0,["@tower1"],0,2],
    ["west_act2","shar_gauntlet",0,["Underdark","Grymforge","Shar Trials"],0,2],["shar_gauntlet","moonrise_rooftop",0,["@tower2"],0,2],
    ["moonrise_rooftop","mindflayer",30,["@tower3"],0,2],
    ["mindflayer","astral",34,["Act 3"],0,3],["astral","rivington",0,[],0,3],["rivington","wyrms_crossing",0,[],0,3],
    ["wyrms_crossing","lower_city_east",38,["Lower City East"],0,3],["lower_city_east","lower_city_sewers",0,["Lower City Sewers"],0,3],
    ["lower_city_east","elfsong_basement",0,["Elfsong Basement"],0,3],["lower_city_east","sorcerous_sundries",0,["Sorcerous Sundries"],0,3],
    ["lower_city_east","house_of_hope",0,["House of Hope"],0,3],["lower_city_east","murder_tribunal",0,["Murder Tribunal"],0,3],
    ["lower_city_east","lower_city_central",0,[],0,3],["lower_city_central","iron_throne",0,[],0,3],
    ["lower_city_central","blushing_mermaid",0,["Blushing Mermaid"],0,3],["lower_city_central","cazador",0,["Cazador's Palace"],0,3],
    ["lower_city_central","counting_house",0,["Counting House"],0,3],["lower_city_central","lower_city_west",0,[],0,3],
    ["lower_city_west","steel_watch_foundry",0,["Steel Watch Foundry"],0,3],["lower_city_west","house_of_grief",0,["House of Grief"],0,3],
    ["lower_city_sewers","undercity_ruins",0,["Murder Tribunal","Undercity Ruins"],0,3],["lower_city_sewers","ancient_lair",0,["Ancient Lair"],0,3],
    ["undercity_ruins","endgame",0,["Endgame"],0,3]
  ];
  const GOALS = [ // [label, tier, level cap]
    ["Rescue Halsin", 0, 5], ["Kill Inquisitor W'wargaz", 1, 8], ["Defeat chosen Act 1 bosses", 1, 8],
    ["Kill the Avatar of Myrkul", 2, 10], ["Defeat chosen Act 2 bosses", 2, 10], ["Kill the Netherbrain", 3, 12], ["Defeat chosen Act 3 bosses", 3, 12]
  ];
  const ACT_NAMES = { 1:"Act 1 · The Wilds", 2:"Act 2 · Shadow-Cursed Lands", 3:"Act 3 · Baldur's Gate" };
  // Level Fragments needed for each character level (level 1 needs none), as the world's logic counts them
  const LEVEL_AT = [0, 1, 3, 6, 10, 14, 18, 22, 26, 30, 34, 38];
  const STATS = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];
  const COMPANIONS = [ // name, recruit check (if questsanity has it)
    ["Shadowheart","Shart: Recruit Shadowheart"],["Lae'zel","Beach-LZ: Recruit Lae'zel"],["Astarion","Astarion: Recruited"],["Gale","Gale: Recruited"],
    ["Wyll","Wyll: Recruited"],["Karlach","Karlach-Tyr: Recruit Karlach"],["Halsin",null],["Minthara","Moonrise: Recruit Minthara"]
  ];
  const KEY_ITEMS = ["Boots of Speed", "Shadow Lantern", "Spear of Night"];
  const SLOTS = [["Helmet","helmet"],["Cloak","cloak"],["Armour","armour"],["Gloves","gloves"],["Boots","boots"],["Amulet","amulet"],
    ["Ring","ring"],["Melee","melee"],["Ranged","ranged"],["Shield","shield"],["Other","other"]];

  let REGION_BY_PREFIX = {}, REGION_EXCEPT = {}, EQUIP = {};
  const regionOf = name => REGION_EXCEPT[name] || REGION_BY_PREFIX[name.includes(":") ? name.slice(0, name.indexOf(":")) : name] || null;

  /* ---------- small original line icons (gold on dark) ---------- */
  const ICON = {
    helmet:'<path d="M5 15V11a7 7 0 0 1 14 0v4"/><path d="M5 15h14l-1 4H6z"/><path d="M12 4v6"/>',
    cloak:'<path d="M9 4h6l1 3-4 2-4-2z"/><path d="M8 7 4 20h16L16 7"/><path d="M12 9v11"/>',
    armour:'<path d="M8 4 4 7v6h3v7h10v-7h3V7l-4-3-4 3z"/>',
    gloves:'<path d="M8 21v-6L5 11l1-1 3 2V5h2v6V3h2v8V4h2v8l1-3h2l-1 7-2 5z"/>',
    boots:'<path d="M8 3h5v10l6 3v4H6z"/><path d="M6 17h13"/>',
    amulet:'<path d="M6 3c0 6 3 8 6 9 3-1 6-3 6-9"/><path d="M12 12l3 4-3 5-3-5z"/>',
    ring:'<circle cx="12" cy="14" r="6"/><path d="M10 7l2-3 2 3"/>',
    melee:'<path d="M18 3 8 13l3 3L21 6V3z"/><path d="M6 14l4 4M5 19l3-3"/>',
    ranged:'<path d="M7 3c8 3 8 15 0 18"/><path d="M7 3v18"/><path d="M4 12h15l-3-2m3 2-3 2"/>',
    shield:'<path d="M12 3 5 6v6c0 5 3 8 7 9 4-1 7-4 7-9V6z"/><path d="M12 3v18"/>',
    other:'<path d="M12 3l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 10l6-1z"/>',
    lock:'<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    key:'<circle cx="8" cy="8" r="4"/><path d="M11 11l9 9M16 16l2-2M18 18l2-2"/>',
    check:'<path d="M5 12l4 4 10-10"/>'
  };
  const svg = (k, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
  const d20 = `<svg class="d20" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 4 92 28v44L50 96 8 72V28z"/><path d="M50 4 30 40h40zM30 40 8 72M70 40l22 32M30 40l20 34 20-34M50 74 8 72M50 74l42-2M50 74v22M8 28l22 12M92 28 70 40"/></svg>`;

  /* ---------- derived state ---------- */
  function goalInfo(t){ const g = t.slotData.goal; return Number.isInteger(g) && GOALS[g] ? { idx:g, label:GOALS[g][0], tier:GOALS[g][1], cap:GOALS[g][2] } : null; }
  function levelFrom(frags){ let lv = 1; for(let i = 1; i < LEVEL_AT.length; i++) if(frags >= LEVEL_AT[i]) lv = i + 1; return lv; }
  function gateItem(g, t, halsin){
    if(g === "@well") return [halsin ? "Blighted Village Well" : "Underdark", 1];
    if(g.startsWith("@tower")) return ["Progressive Moonlight Towers", +g.slice(6)];
    return [g, 1];
  }
  function statsNeeded(t, points){
    const mode = t.slotData.statsanity, by = t.slotData.statsanity_boost_by || 2;
    if(!points || !mode || mode === 4) return [];
    const need = points / by;
    if(mode === 1 || mode === 3) return STATS.map(s => [`${s} Stat Boost`, need]);
    if(mode === 2) return [1, 2, 3, 4].flatMap(n => STATS.map(s => [`Slot ${n} ${s} Boost`, need]));
    return [];
  }
  /* Which regions are reachable now, and for the others, what is missing. */
  function reach(t){
    const g = goalInfo(t), tier = g ? g.tier : 3, halsin = g && g.idx === 0, blocked = !!t.slotData.block_entrances;
    const frags = t.count("Level Fragment");
    const conns = CONNECT.filter(c => c[5] <= tier);
    const inScope = new Set(["tutorial", ...conns.map(c => c[1])]);
    const open = new Set(["tutorial"]); let grew = true;
    const missing = c => {
      const m = [];
      if(frags < c[2]) m.push({ level:levelFrom(c[2]), frags:c[2] });
      if(blocked) for(const gt of c[3]){ const [item, n] = gateItem(gt, t, halsin); if(t.count(item) < n) m.push({ item, n }); }
      for(const [item, n] of statsNeeded(t, c[4])) if(t.count(item) < n) m.push({ item, n, stat:true });
      return m;
    };
    while(grew){ grew = false; for(const c of conns) if(open.has(c[0]) && !open.has(c[1]) && !missing(c).length){ open.add(c[1]); grew = true; } }
    const why = {};
    for(const key of inScope) if(!open.has(key)){
      const from = conns.filter(c => c[1] === key && open.has(c[0]));
      why[key] = from.length ? from.map(missing).sort((a, b) => a.length - b.length)[0] : null; // null: reach an earlier area first
    }
    return { open, inScope, why, frags, level:levelFrom(frags), goal:g, blocked, halsin, tier };
  }

  /* ---------- panel ---------- */
  function panel(t){
    const e = t.esc, R = reach(t), sd = t.slotData;
    const cap = R.goal ? R.goal.cap : 12, lv = Math.min(R.level, 12);
    const next = LEVEL_AT[lv] ?? null, prev = LEVEL_AT[lv - 1] || 0;
    const into = next != null ? R.frags - prev : 0, span = next != null ? next - prev : 1;

    // checks per region
    const per = {}; let kinds = { q:[0,0], k:[0,0], c:[0,0] };
    // t.locations (with check IDs) needs core 1.0.0 from 2026-11-04 or later; older cores only give names
    const locs = t.locations || [...t.checked.map(name => ({ name, done:true })), ...t.missing.map(name => ({ name, done:false }))];
    for(const l of locs){
      const r = regionOf(l.name) || "_other"; (per[r] ||= [0, 0]); per[r][1]++; if(l.done) per[r][0]++;
      if(l.id != null){ const k = l.id < 10000 ? "q" : l.id < 100000 ? "k" : "c"; kinds[k][1]++; if(l.done) kinds[k][0]++; }
    }

    const hero = `<div class="bg3-hero">
      <div class="bg3-level"${t.hint("Level Fragment", "Level Fragments")}>
        <div class="bg3-d20">${d20}<span>${lv}</span></div>
        <div class="bg3-lvtext"><span class="bg3-k">Level</span><b>${lv} <small>of ${cap}</small></b>
          <span class="bg3-dim">${R.frags} Level Fragment${R.frags === 1 ? "" : "s"}</span>
          ${next != null && lv < cap ? `<div class="bg3-xp" title="${into} of ${span} fragments to level ${lv + 1}"><i style="width:${Math.round(into / span * 100)}%"></i></div><span class="bg3-dim">${next - R.frags} more for level ${lv + 1}</span>` : `<span class="bg3-gold">Level cap reached</span>`}
        </div>
      </div>
      <div class="bg3-goal"><span class="bg3-k">Goal</span><b>${e(R.goal ? R.goal.label : "Unknown")}</b>
        ${R.goal && [2, 4, 6].includes(R.goal.idx) && Array.isArray(sd.user_defined_fights) ? `<div class="bg3-tags">${sd.user_defined_fights.map(f => `<span>${e(f)}</span>`).join("")}</div>` : ""}
        ${t.goal ? '<span class="bg3-gold">Completed</span>' : ""}</div>
      ${t.locations ? "" : "<!-- needs a newer tracker core -->"}<div class="bg3-goal"${t.locations ? "" : " hidden"}><span class="bg3-k">Checks by kind</span>
        ${[["q","Quests"],["k","Kills"],["c","Containers"]].filter(([k]) => kinds[k][1]).map(([k, l]) => `<div class="bg3-row"><span>${l}</span><span class="tab">${kinds[k][0]} / ${kinds[k][1]}</span></div>`).join("") || '<span class="bg3-dim">No checks</span>'}</div>
    </div>`;

    // map
    const acts = [1, 2, 3].filter(a => REGIONS.some(r => r[2] === a && R.inScope.has(r[0])));
    const tile = ([key, name]) => {
      const c = per[key] || [0, 0], isOpen = R.open.has(key), why = R.why[key];
      const gates = (why || []).filter(m => m.item), lvl = (why || []).find(m => m.level);
      let state = "open", note = c[1] ? `${c[0]} / ${c[1]}` : "No checks";
      if(!isOpen){
        state = gates.length ? "gated" : lvl ? "level" : "far";
        note = why == null ? "Reach an earlier area first" : [lvl ? `Needs level ${lvl.level}` : "", ...gates.map(g => g.stat ? `${g.item} ×${g.n}` : g.n > 1 ? `${g.item} ${g.n}` : g.item)].filter(Boolean).join(" · ");
      } else if(c[1] && c[0] === c[1]) state = "done";
      const hintItems = gates.map(g => g.item);
      return `<div class="bg3-region ${state}"${hintItems.length ? t.hint(hintItems, name) : ""} title="${e(name)}${isOpen ? "" : ": " + note}">
        <div class="bg3-rhead"><span class="bg3-rname">${e(name)}</span>${state === "gated" ? svg("lock") : state === "done" ? svg("check") : ""}</div>
        ${isOpen && c[1] ? `<div class="bg3-rbar"><i style="width:${Math.round(c[0] / c[1] * 100)}%"></i></div>` : ""}
        <span class="bg3-rnote">${e(isOpen ? note : note)}${isOpen && c[1] ? " checks" : ""}</span></div>`;
    };
    const map = acts.map(a => `<div class="bg3-act"><h4>${ACT_NAMES[a]}</h4><div class="bg3-regions">${REGIONS.filter(r => r[2] === a && R.inScope.has(r[0])).map(tile).join("")}</div></div>`).join("");

    // gates
    let gates = "";
    if(R.blocked){
      const names = [...new Set(CONNECT.filter(c => c[5] <= R.tier).flatMap(c => c[3].map(g => gateItem(g, t, R.halsin)[0])))];
      gates = names.map(n => {
        if(n === "Progressive Moonlight Towers"){ const k = Math.min(3, t.count(n));
          return `<div class="bg3-gate${k ? " on" : ""}"${t.hint(n, "Moonlight Towers")}>${svg(k === 3 ? "key" : "lock")}<span>Moonlight Towers</span><span class="bg3-pips">${[0,1,2].map(i => `<i class="${i < k ? "on" : ""}"></i>`).join("")}</span></div>`; }
        const on = t.has(n);
        return `<div class="bg3-gate${on ? " on" : ""}"${t.hint(n)}>${svg(on ? "key" : "lock")}<span>${e(n)}</span></div>`;
      }).join("");
    }

    // party
    const inLogic = new Set(Array.isArray(sd.characters_in_logic) ? sd.characters_in_logic : COMPANIONS.map(c => c[0]));
    const shuffle = sd.companion_shuffle || {};
    const doneSet = new Set(t.checked), allSet = new Set([...t.checked, ...t.missing]);
    const party = COMPANIONS.map(([name, check]) => {
      const tracked = check && allSet.has(check), rec = tracked && doneSet.has(check), roll = shuffle[name] || {};
      return `<div class="bg3-comp${rec ? " on" : ""}${inLogic.has(name) ? "" : " out"}">
        <span class="bg3-mono">${e(name[0])}</span><div class="bg3-ctext"><b>${e(name)}</b>
        <span class="bg3-dim">${!inLogic.has(name) ? "Not in logic" : tracked ? (rec ? "Recruited" : "Not recruited yet") : "In logic"}</span>
        ${roll.class ? `<span class="bg3-gold">${e(roll.class)}${roll.subclass ? " · " + e(roll.subclass) : ""}</span>` : ""}
        ${roll.outfit ? `<span class="bg3-dim">Wears ${e(roll.outfit)}'s clothes</span>` : ""}</div></div>`;
    }).join("");

    // stats
    let stats = "";
    const mode = sd.statsanity, by = sd.statsanity_boost_by || 2;
    if(mode){
      const row = (label, fmt) => `<div class="bg3-stats"><span class="bg3-k">${label}</span><div class="bg3-abil">${STATS.map(s => { const n = t.count(fmt(s));
        return `<div class="bg3-score"${t.hint(fmt(s), s)}><span>${s.slice(0, 3).toUpperCase()}</span><b>${8 + n * by}</b></div>`; }).join("")}</div></div>`;
      stats = mode === 2 ? [1, 2, 3, 4].map(n => row(`Party slot ${n}`, s => `Slot ${n} ${s} Boost`)).join("")
        : row(mode === 1 ? "Tav" : "Everyone", s => `${s} Stat Boost`);
    }

    // treasure
    const got = {}; for(const it of t.items){ const q = EQUIP[it.name]; if(q){ (got[q[0]] ||= []).push(it.name); } }
    const slots = SLOTS.filter(([s]) => got[s] || s !== "Other").map(([s, ic]) => { const list = got[s] || [];
      return `<div class="bg3-slot${list.length ? " on" : ""}" title="${e(list.join(", ") || "Nothing yet")}">${svg(ic)}<span class="bg3-sname">${s}</span><b class="tab">${list.length}</b></div>`; }).join("");
    const treasureList = SLOTS.filter(([s]) => got[s]).map(([s]) => `<div class="bg3-tlist"><span class="bg3-k">${s}</span><div class="bg3-tags">${got[s].map(n => `<span>${e(n)}</span>`).join("")}</div></div>`).join("");
    const keys = KEY_ITEMS.filter(n => t.itemNames.includes(n)).map(n => `<div class="bg3-gate${t.has(n) ? " on" : ""}"${t.hint(n)}>${svg(t.has(n) ? "key" : "lock")}<span>${e(n)}</span></div>`).join("");
    const gold = t.items.reduce((a, it) => { const m = /^(\d+) Gold$/.exec(it.name); return a + (m ? +m[1] : 0); }, 0);
    const traps = t.count(/ Trap$/);

    const sec = (title, body, note = "") => body ? `<section class="bg3-sec"><div class="bg3-shead"><h3>${title}</h3>${note ? `<span class="bg3-dim">${note}</span>` : ""}</div>${body}</section>` : "";
    return `<div class="bg3">${hero}
      ${sec("The road", `<div class="bg3-map">${map}</div>`, R.blocked ? "Gold = open · purple = blocked entrance · grey = level too low" + (t.isMine ? " · click a blocked area for a hint" : "") : "Areas open up with your level")}
      ${sec("Blocked entrances", gates && `<div class="bg3-gates">${gates}</div>`, t.isMine ? "Click one to find where it is" : "")}
      ${sec("Party", `<div class="bg3-party">${party}</div>`)}
      ${sec("Ability scores", stats, `Each boost adds ${by}`)}
      ${sec("Key items", keys && `<div class="bg3-gates">${keys}</div>`)}
      ${sec("Treasure", `<div class="bg3-slots">${slots}</div>${treasureList}`, [gold ? `${gold} gold` : "", traps ? `${traps} trap${traps > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · "))}
    </div>`;
  }

  APTracker.register({
    game: "Baldur's Gate 3",
    slotData: true,
    async init(api){
      const [regions, equip] = await Promise.all([api.json("data/regions.json"), api.json("data/equipment.json")]);
      REGION_BY_PREFIX = regions.prefix;
      for(const [r, names] of Object.entries(regions.except)) for(const n of names) REGION_EXCEPT[n] = r;
      EQUIP = equip;
    },
    tabs: [{ id:"adventure", label:"Adventure", render:panel }],
    checksLabel: "Checks by area",
    locationGroup: name => NAME[regionOf(name)] || "Other",
    groupOrder: REGIONS.map(r => r[1]),
    card(t){
      const R = reach(t), parts = [`Level ${Math.min(R.level, 12)}`];
      if(R.goal) parts.push(R.goal.label);
      if(R.blocked){ const open = [...R.open].length, all = R.inScope.size; parts.push(`${open}/${all} areas open`); }
      return parts.map(t.esc).join(" · ");
    }
  });
})();
