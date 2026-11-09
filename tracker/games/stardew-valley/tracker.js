/* Stardew Valley tracker: a farmer's almanac in a wooden frame, with pixel icons drawn for this tracker.
   What's in logic comes from Archipelago itself: the relay rebuilds the player's world from slot data and asks it
   (relay/ap_logic.py), so "ready now" is exact. Without that (an older server setup) the tracker still shows
   everything, just without the "ready now" marks.
   Data: data/sdv.json (location categories, villagers, option names from the world), data/pix.json (icons). */
(() => {
  const esc = APTracker.esc;
  let D = null, PX = null;
  const SEASONS = ["Spring", "Summer", "Fall", "Winter"];
  const SKILLS = ["Farming", "Fishing", "Foraging", "Mining", "Combat"];
  const TIER = { copper:{ g:"#c46a2e", G:"#efaa70", d:"#7d3d14" }, steel:{}, gold:{ g:"#e3a92b", G:"#ffe08a", d:"#a8741a" }, iridium:{ g:"#8f5bd6", G:"#cfb0fa", d:"#5a3399" } };
  const TOOLS = [
    ["Hoe", "hoe", ["Basic", "Copper", "Steel", "Gold", "Iridium"]], ["Pickaxe", "pickaxe", ["Basic", "Copper", "Steel", "Gold", "Iridium"]],
    ["Axe", "axe", ["Basic", "Copper", "Steel", "Gold", "Iridium"]], ["Watering Can", "can", ["Basic", "Copper", "Steel", "Gold", "Iridium"]],
    ["Trash Can", "trash", ["Basic", "Copper", "Steel", "Gold", "Iridium"]], ["Fishing Rod", "rod", ["None", "Training", "Bamboo", "Fiberglass", "Iridium", "Advanced Iridium"]],
    ["Pan", "pan", ["None", "Copper", "Steel", "Gold", "Iridium"]]];
  const CAT_ICON = { Bundles:"scroll", Friends:"heart", Skills:"star", Tools:"pickaxe", Mines:"ladder", Fish:"fish", Museum:"vase", Crops:"sprout",
    Shipping:"crate", Crafting:"hammer", Cooking:"pot", Eating:"egg", Books:"book", Monsters:"slime", Quests:"quest", Festivals:"flag", Island:"palm",
    Secrets:"secret", Hats:"hat", Arcade:"arcade", Farm:"barn", Shops:"coin", Other:"chest" };
  const CAT_LABEL = { Farm:"Farm & buildings", Shops:"Shops & movies", Other:"Odds & ends" };
  const ROOM_ICON = { "Crafts Room":"hammer", "Pantry":"jar", "Fish Tank":"fish", "Boiler Room":"gear", "Bulletin Board":"pin", "Vault":"coin", "Abandoned Joja Mart":"crate" };
  const ROOM_TINT = { "Crafts Room":"#7fb04f", "Pantry":"#e3a92b", "Fish Tank":"#3c8fe0", "Boiler Room":"#d8434b", "Bulletin Board":"#c9739a", "Vault":"#c08a2e", "Abandoned Joja Mart":"#3f6fb3" };
  const KEY_ITEMS = ["Rusty Key", "Skull Key", "Club Card", "Dark Talisman", "Magic Ink", "Dwarvish Translation Guide", "Magnifying Glass", "Bear's Knowledge",
    "Bridge Repair", "Greenhouse", "Glittering Boulder Removed", "Minecarts Repair", "Bus Repair", "Boat Repair", "Island Obelisk", "Beach Bridge",
    "Railroad Boulder Removed", "Landslide Removed", "Forest Magic", "Wizard Invitation", "Community Center Key", "Special Order Board", "Stardrop",
    "Iridium Snake Milk", "Fruit Bats", "Mushroom Boxes", "Earth Obelisk", "Water Obelisk", "Desert Obelisk", "Junimo Hut", "Gold Clock",
    "Progressive Movie Theater", "Trash Bear Arrival", "Mr Qi's Plane Ride", "Men's Locker Key", "Women's Locker Key"];
  const KEY_ICON = n => /Key|Card|Talisman|Ink/.test(n) ? "key" : /Bus/.test(n) ? "bus" : /Minecart/.test(n) ? "cart" : /Bridge/.test(n) ? "bridge"
    : /Boat|Plane/.test(n) ? "boat" : /Greenhouse/.test(n) ? "greenhouse" : /Obelisk|Hut|Clock/.test(n) ? "secret" : /Guide|Knowledge|Glass/.test(n) ? "book" : "star";
  const BUILD = { "Progressive Coop":["Coop", "Big Coop", "Deluxe Coop"], "Progressive Barn":["Barn", "Big Barn", "Deluxe Barn"], "Progressive Shed":["Shed", "Big Shed"],
    "Progressive House":["Kitchen", "Kids Room", "Cellar"] };
  const SINGLE_BUILD = ["Well", "Silo", "Mill", "Fish Pond", "Stable", "Slime Hutch", "Shipping Bin", "Pet Bowl"];
  const QUALITY = { "Silver":"#b9c3cc", "Gold":"#f5c542", "Iridium":"#a873f0" };

  /* ---------- pixel icons ---------- */
  const pixCache = new Map();
  function pix(name, size, over, cls){
    const key = name + "|" + JSON.stringify(over || {});
    let body = pixCache.get(key);
    if(body == null){
      const rows = PX.icons[name] || PX.icons.star, paths = {};
      rows.forEach((r, y) => { for(let x = 0; x < r.length; x++){ const c = r[x]; if(c === ".") continue; (paths[c] = paths[c] || []).push(`M${x} ${y}h1v1h-1z`); } });
      body = Object.entries(paths).map(([c, d]) => `<path fill="${(over && over[c]) || PX.palette[c]}" d="${d.join("")}"/>`).join("");
      pixCache.set(key, body);
    }
    return `<svg class="sv-px ${cls || ""}" viewBox="0 0 12 12" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;
  }
  const tierOver = n => ({ 1:TIER.copper, 2:TIER.steel, 3:TIER.gold, 4:TIER.iridium, 5:TIER.iridium })[n] || null;

  /* ---------- the slot's checks, sorted into categories ---------- */
  let catOf = null;
  const cache = new Map();
  function model(t){
    if(!catOf){ catOf = new Map(); for(const [c, names] of Object.entries(D.byCat)) for(const n of names) catOf.set(n, c); }
    const key = t.slot + "|" + t.items.length + "|" + t.checked.length + "|" + (t.inLogic ? t.inLogic.size : -1);
    if(cache.has(key)) return cache.get(key);
    const logic = t.inLogic, haveLogic = !!logic;
    const locs = t.locations.map(l => {
      const c = /^Complete /.test(l.name) && D.rooms[l.name] ? "Bundles" : catOf.get(l.name) || "Other";
      return { id:l.id, name:l.name, done:l.done, cat:c, ready:!l.done && haveLogic && logic.has(l.id) };
    });
    const byCat = {}; for(const l of locs) (byCat[l.cat] = byCat[l.cat] || []).push(l);
    const m = { locs, byCat, haveLogic, ready:locs.filter(l => l.ready).length, left:locs.filter(l => !l.done).length };
    cache.set(key, m); if(cache.size > 30) cache.delete(cache.keys().next().value);
    return m;
  }
  const optName = (o, v) => (D.opts[o] || {})[String(v)] || String(v);
  const pretty = s => String(s).replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
  const short = n => n.replace(/^[A-Za-z]+sanity: /, "").replace(/^(Craft|Cook|Read|Harvest|Ship|Eat|Drink|Wear|Purchase) /, "");
  const frame = (cls, inner) => `<section class="sv-frame ${cls || ""}">${inner}</section>`;

  /* ---------- Farm ---------- */
  function seasonsOwned(t){
    const mode = optName("SeasonRandomization", t.slotData.season_randomization ?? 0);
    if(mode === "disabled") return SEASONS.slice();
    if(mode === "progressive"){ const n = t.count("Progressive Season"); return SEASONS.slice(0, Math.min(4, n)); }
    return SEASONS.filter(s => t.has(s));
  }
  function renderFarm(t){
    const m = model(t), sd = t.slotData, goal = optName("Goal", sd.goal ?? 0);
    const owned = seasonsOwned(t), smode = optName("SeasonRandomization", sd.season_randomization ?? 0);
    let html = `<div class="sv">`;
    // almanac header: goal and what can be done now
    const goalState = t.goal ? "done" : t.logicGoal ? "reach" : "";
    html += frame("sv-head", `<div class="sv-goal ${goalState}">${pix(goal === "master_angler" ? "fish" : goal === "bottom_of_the_mines" ? "ladder" : goal === "community_center" ? "scroll" : goal === "greatest_walnut_hunter" ? "walnut" : goal === "protector_of_the_valley" ? "combat" : goal === "complete_collection" ? "vase" : "star", 56)}
        <div><small>Goal</small><b>${esc(pretty(goal))}</b><span>${t.goal ? "Completed. Well farmed!" : t.logicGoal ? "Everything you need for it is in logic." : m.haveLogic ? "Not reachable in logic yet." : "&nbsp;"}</span></div></div>
      <div class="sv-now">${m.haveLogic ? `<b>${m.ready}</b><span>things you can do right now</span>` : `<b>${m.left}</b><span>checks left</span><em>"Ready now" needs exact logic on the server (run <code>tracker update</code> in the console).</em>`}</div>
      <div class="sv-left"><b>${m.locs.length - m.left}</b><span>of ${m.locs.length} done</span><i class="sv-bar"><i style="width:${m.locs.length ? (1 - m.left / m.locs.length) * 100 : 0}%"></i></i></div>`);
    // seasons
    html += frame("", `<h3>${pix("summer", 24)}Seasons <small>${smode === "disabled" ? "all open from the start" : smode === "progressive" ? "unlocked one after another" : "each one is an item"}</small></h3>
      <div class="sv-seasons">${SEASONS.map(s => { const on = owned.includes(s);
        return `<div class="sv-season ${s.toLowerCase()}${on ? " on" : ""}"${on ? "" : t.hint(smode === "progressive" ? ["Progressive Season"] : [s], s)}>${pix(s.toLowerCase(), 44)}<b>${s}</b><span>${on ? "open" : "locked"}</span></div>`; }).join("")}</div>`);
    // ready by kind
    const cats = D.cats.filter(c => m.byCat[c]);
    html += frame("", `<h3>${pix("check", 24)}Around the valley <small>${m.haveLogic ? "ready now, out of what's left" : "left to do"}</small></h3>
      <div class="sv-kinds">${cats.map(c => { const l = m.byCat[c], left = l.filter(x => !x.done).length, r = l.filter(x => x.ready).length;
        return `<a class="sv-kind${r ? " go" : ""}${!left ? " full" : ""}" href="#" data-sv-jump="${esc(c)}">${pix(CAT_ICON[c] || "chest", 32)}<b>${m.haveLogic ? r : left}</b><span>${esc(CAT_LABEL[c] || c)}</span><small>${l.length - left} / ${l.length}</small></a>`; }).join("")}</div>`);
    // tools
    const tp = optName("ToolProgression", sd.tool_progression ?? 0).startsWith("progressive");
    html += `<div class="sv-two">` + frame("", `<h3>${pix("pickaxe", 24)}Toolbox <small>${tp ? "upgrades are items" : "upgrade them at the blacksmith"}</small></h3>
      <div class="sv-tools">${TOOLS.map(([n, ic, tiers]) => { const k = tp ? Math.min(tiers.length - 1, t.count("Progressive " + n)) : null;
        const none = k === 0 && tiers[0] === "None", tier = k == null ? "" : tiers[k];
        const over = ic === "rod" ? null : tierOver(k);
        return `<div class="sv-tool${none ? " off" : ""}"${tp && k < tiers.length - 1 ? t.hint(["Progressive " + n], n) : ""} title="${esc(n)}${tier ? `: ${tier}` : ""}">${pix(ic, 40, over)}<b>${esc(n)}</b>${tp ? `<span class="sv-pips">${tiers.slice(tiers[0] === "None" ? 1 : 0).map((_, i) => `<i class="${i < (tiers[0] === "None" ? k : k + 1) ? "on" : ""}"></i>`).join("")}</span><small>${esc(tier)}</small>` : ""}</div>`; }).join("")}</div>`);
    // skills
    const sp = optName("SkillProgression", sd.skill_progression ?? 0) !== "vanilla";
    const lvlDone = s => (m.byCat.Skills || []).filter(l => l.done && l.name.endsWith(" " + s)).length;
    html += frame("", `<h3>${pix("star", 24)}Skills <small>${sp ? "levels are items; the bars are what you have" : "the bars are level checks done"}</small></h3>
      <div class="sv-skills">${SKILLS.map(s => { const n = sp ? Math.min(10, t.count(s + " Level")) : lvlDone(s);
        return `<div class="sv-skill"${sp && n < 10 ? t.hint([s + " Level"], s + " Level") : ""}>${pix(s.toLowerCase(), 30)}<b>${s}</b><span class="sv-lv">${Array.from({ length:10 }, (_, i) => `<i class="${i < n ? "on" : ""}${i === 4 || i === 9 ? " big" : ""}"></i>`).join("")}</span><em>${n}</em></div>`; }).join("")}
        ${t.has("Farming Mastery") || t.has("Mastery Of The Five Ways") ? `<p class="sv-note">Masteries: ${["Farming", "Fishing", "Foraging", "Mining", "Combat"].filter(s => t.has(s + " Mastery")).join(", ") || "none yet"}</p>` : ""}</div>`) + `</div>`;
    // mines, backpack, buildings
    const ep = optName("ElevatorProgression", sd.elevator_progression ?? 0) !== "vanilla", floors = Math.min(24, t.count("Progressive Mine Elevator")) * 5;
    const bp = t.count("Progressive Backpack"), bmode = optName("BackpackProgression", sd.backpack_progression ?? 0);
    const builds = [...Object.entries(BUILD).flatMap(([it, names]) => names.slice(0, t.count(it))), ...SINGLE_BUILD.filter(b => t.has(b))];
    html += `<div class="sv-three">` + frame("", `<h3>${pix("ladder", 24)}The mines</h3>${ep ? `<div class="sv-shaft"${floors < 120 ? t.hint(["Progressive Mine Elevator"], "Mine elevator") : ""}><i style="height:${floors / 120 * 100}%"></i>${[20, 40, 60, 80, 100, 120].map(f => `<span style="bottom:${f / 120 * 100}%" class="${floors >= f ? "on" : ""}">${f}</span>`).join("")}</div>
        <p class="sv-note">Elevator down to floor <b>${floors}</b> of 120.</p>` : `<p class="sv-note">The elevator works as in the normal game in this seed.</p>`}
        <p class="sv-note">${(m.byCat.Mines || []).filter(l => l.done).length} of ${(m.byCat.Mines || []).length} mine checks done.</p>`)
      + frame("", `<h3>${pix("backpack", 24)}Backpack</h3><div class="sv-bag">${Array.from({ length:3 }, (_, r) => `<div class="${r <= Math.min(2, bmode === "vanilla" ? 2 : bp) ? "on" : ""}">${Array.from({ length:12 }, () => "<i></i>").join("")}</div>`).join("")}</div>
        <p class="sv-note">${bmode === "vanilla" ? "Bought at Pierre's as usual." : `${bp} Progressive Backpack${bp === 1 ? "" : "s"} received.`}</p>`)
      + frame("", `<h3>${pix("barn", 24)}Farm buildings</h3>${builds.length ? `<ul class="sv-chips">${builds.map(b => `<li class="have">${pix(/Coop/.test(b) ? "egg" : /Barn|Shed|Hutch|Mill|Silo/.test(b) ? "barn" : /Pond/.test(b) ? "fish" : "house", 18)}${esc(b)}</li>`).join("")}</ul>` : `<p class="sv-note">No buildings received yet.</p>`}`) + `</div>`;
    // key items received
    const keys = KEY_ITEMS.filter(n => t.has(n));
    html += frame("", `<h3>${pix("key", 24)}Keys & unlocks <small>${keys.length ? "the ones you have" : "none received yet"}</small></h3>${keys.length ? `<ul class="sv-chips">${keys.map(n => `<li class="have">${pix(KEY_ICON(n), 18)}${esc(n)}${t.count(n) > 1 ? ` ×${t.count(n)}` : ""}</li>`).join("")}</ul>` : ""}`);
    return html + `</div>`;
  }

  /* ---------- Community Center ---------- */
  function renderBundles(t){
    const m = model(t), mb = t.slotData.modified_bundles || {}, byName = new Map(m.locs.map(l => [l.name, l]));
    const rooms = Object.keys(mb);
    if(!rooms.length) return `<div class="sv">${frame("", `<p class="sv-note">This seed has no bundle list in its slot data.</p>`)}</div>`;
    const all = rooms.flatMap(r => Object.keys(mb[r]).map(b => byName.get(b)).filter(Boolean));
    let html = `<div class="sv">` + frame("sv-cchead", `${pix("scroll", 40)}<div><b>Community Center</b><span>${all.filter(l => l.done).length} of ${all.length} bundles done${m.haveLogic ? `, ${all.filter(l => l.ready).length} ready now` : ""}</span></div>`);
    html += `<div class="sv-rooms">` + rooms.map(r => {
      const bundles = Object.entries(mb[r]), comp = byName.get("Complete " + r), tint = ROOM_TINT[r] || "#8a6a3a";
      const done = bundles.filter(([b]) => byName.get(b)?.done).length;
      return `<section class="sv-frame sv-room" style="--tint:${tint}"><header>${pix(ROOM_ICON[r] || "scroll", 32)}<h3>${esc(r)}</h3><span>${done} / ${bundles.length}${comp?.done ? " · complete" : ""}</span></header>
        <div class="sv-bundles">${bundles.map(([b, info]) => {
          const loc = byName.get(b), st = !loc ? "" : loc.done ? "done" : loc.ready ? "go" : m.haveLogic ? "no" : "";
          const items = Object.entries(info).filter(([k]) => k !== "number_required").map(([, v]) => String(v).split("|"));
          const need = info.number_required ?? items.length;
          return `<article class="sv-bundle ${st}"><h4>${loc?.done ? pix("check", 16) : loc?.ready ? pix("star", 16) : ""}${esc(b.replace(/ Bundle$/, ""))}<small>${need < items.length ? `any ${need} of ${items.length}` : `all ${items.length}`}</small></h4>
            <ul>${items.map(([n, amt, q]) => `<li${QUALITY[(q || "").split(" ")[0]] ? ` style="--q:${QUALITY[q.split(" ")[0]]}"` : ""}>${+amt > 1 ? `<em>${esc(amt)}×</em>` : ""}${esc(n)}${QUALITY[(q || "").split(" ")[0]] ? `<i title="${esc(q)} quality">★</i>` : ""}</li>`).join("")}</ul></article>`; }).join("")}</div></section>`;
    }).join("") + `</div>`;
    return html + `</div>`;
  }

  /* ---------- Friends ---------- */
  function renderFriends(t){
    const m = model(t), fr = m.byCat.Friends || [], vill = new Map(D.villagers.map(v => [v[0], v]));
    if(!fr.length) return `<div class="sv">${frame("", `<p class="sv-note">Friendsanity is off in this seed, so hearts aren't checks.</p>`)}</div>`;
    const people = new Map();
    for(const l of fr){ const r = /^Friendsanity: (.+?) (\d+) <3$/.exec(l.name); if(!r) continue; (people.get(r[1]) || people.set(r[1], []).get(r[1])).push(Object.assign({ n:+r[2] }, l)); }
    const list = [...people].sort((a, b) => (b[1].filter(h => h.ready).length - a[1].filter(h => h.ready).length) || a[0].localeCompare(b[0]));
    let html = `<div class="sv">` + frame("sv-cchead", `${pix("heart", 40)}<div><b>Friendship</b><span>${fr.filter(l => l.done).length} of ${fr.length} hearts checked${m.haveLogic ? `, ${fr.filter(l => l.ready).length} ready now` : ""}</span></div>`);
    html += `<div class="sv-people">` + list.map(([name, hearts]) => {
      hearts.sort((a, b) => a.n - b.n); const v = vill.get(name), got = t.count(name + " <3");
      return `<div class="sv-person"${got || !t.itemNames.includes(name + " <3") ? "" : t.hint([name + " <3"], name + " <3")}><span class="sv-badge" style="--h:${[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360}">${esc(name[0])}</span>
        <div><b>${esc(name)}</b>${v ? `<small>${v[1] ? "marriage candidate · " : ""}birthday in ${esc(v[2])}</small>` : ""}${t.itemNames.includes(name + " <3") ? `<small>${got} heart item${got === 1 ? "" : "s"} received</small>` : ""}</div>
        <span class="sv-hearts">${hearts.map(h => `<i class="${h.done ? "done" : h.ready ? "go" : ""}" title="${h.n} hearts: ${h.done ? "done" : h.ready ? "ready now" : "not yet"}">${pix("heart", 16, h.done ? null : h.ready ? { r:"#f39ab0", R:"#fff", c:"#fff" } : { r:"#cdb48d", R:"#e6d3ad", c:"#e6d3ad", k:"#9c7a52" })}</i>`).join("")}</span></div>`; }).join("") + `</div>`;
    return html + `</div>`;
  }

  /* ---------- Collections ---------- */
  const open = new Set(["Fish", "Museum", "Crops"]);
  let hideDone = false;
  function renderCollections(t){
    const m = model(t), cats = D.cats.filter(c => m.byCat[c] && c !== "Bundles" && c !== "Friends");
    let html = `<div class="sv"><div class="sv-toolbar"><label><input type="checkbox" data-sv-hide${hideDone ? " checked" : ""}> Hide finished checks</label>
      <span class="sv-legend"><i class="go"></i>ready now <i class="no"></i>not yet <i class="done"></i>done</span></div>`;
    for(const c of cats){
      const l = m.byCat[c], done = l.filter(x => x.done).length, ready = l.filter(x => x.ready).length, isOpen = open.has(c) || l.length <= 24;
      const order = [...l].sort((a, b) => (b.ready - a.ready) || (a.done - b.done));
      html += `<section class="sv-frame sv-col" id="sv-${esc(c)}"><header data-sv-toggle="${esc(c)}" role="button" tabindex="0" aria-expanded="${isOpen}">${pix(CAT_ICON[c] || "chest", 30)}<h3>${esc(CAT_LABEL[c] || c)}</h3>
        <span class="sv-count">${m.haveLogic && ready ? `<b class="go">${ready} ready</b>` : ""}${done} / ${l.length}</span><i class="sv-bar"><i style="width:${done / l.length * 100}%"></i></i></header>
        ${isOpen ? `<ul class="sv-checks">${order.filter(x => !(hideDone && x.done)).map(x => `<li class="${x.done ? "done" : x.ready ? "go" : m.haveLogic ? "no" : ""}" title="${esc(x.name)}">${esc(short(x.name))}</li>`).join("")}</ul>` : ""}</section>`;
    }
    return html + `</div>`;
  }

  document.addEventListener("click", e => {
    const j = e.target.closest("[data-sv-jump]");
    if(j){ e.preventDefault(); const c = j.dataset.svJump; open.add(c);
      const tab = document.querySelector(`[data-tab="${c === "Bundles" ? "sv-cc" : c === "Friends" ? "sv-friends" : "sv-col"}"]`); if(tab) tab.click();
      setTimeout(() => document.getElementById("sv-" + c)?.scrollIntoView({ behavior:"smooth", block:"start" }), 120); return; }
    const h = e.target.closest("[data-sv-toggle]");
    if(h){ const c = h.dataset.svToggle; open.has(c) ? open.delete(c) : open.add(c); APTracker.refresh(); }
  });
  document.addEventListener("keydown", e => { if((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-sv-toggle]")){ e.preventDefault(); e.target.click(); } });
  document.addEventListener("change", e => { if(e.target.matches?.("[data-sv-hide]")){ hideDone = e.target.checked; APTracker.refresh(); } });

  APTracker.register({
    game:"Stardew Valley",
    slotData:true,
    async init(api){ [D, PX] = await Promise.all([api.json("data/sdv.json"), api.json("data/pix.json")]); },
    tabs:[{ id:"sv-farm", label:"Farm", render:renderFarm }, { id:"sv-cc", label:"Bundles", render:renderBundles },
      { id:"sv-friends", label:"Friends", render:renderFriends }, { id:"sv-col", label:"Collections", render:renderCollections }],
    checksLabel:"All checks",
    locationGroup:n => (catOf && catOf.get(n)) || (/^Complete /.test(n) ? "Bundles" : "Other"),
    groupOrder:["Bundles", "Friends", "Skills", "Tools", "Mines", "Fish", "Museum", "Crops", "Shipping", "Crafting", "Cooking", "Eating", "Books", "Monsters", "Quests", "Festivals", "Island", "Secrets", "Hats", "Arcade", "Farm", "Shops", "Other"],
    card(t){
      const m = model(t), s = seasonsOwned(t);
      return `${m.haveLogic ? `${m.ready} ready now` : `${m.left} checks left`} · ${s.length === 4 ? "all seasons" : s.length ? s.join(", ") : "no season yet"}`;
    }
  });
})();
