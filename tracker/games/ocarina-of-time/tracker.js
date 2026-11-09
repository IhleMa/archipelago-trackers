/* The Legend of Zelda: Ocarina of Time tracker (Archipelago's own OoT world, from OoT Randomizer).
   Hyrule at dusk: a pause-screen of your own, with the six medallions in a ring around the spiritual stones, the songs
   on a staff, and the inventory and equipment grids; then every area and dungeon of Hyrule.
   What's in logic comes from Archipelago itself: the relay rebuilds the player's world from slot data (relay/ap_logic.py),
   so "ready now" is exact. A few settings make the world pick things at random that slot data doesn't record (entrance
   shuffle, random spawns, shuffled warp songs, random dungeon shortcuts or key rings); for those seeds the relay says so
   and the tracker shows everything without the "ready now" marks.
   Data: data/oot.json (area and kind of every check, from the world), data/icons.json (drawn for this tracker). */
(() => {
  const esc = APTracker.esc;
  let D = null, IC = {};
  const MEDALLIONS = [["Forest Medallion", "m_forest", "#5fcf6a"], ["Fire Medallion", "m_fire", "#ff6b4f"], ["Water Medallion", "m_water", "#4fa8ff"],
    ["Spirit Medallion", "m_spirit", "#ffa13d"], ["Shadow Medallion", "m_shadow", "#b07cff"], ["Light Medallion", "m_light", "#ffe066"]];
  const STONES = [["Kokiri Emerald", "#4fd17a"], ["Goron Ruby", "#ff5a5a"], ["Zora Sapphire", "#5aa8ff"]];
  const SONGS = [["Zeldas Lullaby", "#c9a7ff"], ["Eponas Song", "#ffb066"], ["Sarias Song", "#7fe08a"], ["Suns Song", "#ffe066"], ["Song of Time", "#8fd8ff"], ["Song of Storms", "#b8c4d6"],
    ["Minuet of Forest", "#5fcf6a"], ["Bolero of Fire", "#ff6b4f"], ["Serenade of Water", "#4fa8ff"], ["Requiem of Spirit", "#ffa13d"], ["Nocturne of Shadow", "#b07cff"], ["Prelude of Light", "#ffe066"]];
  const songName = n => n.replace("Zeldas", "Zelda's").replace("Eponas", "Epona's").replace("Sarias", "Saria's").replace("Suns", "Sun's");
  const CHILD_TRADE = ["Weird Egg", "Chicken", "Zeldas Letter", "Keaton Mask", "Skull Mask", "Spooky Mask", "Bunny Hood", "Goron Mask", "Zora Mask", "Gerudo Mask", "Mask of Truth"];
  const ADULT_TRADE = ["Pocket Egg", "Pocket Cucco", "Cojiro", "Odd Mushroom", "Odd Potion", "Poachers Saw", "Broken Sword", "Prescription", "Eyeball Frog", "Eyedrops", "Claim Check"];
  const DUNGEONS = ["Deku Tree", "Dodongo's Cavern", "Jabu Jabu's Belly", "Forest Temple", "Fire Temple", "Water Temple", "Shadow Temple", "Spirit Temple",
    "Bottom of the Well", "Ice Cavern", "Gerudo Training Ground", "Thieves' Hideout", "Ganon's Castle"];
  const REGIONS = [["Forest", ["Kokiri Forest", "the Lost Woods", "Sacred Forest Meadow"]], ["Hyrule", ["Hyrule Field", "Lon Lon Ranch", "the Market", "Temple of Time", "Hyrule Castle", "Outside Ganon's Castle"]],
    ["Kakariko & the mountain", ["Kakariko Village", "the Graveyard", "Death Mountain Trail", "Goron City", "Death Mountain Crater"]],
    ["Zora's waters", ["Zora's River", "Zora's Domain", "Zora's Fountain", "Lake Hylia"]], ["The west", ["Gerudo Valley", "Gerudo's Fortress", "Haunted Wasteland", "Desert Colossus"]]];
  const KIND_ICON = { Chest:"chest", Pot:"pot", FlyingPot:"pot", Crate:"crate", SmallCrate:"crate", "GS Token":"skull", Shop:"shop", NPC:"mask", Freestanding:"heart", RupeeTower:"wallet",
    Beehive:"pot", Scrub:"scrub", GrottoScrub:"scrub", Song:"song_loc", Boss:"boss", BossHeart:"heart", Cutscene:"spell", Collectable:"heart", Drop:"heart", Cow:"cow", ActorOverride:"spell", HintStone:"agony" };
  const KIND_LABEL = { Chest:"Chests", Pot:"Pots", FlyingPot:"Pots", Crate:"Crates", SmallCrate:"Crates", "GS Token":"Skulltulas", Shop:"Shops", NPC:"People", Freestanding:"Freestanding",
    RupeeTower:"Rupees", Beehive:"Beehives", Scrub:"Scrubs", GrottoScrub:"Scrubs", Song:"Songs", Boss:"Bosses", BossHeart:"Heart containers", Cutscene:"Events", Collectable:"Freestanding",
    Drop:"Drops", Cow:"Cows", ActorOverride:"Other", HintStone:"Other" };
  const keyName = d => d.replace(/'/g, "");

  const icon = (k, size, fill, cls) => { const g = IC[k] || IC.chest;
    return `<svg class="oo-i ${cls || ""}" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><path class="s" d="${g.s}" fill-rule="evenodd"${fill ? ` style="fill:${fill}"` : ""}/>${g.d ? `<path class="d" d="${g.d}"/>` : ""}</svg>`; };

  /* ---------- the slot ---------- */
  const cache = new Map();
  function model(t){
    const key = t.slot + "|" + t.items.length + "|" + t.checked.length + "|" + (t.inLogic ? t.inLogic.size : -1);
    if(cache.has(key)) return cache.get(key);
    const logic = t.inLogic, haveLogic = !!logic;
    const locs = t.locations.map(l => { const d = D.locs[l.name] || ["Other", "Other"];
      return { id:l.id, name:l.name, done:l.done, area:d[0], kind:d[1] === "Collectable" && /Cow/.test(l.name) ? "Cow" : d[1], ready:!l.done && haveLogic && logic.has(l.id) }; });
    const byArea = new Map(); for(const l of locs) (byArea.get(l.area) || byArea.set(l.area, []).get(l.area)).push(l);
    const m = { locs, byArea, haveLogic, ready:locs.filter(l => l.ready).length, left:locs.filter(l => !l.done).length };
    cache.set(key, m); if(cache.size > 30) cache.delete(cache.keys().next().value);
    return m;
  }
  const countRe = (t, re) => t.items.filter(i => re.test(i.name)).length;

  /* ---------- Quest ---------- */
  function goalLine(t){
    const sd = t.slotData || {}, med = MEDALLIONS.filter(([n]) => t.has(n)).length, st = STONES.filter(([n]) => t.has(n)).length;
    const tokens = t.count("Gold Skulltula Token"), rewards = med + st;
    const hearts = 3 + t.count("Heart Container") + Math.floor(t.count("Piece of Heart") / 4);
    const cond = (kind, n) => ({ open:["Always open", null, null], vanilla:["Shadow & Spirit medallions and the Light Arrows", null, null],
      stones:["Spiritual stones", st, n], medallions:["Medallions", med, n], dungeons:["Dungeon rewards", rewards, n], tokens:["Gold Skulltula tokens", tokens, n], hearts:["Hearts", hearts, n] })[kind] || [String(kind), null, null];
    const out = [];
    if(sd.triforce_hunt) out.push(["Triforce pieces", t.count("Triforce Piece"), sd.triforce_goal]);
    else {
      const b = cond(sd.bridge, sd["bridge_" + sd.bridge]); out.push(["Rainbow Bridge: " + b[0], b[1], b[2]]);
      if(!["remove", "vanilla", "dungeon", "regional", "overworld", "any_dungeon", "keysanity"].includes(String(sd.shuffle_ganon_bosskey)) && sd.shuffle_ganon_bosskey != null){
        const g = cond(String(sd.shuffle_ganon_bosskey).replace("lacs_", ""), sd["ganon_bosskey_" + String(sd.shuffle_ganon_bosskey).replace("lacs_", "")]); out.push(["Ganon's boss key: " + g[0], g[1], g[2]]); }
    }
    return out;
  }
  function renderQuest(t){
    const m = model(t), sd = t.slotData || {};
    let html = `<div class="oo">`;
    const goals = goalLine(t);
    html += `<section class="oo-hero${t.goal ? " done" : t.logicGoal ? " go" : ""}"><div class="oo-goal"><small>Goal</small><h2>${t.goal ? "Ganon is defeated" : sd.triforce_hunt ? "Reassemble the Triforce" : "Defeat Ganon"}</h2>
        ${goals.map(([label, have, need]) => `<p>${esc(label)}${need != null && have != null ? ` <b>${have} / ${need}</b><span class="oo-bar"><i style="width:${Math.min(100, have / Math.max(1, need) * 100)}%"></i></span>` : ""}</p>`).join("")}
        <em>${t.goal ? "" : t.logicGoal ? "Everything you need for it is in logic." : m.haveLogic ? "Not in logic yet." : ""}</em></div>
      <div class="oo-num go">${m.haveLogic ? `<b>${m.ready}</b><span>ready right now</span>` : `<b>${m.left}</b><span>checks left</span>`}</div>
      <div class="oo-num"><b>${m.locs.length - m.left}<em>/${m.locs.length}</em></b><span>checks done</span></div>
      ${m.haveLogic ? "" : `<p class="oo-warn">${t.logicNote ? esc(t.logicNote) : `"Ready now" needs exact logic on the server: run <code>tracker update</code> in the console.`}</p>`}</section>`;
    // quest status: stones over a ring of medallions, songs on a staff
    html += `<div class="oo-two"><section class="oo-panel oo-quest"><h3>Quest status</h3><div class="oo-ring">
        ${MEDALLIONS.map(([n, ic, c], i) => { const on = t.has(n); return `<span class="oo-med${on ? " on" : ""}" style="--a:${i * 60 - 90}deg;--c:${c}"${on ? "" : t.hint([n], n)} title="${esc(n)}">${icon("medallion", 54, on ? c : null)}<i>${icon(ic, 26, on ? "#fff" : null)}</i></span>`; }).join("")}
        <div class="oo-stones">${STONES.map(([n, c]) => { const on = t.has(n); return `<span class="${on ? "on" : ""}"${on ? "" : t.hint([n], n)} title="${esc(n)}">${icon("stone", 34, on ? c : null)}</span>`; }).join("")}</div></div>
        <div class="oo-qrow"><span${t.has("Stone of Agony") ? ' class="on"' : t.hint(["Stone of Agony"], "Stone of Agony")} title="Stone of Agony">${icon("agony", 30, t.has("Stone of Agony") ? "#ffd36b" : null)}</span>
          <span${t.has("Gerudo Membership Card") ? ' class="on"' : t.hint(["Gerudo Membership Card"], "Gerudo card")} title="Gerudo Membership Card">${icon("card", 30, t.has("Gerudo Membership Card") ? "#ff9fd0" : null)}</span>
          <span class="on" title="Gold Skulltula tokens">${icon("skull", 30, t.count("Gold Skulltula Token") ? "#ffd36b" : null)}<b>${t.count("Gold Skulltula Token")}</b></span>
          <span class="on" title="Heart containers and pieces">${icon("heart", 30, "#ff6b7a")}<b>${3 + t.count("Heart Container") + Math.floor(t.count("Piece of Heart") / 4)}</b><small>${t.count("Piece of Heart") % 4}/4</small></span></div></section>
      <section class="oo-panel oo-songs"><h3>Songs</h3><div class="oo-staff">${SONGS.map(([n, c], i) => { const on = t.has(n);
        return `<span class="oo-song${on ? " on" : ""}" style="--c:${c};--y:${[2, 0, 3, 1, 4, 2, 0, 3, 1, 4, 2, 0][i]}"${on ? "" : t.hint([n], songName(n))} title="${esc(songName(n))}">${icon("note", 34, on ? c : null)}<em>${esc(songName(n).replace(/ of .+$/, ""))}</em></span>`; }).join("")}</div></section></div>`;
    // inventory
    const lvl = (n, names) => { const k = t.count(n); return k ? names[Math.min(k, names.length) - 1] : null; };
    const inv = [
      ["stick", "Deku Sticks", countRe(t, /^Deku Stick/) > 0, ["Deku Stick Capacity", "Deku Stick (1)"]], ["nut", "Deku Nuts", countRe(t, /^Deku Nut/) > 0, ["Deku Nut Capacity", "Deku Nuts (5)"]],
      ["bomb", lvl("Bomb Bag", ["Bomb Bag", "Big Bomb Bag", "Biggest Bomb Bag"]) || "Bombs", t.has("Bomb Bag"), ["Bomb Bag"]], ["bow", lvl("Bow", ["Bow", "Big Quiver", "Biggest Quiver"]) || "Bow", t.has("Bow"), ["Bow"]],
      ["arrow", "Fire Arrows", t.has("Fire Arrows"), ["Fire Arrows"], "#ff6b4f"], ["spell", "Din's Fire", t.has("Dins Fire"), ["Dins Fire"], "#ff6b4f"],
      ["slingshot", lvl("Slingshot", ["Slingshot", "Big Bullet Bag", "Biggest Bullet Bag"]) || "Slingshot", t.has("Slingshot"), ["Slingshot"]],
      ["ocarina", lvl("Ocarina", ["Fairy Ocarina", "Ocarina of Time"]) || "Ocarina", t.has("Ocarina"), ["Ocarina"], t.count("Ocarina") > 1 ? "#5aa8ff" : "#c9a06a"],
      ["bombchu", "Bombchus", countRe(t, /^Bombchus/) > 0, ["Bombchus"]], ["hookshot", lvl("Progressive Hookshot", ["Hookshot", "Longshot"]) || "Hookshot", t.has("Progressive Hookshot"), ["Progressive Hookshot"]],
      ["arrow", "Ice Arrows", t.has("Ice Arrows"), ["Ice Arrows"], "#8fd8ff"], ["spell", "Farore's Wind", t.has("Farores Wind"), ["Farores Wind"], "#7fe08a"],
      ["boomerang", "Boomerang", t.has("Boomerang"), ["Boomerang"]], ["lens", "Lens of Truth", t.has("Lens of Truth"), ["Lens of Truth"]],
      ["beans", "Magic Beans", t.has("Magic Bean") || t.has("Magic Bean Pack") || t.has("Buy Magic Bean"), ["Magic Bean Pack"]], ["hammer", "Megaton Hammer", t.has("Megaton Hammer"), ["Megaton Hammer"]],
      ["arrow", "Light Arrows", t.has("Light Arrows"), ["Light Arrows"], "#ffe066"], ["spell", "Nayru's Love", t.has("Nayrus Love"), ["Nayrus Love"], "#7fb8ff"]];
    const bottles = countRe(t, /^Bottle/) + t.count("Rutos Letter"), child = [...CHILD_TRADE].reverse().find(n => t.has(n)), adult = [...ADULT_TRADE].reverse().find(n => t.has(n));
    html += `<div class="oo-two"><section class="oo-panel"><h3>Items</h3><div class="oo-grid">${inv.map(([ic, label, on, hint, fill]) =>
      `<div class="oo-slot${on ? " on" : ""}"${on ? "" : t.hint(hint, label)} title="${esc(label)}">${icon(ic, 40, on ? (fill || null) : null)}<span>${esc(label)}</span></div>`).join("")}
      <div class="oo-slot${bottles ? " on" : ""}"${bottles ? "" : t.hint(["Bottle"], "Bottle")} title="Bottles">${icon("bottle", 40)}<span>Bottles${bottles ? ` ×${bottles}` : ""}</span></div>
      <div class="oo-slot${child ? " on" : ""}" title="Child trade">${icon(child && /Mask|Hood/.test(child) ? "mask" : "trade", 40)}<span>${esc(child ? child.replace("Zeldas", "Zelda's") : "Child trade")}</span></div>
      <div class="oo-slot${adult ? " on" : ""}" title="Adult trade">${icon("trade", 40)}<span>${esc(adult ? adult.replace("Poachers", "Poacher's") : "Adult trade")}</span></div></div></section>`;
    // equipment
    const eq = [["sword", "Kokiri Sword", t.has("Kokiri Sword"), "#d9dee6"], ["sword", t.has("Biggoron Sword") ? "Biggoron Sword" : "Giant's Knife", t.has("Biggoron Sword") || t.has("Giants Knife"), "#9fd0ff", "Biggoron Sword"],
      ["shield", "Deku Shield", t.has("Deku Shield") || t.has("Buy Deku Shield"), "#c9935a"], ["shield", "Hylian Shield", t.has("Hylian Shield") || t.has("Buy Hylian Shield"), "#5a8cff"], ["shield", "Mirror Shield", t.has("Mirror Shield"), "#ff6b6b"],
      ["tunic", "Goron Tunic", t.has("Goron Tunic") || t.has("Buy Goron Tunic"), "#ff5a4f"], ["tunic", "Zora Tunic", t.has("Zora Tunic") || t.has("Buy Zora Tunic"), "#4f8cff"],
      ["boots", "Iron Boots", t.has("Iron Boots"), "#9aa6b8"], ["boots", "Hover Boots", t.has("Hover Boots"), "#ffd36b"],
      ["bracelet", lvl("Progressive Strength Upgrade", ["Goron's Bracelet", "Silver Gauntlets", "Golden Gauntlets"]) || "Strength", t.has("Progressive Strength Upgrade"), "#ffd36b", "Progressive Strength Upgrade"],
      ["scale", lvl("Progressive Scale", ["Silver Scale", "Golden Scale"]) || "Scale", t.has("Progressive Scale"), t.count("Progressive Scale") > 1 ? "#ffd36b" : "#d9dee6", "Progressive Scale"],
      ["wallet", lvl("Progressive Wallet", ["Adult's Wallet", "Giant's Wallet", "Tycoon's Wallet"]) || "Child's Wallet", t.has("Progressive Wallet"), "#7fe08a", "Progressive Wallet"],
      ["magic", lvl("Magic Meter", ["Magic", "Double Magic"]) || "Magic", t.has("Magic Meter"), "#7fe08a", "Magic Meter"]];
    html += `<section class="oo-panel"><h3>Equipment</h3><div class="oo-grid eq">${eq.map(([ic, label, on, fill, item]) =>
      `<div class="oo-slot${on ? " on" : ""}"${on ? "" : t.hint([item || label.replace(/'/g, "")], label)} title="${esc(label)}">${icon(ic, 40, on ? fill : null)}<span>${esc(label)}</span></div>`).join("")}</div></section></div>`;
    return html + `</div>`;
  }

  /* ---------- Hyrule ---------- */
  function areaCard(t, m, a){
    const l = m.byArea.get(a) || []; if(!l.length) return "";
    const d = l.filter(x => x.done).length, r = l.filter(x => x.ready).length, full = d === l.length;
    const kinds = new Map(); for(const x of l) if(!x.done){ const k = KIND_LABEL[x.kind] || "Other"; const v = kinds.get(k) || [0, 0, KIND_ICON[x.kind] || "chest"]; v[0]++; if(x.ready) v[1]++; kinds.set(k, v); }
    const isD = DUNGEONS.includes(a), kn = keyName(a), mq = l.some(x => / MQ /.test(x.name));
    const keys = isD ? [["key", `Small keys: ${t.count(`Small Key (${kn})`)}${t.has(`Small Key Ring (${kn})`) ? " (ring)" : ""}`, t.count(`Small Key (${kn})`) || t.has(`Small Key Ring (${kn})`), "#d9dee6"],
      ["bosskey", "Boss key", t.has(`Boss Key (${kn})`), "#ffd36b"], ["map", "Map", t.has(`Map (${kn})`), "#c9a06a"], ["compass", "Compass", t.has(`Compass (${kn})`), "#ff8a7a"]]
      .filter(([, , , , ], i) => i === 0 ? t.itemNames.includes(`Small Key (${kn})`) || t.itemNames.includes(`Small Key Ring (${kn})`) : t.itemNames.includes([null, `Boss Key (${kn})`, `Map (${kn})`, `Compass (${kn})`][i])) : [];
    return `<article class="oo-area${r ? " go" : ""}${full ? " full" : ""}${isD ? " dungeon" : ""}"><header><h4>${esc(a.replace(/^the /, "").replace(/^./, c => c.toUpperCase()))}</h4>${mq ? `<em class="oo-mq" title="Master Quest version">MQ</em>` : ""}<span>${d} / ${l.length}</span></header>
      <span class="oo-bar"><i style="width:${d / l.length * 100}%"></i></span>
      ${keys.length ? `<div class="oo-keys">${keys.map(([ic, label, on, fill]) => `<span class="${on ? "on" : ""}" title="${esc(label)}">${icon(ic, 22, on ? fill : null)}${ic === "key" ? `<b>${t.count(`Small Key (${kn})`)}</b>` : ""}</span>`).join("")}</div>` : ""}
      <div class="oo-kinds">${full ? `<span class="done">${icon("check", 16, "#ffd36b")}all done</span>` : [...kinds].map(([k, [n, rr, ic]]) => `<span class="${rr ? "go" : ""}" title="${esc(k)}: ${n} left${rr ? `, ${rr} ready now` : ""}">${icon(ic, 16)}${rr ? `${rr} ready` : n}</span>`).join("")}</div></article>`;
  }
  function renderHyrule(t){
    const m = model(t);
    let html = `<div class="oo">`;
    for(const [title, areas] of REGIONS){
      const cards = areas.map(a => areaCard(t, m, a)).join(""); if(!cards) continue;
      html += `<section class="oo-panel"><h3>${esc(title)}</h3><div class="oo-areas">${cards}</div></section>`;
    }
    const dcards = DUNGEONS.map(a => areaCard(t, m, a)).join("");
    if(dcards) html += `<section class="oo-panel oo-dungeons"><h3>Dungeons</h3><div class="oo-areas">${dcards}</div></section>`;
    const rest = [...m.byArea.keys()].filter(a => !DUNGEONS.includes(a) && !REGIONS.some(([, l]) => l.includes(a))).map(a => areaCard(t, m, a)).join("");
    if(rest) html += `<section class="oo-panel"><h3>Elsewhere</h3><div class="oo-areas">${rest}</div></section>`;
    return html + `</div>`;
  }

  APTracker.register({
    game:"Ocarina of Time",
    slotData:true,
    async init(api){ [D, IC] = await Promise.all([api.json("data/oot.json"), api.json("data/icons.json")]); },
    tabs:[{ id:"oo-quest", label:"Quest", render:renderQuest }, { id:"oo-hyrule", label:"Hyrule", render:renderHyrule }],
    checksLabel:"All checks",
    locationGroup:n => (D?.locs[n]?.[0] || "Other").replace(/^the /, "").replace(/^./, c => c.toUpperCase()),
    card(t){
      const m = model(t), med = MEDALLIONS.filter(([n]) => t.has(n)).length, st = STONES.filter(([n]) => t.has(n)).length;
      return `${m.haveLogic ? `${m.ready} ready now` : `${m.left} checks left`} · ${st}/3 stones · ${med}/6 medallions`;
    }
  });
})();
