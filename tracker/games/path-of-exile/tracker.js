/* Path of Exile tracker: equipment panel coloured by allowed rarity, flasks, links,
   passives, classes, gems, and checks grouped by act. Data: data/acts.json (checks whose name does not end in "- act N"), data/gems.json
   (taken from the Path of Exile Archipelago world, MIT licence). */
(() => {
  const RAR = ["Normal", "Magic", "Rare", "Unique"];
  const WEAPONS = ["Axe", "Bow", "Claw", "Dagger", "Mace", "Sceptre", "Staff", "Sword", "Wand", "Fishing Rod"];
  const LINK_MAX = { Weapon:5, Offhand:2, BodyArmour:5, Helm:3, Gloves:3, Boots:3 };
  const CLASSES = {
    Marauder:["Juggernaut","Berserker","Chieftain"], Duelist:["Slayer","Gladiator","Champion"], Ranger:["Deadeye","Pathfinder","Warden"],
    Shadow:["Assassin","Saboteur","Trickster"], Witch:["Necromancer","Occultist","Elementalist"], Templar:["Inquisitor","Hierophant","Guardian"],
    Scion:["Ascendant","Reliquarian","Luminary"]
  };
  const GOALS = { 0:"Complete the campaign", 1:"Complete Act 1", 2:"Complete Act 2", 3:"Complete Act 3", 4:"Complete Act 4", 5:"Kauri Fortress (Act 6)",
    6:"Complete Act 6", 7:"Complete Act 7", 8:"Complete Act 8", 9:"Complete Act 9", 10:"Defeat bosses" };
  let ACT_OF = {}, GEMS = { M:new Set(), S:new Set(), U:new Set() };

  function actOf(name){
    let a = ACT_OF[name];
    if(a == null){ const m = / - (?:early |late |mid )?act (\d+)$/i.exec(name); if(m) a = +m[1]; }
    if(a == null && /^defeat /i.test(name)) return "Endgame bosses";
    return a == null ? "Other" : `Act ${a}`;
  }

  /* Which items can exist for a gear slot, given the seed's progressive-gear setting. */
  function gearItems(t, slot){
    const mode = t.slotData?.game_options?.ProgressiveGear;     // 0 off, 1 on, 2 on except uniques
    const prog = `Progressive ${slot}`, flat = RAR.map(r => `${r} ${slot}`);
    if(mode === 1) return [prog];
    if(mode === 0) return flat;
    if(mode === 2) return [prog, `Unique ${slot}`];
    return [prog, ...flat];
  }
  function best(t, slot){
    const prog = t.count(`Progressive ${slot}`);
    for(let i = 3; i >= 0; i--) if(t.has(`${RAR[i]} ${slot}`) || prog > i) return i;
    return -1;
  }
  const rc = i => i < 0 ? "locked" : "r-" + RAR[i].toLowerCase();

  function panel(t){
    const e = t.esc;
    const slotBox = (cls, key, label, linkKey) => {
      const b = best(t, key), links = linkKey ? t.count(`Progressive max links - ${linkKey}`) : 0;
      return `<div class="poe-slot ${cls} ${rc(b)}"${t.hint(gearItems(t, key), label)} title="${e(label)}: ${b < 0 ? "locked" : RAR[b] + " or lower"}">
        <span class="sn">${e(label)}</span><span class="sr">${b < 0 ? "Locked" : RAR[b]}</span>${links ? `<span class="lk">+${links}</span>` : ""}</div>`;
    };
    const multiBox = (cls, label, keys, linkKey) => {
      const bs = keys.map(k => best(t, k)), b = Math.max(...bs), links = t.count(`Progressive max links - ${linkKey}`);
      return `<div class="poe-slot ${cls} ${rc(b)}" title="${e(label)}"><span class="sn">${e(label)}</span>
        <div class="types">${keys.map((k, i) => `<span class="${rc(bs[i])}"${t.hint(gearItems(t, k), k)}>${e(k)}${bs[i] < 0 ? "" : " · " + RAR[bs[i]][0]}</span>`).join("")}</div>
        ${links ? `<span class="lk">+${links}</span>` : ""}</div>`;
    };
    const doll = [
      multiBox("s-weapon", "Weapon", WEAPONS, "Weapon"), multiBox("s-offhand", "Off-hand", ["Shield", "Quiver"], "Offhand"),
      slotBox("s-helmet", "Helmet", "Helmet", "Helm"), slotBox("s-body", "BodyArmour", "Body Armour", "BodyArmour"), slotBox("s-amulet", "Amulet", "Amulet"),
      slotBox("s-ringl", "Ring (left)", "Ring"), slotBox("s-ringr", "Ring (right)", "Ring"),
      slotBox("s-gloves", "Gloves", "Gloves", "Gloves"), slotBox("s-belt", "Belt", "Belt"), slotBox("s-boots", "Boots", "Boots", "Boots")
    ].join("");

    // flasks: a generic progressive unlock fills Normal, then Magic, then Unique
    let fp = t.count("Progressive Flask Unlock");
    const fN = Math.min(5, Math.max(t.count("Progressive Normal Flask Unlock"), fp)); fp -= 5;
    const fM = Math.min(5, Math.max(t.count("Progressive Magic Flask Unlock"), Math.max(0, fp))); fp -= 5;
    const fU = Math.min(5, Math.max(t.count("Progressive Unique Flask Unlock"), Math.max(0, fp)));
    const flaskNames = ["Progressive Flask Unlock", "Progressive Normal Flask Unlock", "Progressive Magic Flask Unlock", "Progressive Unique Flask Unlock"];
    const flasks = [0, 1, 2, 3, 4].map(i => { const r = i < fU ? 3 : i < fM ? 1 : i < fN ? 0 : -1;
      return `<div class="poe-slot flask ${rc(r)}"${t.hint(flaskNames, "Flask slots")} title="Flask slot ${i + 1}: ${r < 0 ? "locked" : RAR[r]}"><span class="sn">${i + 1}</span><span class="sr">${r < 0 ? "—" : RAR[r]}</span></div>`; }).join("");

    const legend = RAR.map(r => `<span class="lg r-${r.toLowerCase()}"><i></i>${r}</span>`).join("") + `<span class="lg locked"><i></i>Locked</span>`;

    const links = Object.entries(LINK_MAX).map(([k, max]) => {
      const n = Math.min(max, t.count(`Progressive max links - ${k}`)), label = { Helm:"Helmet", BodyArmour:"Body Armour", Offhand:"Off-hand" }[k] || k;
      return `<div class="row"${t.hint(`Progressive max links - ${k}`, `${label} links`)}><span>${label}</span><span class="pips">${Array.from({ length:max }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span></div>`;
    }).join("");

    const start = t.slotData?.game_options?.starting_character;
    const classes = Object.entries(CLASSES).map(([base, ascs]) => `<div class="cl">
      <b class="${t.has(base) || base === start ? "on" : ""}"${t.hint(base)}>${base}${base === start ? " ★" : ""}</b>
      ${ascs.map(a => `<span class="asc${t.has(a) ? " on" : ""}"${t.hint(a)}>${a}</span>`).join("")}</div>`).join("");

    const seen = new Set();
    const gems = k => t.items.map(i => i.name).filter(n => GEMS[k].has(n) && !seen.has(k + n) && seen.add(k + n)).sort();
    const gemBox = (k, label, cls) => { const g = gems(k);
      return `<div class="poe-box"><div class="row"><h3>${label}</h3><span>${g.length}</span></div>${g.length ? `<div class="gems">${g.map(n => `<span class="gem ${cls}">${e(n)}</span>`).join("")}</div>` : '<span class="dim">None yet</span>'}</div>`; };

    const goal = t.slotData?.game_options?.goal;
    return `<div class="poe">
      <div class="poe-head"><h3>Equipment</h3><span class="dim">Border = highest rarity allowed in that slot${t.isMine ? " · click a slot or weapon type for a hint" : ""}</span></div>
      <div class="poe-equip"><div><div class="poe-inv">${doll}</div><div class="poe-flasks">${flasks}</div></div>
        <div class="poe-side"><div class="legend">${legend}</div><span class="dim">Yellow +n = extra socket links for that slot.</span>
          ${goal != null ? `<div class="poe-box"><span class="dim">Goal</span><b class="gold">${e(GOALS[goal] || "Custom")}</b></div>` : ""}
          <div class="poe-box"${t.hint("Progressive passive point", "Passive points")}><span class="dim">Passive points</span><span class="big">${t.count("Progressive passive point")}</span></div></div></div>
      <div class="poe-cols">
        <div class="poe-box"><h3>Extra socket links</h3>${links}</div>
        <div class="poe-box"><h3>Classes &amp; ascendancies</h3><div class="classes">${classes}</div>
          ${["Vaal Gems", "Alternate Gems"].filter(n => t.has(n)).map(n => `<span class="dim">Unlocked: ${n}</span>`).join("")}</div>
      </div>
      <div class="poe-cols three">${gemBox("M", "Skill gems", "")}${gemBox("S", "Support gems", "sup")}${gemBox("U", "Utility gems", "util")}</div>
    </div>`;
  }

  APTracker.register({
    game: "Path of Exile",
    slotData: true,
    async init(api){
      const [acts, gems] = await Promise.all([api.json("data/acts.json"), api.json("data/gems.json")]);
      for(const [a, names] of Object.entries(acts)) for(const n of names) ACT_OF[n] = +a;
      GEMS = { M:new Set(gems.M), S:new Set(gems.S), U:new Set(gems.U) };
    },
    tabs: [{ id:"gear", label:"Gear & unlocks", render:panel }],
    checksLabel: "Checks by act",
    locationGroup: actOf,
    groupOrder: g => { const m = /^Act (\d+)$/.exec(g); return m ? +m[1] : g === "Endgame bosses" ? 100 : 200; },
    card(t){
      const cls = Object.keys(CLASSES).find(c => t.has(c)) || t.slotData?.game_options?.starting_character;
      const asc = Object.values(CLASSES).flat().find(a => t.has(a));
      return [asc || (cls && cls !== "Unknown" ? cls : ""), `${t.count("Progressive passive point")} passive points`].filter(Boolean).map(t.esc).join(" · ");
    }
  });
})();
