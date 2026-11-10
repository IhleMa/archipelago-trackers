/* Pokemon Platinum tracker (ljtpetersen/platinum_archipelago, game "Pokemon Platinum").
   A trainer card on every tab (with a holographic sheen, the badge case and the "ready now" count), then:
   Town Map: Sinnoh as towns, routes and landmarks joined by their paths, with Mt. Coronet down the middle; places where
   you can do something right now pulse, and every such check is listed underneath, place by place along the map.
   Trainer: HMs as discs that spin once you can use them (HM + badge + Bag or HM Reader), and the Pokétch.
   Bag: key items, fly destinations and the GBA cartridges.
   What's in logic comes from Archipelago itself: the relay rebuilds the player's world from slot data (relay/ap_logic.py),
   so "ready now" is exact. Data: data/platinum.json, generated from the world's data_gen TOML files (MIT licence,
   James Petersen). The map layout and all icons are drawn for this tracker. */
(() => {
  let D = null;
  const esc = APTracker.esc;
  const BADGE_COLOR = { "Coal Badge":["#7a4a2a","#c07a3a"], "Forest Badge":["#2f7a3a","#7ccf6a"], "Cobble Badge":["#5a6a7a","#a9b9c9"], "Fen Badge":["#2a5aa8","#79b2ff"],
    "Relic Badge":["#8a6a1a","#e6c24a"], "Mine Badge":["#6a6a72","#d6d6de"], "Icicle Badge":["#3a8aa8","#bdf2ff"], "Beacon Badge":["#b8860b","#ffe066"] };
  const BADGE_SHAPE = { // simple original emblems, one per badge
    "Coal Badge":"M12 3l7 5-3 9H8L5 8z", "Forest Badge":"M12 2l7 11h-4l3 6H6l3-6H5z", "Cobble Badge":"M12 3a9 9 0 1 0 .01 0zM12 8a4 4 0 1 1-.01 0z",
    "Fen Badge":"M12 2c4 6 7 9 7 13a7 7 0 0 1-14 0c0-4 3-7 7-13z", "Relic Badge":"M4 20h16L12 3z", "Mine Badge":"M6 4h12l3 6-9 11L3 10z",
    "Icicle Badge":"M12 2v20M3 7l18 10M21 7L3 17", "Beacon Badge":"M12 2l2.5 6.5L21 9l-5 4.5L17.5 21 12 17l-5.5 4L8 13.5 3 9l6.5-.5z" };
  const HM_KEY = { "HM01 Cut":"cut", "HM02 Fly":"fly", "HM03 Surf":"surf", "HM04 Strength":"strength", "HM05 Defog":"defog", "HM06 Rock Smash":"rock_smash",
    "HM07 Waterfall":"waterfall", "HM08 Rock Climb":"rock_climb", "TM70 Flash":"flash" };
  const HM_COLOR = { cut:"#7ccf6a", fly:"#8fd0ff", surf:"#4f9bff", strength:"#e0855a", defog:"#c9d4e0", rock_smash:"#c07a3a", waterfall:"#5fd8ff", rock_climb:"#b8a07a", flash:"#ffe066" };
  const CART = { "Sapphire Cartridge":"#2f6fd8", "Ruby Cartridge":"#d0383a", "Emerald Cartridge":"#2fa85a", "Fire Red Cartridge":"#e8622c", "Leaf Green Cartridge":"#7cc84a" };

  /* ---------- the Town Map: where each place sits (0-104 × 0-82) and the paths between them ---------- */
  const XY = {
    "Twinleaf Town":[14,72], "Route 201":[19.5,72], "Sandgem Town":[25,72], "Lake Verity":[8,68], "Route 202":[25,65], "Route 219":[25,77], "Route 220":[32,80], "Route 221":[40,80], "Pal Park":[48,80],
    "Jubilife City":[25,58], "Route 218":[17,58], "Canalave City":[9,58], "Iron Island":[5,47], "Fullmoon Island":[3,64], "Route 203":[31.5,58], "Oreburgh Gate":[37,58], "Oreburgh City":[42,58], "Oreburgh Mine":[42,64.5],
    "Route 204":[25,51], "Ravaged Path":[20,50], "Floaroma Town":[25,44], "Route 205":[27,38], "Valley Windworks":[32.5,41], "Fuego Ironworks":[19,37], "Eterna Forest":[27,31], "Old Chateau":[21.5,29], "Eterna City":[34,25],
    "Route 206":[36,33], "Wayward Cave":[39.5,35.5], "Route 207":[40.5,42], "Mt. Coronet":[47,40], "Route 211":[40.5,29], "Celestic Town":[57,28], "Spear Pillar":[52,35],
    "Route 208":[53,44.5], "Hearthome City":[59,46], "Route 209":[65,46], "Lost Tower":[65,51.5], "Solaceon Town":[71,44], "Solaceon Ruins":[76.5,49],
    "Route 210":[71,35], "Route 215":[77,30], "Veilstone City":[83,30], "Route 214":[84,39], "Maniac Tunnel":[89,40], "Lake Valor":[79,52], "Route 213":[73,60], "Pastoria City":[66,60], "Great Marsh":[66,66.5],
    "Route 212":[61,53], "Pokemon Mansion":[56.5,55.5], "Route 222":[88,54], "Sunyshore City":[95,54], "Route 223":[96,44], "Victory Road":[96,34], "Pokemon League":[96,25], "Route 224":[101,20],
    "Route 216":[46,23], "Route 217":[45,16], "Snowpoint City":[45,9], "Lake Acuity":[38,7], "Snowpoint Temple":[51.5,7], "Iceberg Ruins":[39.5,16],
    "Fight Area":[69,15], "Route 230":[77,17], "Route 225":[69,9], "Survival Area":[75,4], "Route 226":[82,4], "Route 227":[88,6], "Stark Mountain":[93,9], "Route 228":[80,10], "Rock Peak Ruins":[84.5,11], "Route 229":[86,15.5], "Resort Area":[91,17] };
  const PATHS = [["Twinleaf Town","Route 201","Sandgem Town"], ["Twinleaf Town","Lake Verity"], ["Sandgem Town","Route 202","Jubilife City"], ["Sandgem Town","Route 219","Route 220","Route 221","Pal Park"],
    ["Jubilife City","Route 218","Canalave City"], ["Jubilife City","Route 203","Oreburgh Gate","Oreburgh City","Oreburgh Mine"], ["Jubilife City","Route 204","Floaroma Town"], ["Route 204","Ravaged Path"],
    ["Floaroma Town","Route 205","Eterna Forest","Eterna City"], ["Route 205","Valley Windworks"], ["Route 205","Fuego Ironworks"], ["Eterna Forest","Old Chateau"],
    ["Eterna City","Route 206","Route 207","Oreburgh City"], ["Route 206","Wayward Cave"], ["Route 207","Mt. Coronet"], ["Eterna City","Route 211","Mt. Coronet","Celestic Town"], ["Mt. Coronet","Spear Pillar"],
    ["Mt. Coronet","Route 208","Hearthome City","Route 209","Solaceon Town","Route 210","Celestic Town"], ["Route 209","Lost Tower"], ["Solaceon Town","Solaceon Ruins"], ["Route 210","Route 215","Veilstone City"],
    ["Veilstone City","Route 214","Lake Valor","Route 213","Pastoria City","Great Marsh"], ["Route 214","Maniac Tunnel"], ["Pastoria City","Route 212","Hearthome City"], ["Route 212","Pokemon Mansion"],
    ["Lake Valor","Route 222","Sunyshore City","Route 223","Victory Road","Pokemon League","Route 224"],
    ["Mt. Coronet","Route 216","Route 217","Snowpoint City","Lake Acuity"], ["Snowpoint City","Snowpoint Temple"], ["Route 217","Iceberg Ruins"],
    ["Fight Area","Route 225","Survival Area","Route 226","Route 227","Stark Mountain"], ["Survival Area","Route 228","Route 229","Resort Area"], ["Route 228","Rock Peak Ruins"], ["Fight Area","Route 230"]];
  const SEA = [["Canalave City","Iron Island"], ["Canalave City","Fullmoon Island"], ["Snowpoint City","Fight Area"]];   // boat rides
  const short = p => p.replace(/ (Town|City)$/, "").replace(/^Route /, "").replace("Pokemon ", "Pokémon ");

  const placeOf = n => D.prefix[n.split(" - ")[0]] || "Other";
  const checkName = n => { const i = n.indexOf(" - "); return i < 0 ? n : n.slice(i + 3); };
  const areaOrder = p => { let i = 0; for(const [, places] of D.areas){ const j = places.indexOf(p); if(j >= 0) return i + j; i += 100; } return 9999; };

  /* ---------- icons (original, 24×24) ---------- */
  const P = { ball:"M12 2.5a9.5 9.5 0 0 1 9.4 8.2h-6.1a3.4 3.4 0 0 0-6.6 0H2.6A9.5 9.5 0 0 1 12 2.5zM2.6 13.3h6.1a3.4 3.4 0 0 0 6.6 0h6.1a9.5 9.5 0 0 1-18.8 0zM12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
    key:"M7.5 6a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2.7a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM11.5 9.5h10V13h-2v3h-3v-3h-5z",
    wing:"M2.5 14.5C6 8 12 4.5 21.5 4c-1 4-3.5 7-7 8.5 2 .3 3.8.1 5.5-.5-2.5 3.5-6.5 5-11 4.5-2 1.6-4 2.5-6.5 3z",
    rod:"M4 21L19 3.5l1.5 1.3-15 17.5zM19.5 4.5c2 2 2 6-.5 9.5v4h-1.5v-4.3c2-2.8 2-6.2.5-8.2z",
    bike:"M5.5 12a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm13-2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM9 5h4v2h-1.3l1 3H17l-2-3.5 1.7-1 3 5.5-1.8 1-.5-1h-4.6l-2.9 6.3-1.8-.8 2.6-5.6L9.5 7H9z",
    shoe:"M3 16.5V9.5h4l2 2.5 4-.5c3 0 6 1.5 8 4.5v2.5H3zM3 19.5h18V21H3z",
    sun:"M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM11 1.5h2v3.5h-2zm0 17.5h2v3.5h-2zM1.5 11h3.5v2H1.5zm17.5 0h3.5v2H19zM4.2 5.6l1.4-1.4 2.5 2.5-1.4 1.4zm12.3 12.3l1.4-1.4 2.5 2.5-1.4 1.4zM4.2 18.4l2.5-2.5 1.4 1.4-2.5 2.5zM16.5 6.1l2.5-2.5 1.4 1.4-2.5 2.5z",
    moon:"M15.5 2.5A9.5 9.5 0 1 0 21.5 17a7.5 7.5 0 0 1-6-14.5z",
    book:"M4 3.5h12.5a3 3 0 0 1 3 3v14H7a3 3 0 0 1-3-3zm3 13a1.5 1.5 0 0 0 0 3h11v-3z",
    case:"M8.5 4h7v3h4.5v13.5H4V7h4.5zm2 1.5V7h3V5.5zM4 12h16v1.8H4z",
    ticket:"M3 6.5h18v3.2a2.3 2.3 0 0 0 0 4.6v3.2H3v-3.2a2.3 2.3 0 0 0 0-4.6zm11 1.5v8h1.5V8z",
    letter:"M3 5.5h18v13H3zm1.8 1.8L12 12.5l7.2-5.2v-.1H4.8z",
    gem:"M12 2.5l7.5 5-7.5 14-7.5-14z",
    flute:"M3 15.5l14-12 3.5 3.5-12 14zM10 10.5l1 1m1.5-3.5l1 1",
    cart:"M5 3.5h14v17H5zm3 2.5v6h8V6zM8 15h3v2.5H8zm5 0h3v2.5h-3z",
    check:"M4 12.5l5 5L20 6.5l-1.8-1.8L9 14 5.8 10.7z" };
  const icon = (k, size, color) => `<svg class="pp-i" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"${color ? ` style="color:${color}"` : ""}><path d="${P[k] || P.ball}" fill-rule="evenodd"/></svg>`;
  const KEY_ICON = [[/Key$|Key /, "key"], [/Rod$/, "rod"], [/Bicycle/, "bike"], [/Shoes/, "shoe"], [/Daytime/, "sun"], [/Nighttime/, "moon"], [/Journal|Book|Rule|Letter|Card$/, "book"],
    [/Case|Sack|Bag|Box/, "case"], [/Ticket|Pass|Coupon/, "ticket"], [/Parcel|Letter/, "letter"], [/Flute/, "flute"], [/Orb|Chain|Wing|Stone|Gracidea|Charm/, "gem"]];
  const keyIcon = n => (KEY_ICON.find(([re]) => re.test(n)) || [0, "ball"])[1];

  /* ---------- the slot ---------- */
  const cache = new Map();
  function model(t){
    const key = t.slot + "|" + t.checked.length + "|" + t.items.length + "|" + (t.inLogic ? t.inLogic.size : -1);
    if(cache.has(key)) return cache.get(key);
    const logic = t.inLogic, per = new Map();
    for(const l of t.locations){ const p = placeOf(l.name), v = per.get(p) || { done:0, total:0, ready:[], left:0 };
      v.total++; if(l.done) v.done++; else { v.left++; if(logic && logic.has(l.id)) v.ready.push(l.name); } per.set(p, v); }
    const m = { per, haveLogic:!!logic, ready:[...per.values()].reduce((a, v) => a + v.ready.length, 0), left:t.locations.filter(l => !l.done).length };
    cache.set(key, m); if(cache.size > 20) cache.delete(cache.keys().next().value);
    return m;
  }
  const noLogic = t => t.logicNote ? esc(t.logicNote) : `"Ready now" needs exact logic on the server: run <code>tracker update</code> in the console.`;
  const sec = (title, body, note = "", ic = "") => body ? `<section class="pp-sec"><div class="pp-shead"><h3>${ic ? icon(ic, 20) : ""}${title}</h3>${note ? `<span class="pp-dim">${note}</span>` : ""}</div>${body}</section>` : "";

  /* ---------- trainer card (every tab) ---------- */
  function card(t, m){
    const sd = t.slotData || {}, nBadges = D.badges.filter(b => t.has(b)).length, dex = t.count("Upgradable Pokedex");
    const badges = D.badges.map((b, i) => { const on = t.has(b), [dark, light] = BADGE_COLOR[b] || ["#555", "#aaa"];
      return `<div class="pp-badge${on ? " on" : ""}"${on ? "" : t.hint(b)} title="${esc(b)}" style="--d:${i * .35}s"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${BADGE_SHAPE[b] || "M12 3a9 9 0 1 0 .01 0z"}" fill="${on ? light : "none"}" stroke="${on ? dark : "#8b8170"}" stroke-width="1.6" stroke-linejoin="round"/></svg><span>${esc(b.replace(" Badge", ""))}</span></div>`; }).join("");
    return `<div class="pp-card${t.goal ? " won" : ""}"><div class="pp-cardtop"><span>TRAINER CARD</span><span>${t.goal ? "Hall of Fame" : "Sinnoh"}</span></div>
      <div class="pp-cardbody"><div class="pp-info"><span class="pp-k">Name</span><b class="pp-name">${esc(t.name)}</b>
        <div class="pp-stats">${m.haveLogic ? `<div class="pp-ready${m.ready ? " live" : ""}">${icon("ball", 26)}<div><span class="pp-k">Ready now</span><b>${m.ready}</b></div></div>` : ""}<div><span class="pp-k">Badges</span><b>${nBadges}/8</b></div><div><span class="pp-k">Checks</span><b>${t.checked.length}/${t.locations.length}</b></div>
        ${t.itemNames.includes("Upgradable Pokedex") ? `<div${t.hint("Upgradable Pokedex", "Pokédex")}><span class="pp-k">Pokédex</span><b>${dex === 0 ? "None" : dex >= 3 ? "National" : "Lv " + dex}</b></div>` : ""}
        ${sd.regional_dex_goal ? `<div><span class="pp-k">Dex goal</span><b>${sd.regional_dex_goal} seen</b></div>` : ""}</div>
        <span class="pp-goal">${t.goal ? "Hall of Fame entered!" : `Goal: defeat Champion Cynthia${t.logicGoal ? " · <b>you can do it now!</b>" : ""}`}</span>
        ${m.haveLogic ? "" : `<span class="pp-goal pp-nologic">${noLogic(t)}</span>`}</div>
        <div class="pp-case">${badges}</div></div></div>`;
  }

  /* ---------- Town Map tab ---------- */
  // a tapped (or clicked) place stays open across re-renders until it's tapped again or something else is
  let openPlace = null;
  function toggleHot(e){
    if(e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
    const hot = e.target.closest && e.target.closest(".pp-hot");
    if(hot && e.target.closest(".pp-pop") && e.type === "click") return;   // clicks inside the card don't close it
    if(e.type === "keydown"){ if(!hot) return; e.preventDefault(); }
    const place = hot ? hot.dataset.place : null;
    openPlace = place && openPlace !== place ? place : null;
    for(const h of document.querySelectorAll(".pp-hot")){ const on = h.dataset.place === openPlace; h.classList.toggle("open", on); h.setAttribute("aria-expanded", on); }
  }
  document.addEventListener("click", toggleHot);
  document.addEventListener("keydown", toggleHot);
  function renderMap(t){
    const m = model(t), logic = m.haveLogic;
    const st = p => { const v = m.per.get(p); if(!v) return "none"; return v.done === v.total ? "done" : v.ready.length ? "go" : logic ? "shut" : "part"; };
    const lines = PATHS.map(chain => `<polyline points="${chain.filter(p => XY[p]).map(p => XY[p].join(",")).join(" ")}"/>`).join("");
    const sea = SEA.map(([a, b]) => `<line x1="${XY[a][0]}" y1="${XY[a][1]}" x2="${XY[b][0]}" y2="${XY[b][1]}"/>`).join("");
    const nodes = Object.entries(XY).map(([p, [x, y]]) => {
      const v = m.per.get(p), s = st(p), town = D.towns.includes(p), route = /^Route /.test(p), r = v ? v.ready.length : 0;
      const title = `${p}${v ? `: ${v.done} of ${v.total} done${r ? `, ${r} ready now` : logic && v.left ? ", nothing reachable yet" : ""}` : ": no checks here"}`;
      const shape = town ? `<rect x="${x - 2.2}" y="${y - 1.4}" width="4.4" height="2.8" rx=".6"/>` : route ? `<circle cx="${x}" cy="${y}" r=".8"/>` : `<rect x="${x - 1.1}" y="${y - 1.1}" width="2.2" height="2.2" rx=".3" transform="rotate(45 ${x} ${y})"/>`;
      const label = town ? `<text x="${x}" y="${y + 3.4}" class="t">${esc(short(p))}</text>` : route ? `<text x="${x + 1.3}" y="${y - .9}" class="r">${esc(short(p))}</text>` : `<text x="${x}" y="${y + 2.9}" class="l">${esc(short(p))}</text>`;
      const cx = x + (town ? 2.5 : route ? -1.4 : 1.4), cy = y - (town ? 1.8 : 1.4);
      return `<g class="n ${s}${town ? " town" : ""}">${v ? "" : `<title>${esc(title)}</title>`}${s === "go" ? `<circle class="halo" cx="${x}" cy="${y}" r="${town ? 3 : 1.9}"/>` : ""}${shape}${label}${r ? `<g class="cnt"><circle cx="${cx}" cy="${cy}" r="1.25"/><text x="${cx}" y="${cy + .5}">${r}</text></g>` : ""}</g>`;
    }).join("");
    const ridge = `<path class="ridge" d="M47 17 l1.6 3 1.4-2.4 1.5 3.2 1.2-2 1.6 3.5M43 47 l1.2-2.4 1.1 2 1.2-2.8 1.1 1.9 1.2-2.5 1.1 2"/>`;
    // hotspots over the map: hover (or tap) a place to see the checks you can do there
    const pct = (x, y) => `left:${((x + 2) / 108 * 100).toFixed(2)}%;top:${((y + 2) / 87 * 100).toFixed(2)}%`;
    const hots = Object.entries(XY).filter(([p]) => m.per.get(p)).map(([p, [x, y]]) => {
      const v = m.per.get(p), r = v.ready, town = D.towns.includes(p), dir = (x > 62 ? " l" : "") + (y > 44 ? " u" : "");
      const title = `${p}: ${v.done} of ${v.total} done${r.length ? `, ${r.length} ready now` : ""}`;
      const body = r.length ? `<ul>${r.slice(0, r.length > 9 ? 8 : 9).map(n => `<li>${esc(checkName(n))}</li>`).join("")}</ul>${r.length > 9 ? `<small class="more">and ${r.length - 8} more in the list below</small>` : ""}`
        : `<small>${v.done === v.total ? "Everything here is done." : logic ? "Nothing reachable here yet." : `${v.left} check${v.left === 1 ? "" : "s"} left.`}</small>`;
      return `<div class="pp-hot${town ? " town" : ""}${r.length ? " go" : ""}${openPlace === p ? " open" : ""}" style="${pct(x, y)}" tabindex="0" role="button" data-place="${esc(p)}" aria-label="${esc(title)}" aria-expanded="${openPlace === p}">
        <div class="pp-pop${dir}"><header><b>${esc(p)}</b><span>${r.length ? `<em>${r.length} ready</em> · ` : ""}${v.done}/${v.total} done</span></header>${body}</div></div>`;
    }).join("");
    const svg = `<div class="pp-mapwrap"><div class="pp-mapbox"><svg class="pp-map" viewBox="-2 -2 108 87" role="img" aria-label="Town Map of Sinnoh">
      <defs><pattern id="ppgrid" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M4 0H0V4" fill="none"/></pattern></defs>
      <rect class="bg" x="-2" y="-2" width="108" height="87" rx="3"/><rect class="grid" x="-2" y="-2" width="108" height="87" fill="url(#ppgrid)"/>
      <text class="area" x="66" y="1.5">BATTLE ZONE</text><text class="area" x="39" y="50.5">MT. CORONET</text>
      ${ridge}<g class="sea">${sea}</g><g class="paths">${lines}</g>${nodes}</svg>${hots}</div></div>`;

    // the checks you can do, place by place
    const places = [...m.per].filter(([, v]) => v.ready.length).sort((a, b) => areaOrder(a[0]) - areaOrder(b[0]));
    const blocked = [...m.per].filter(([, v]) => v.left && !v.ready.length).sort((a, b) => areaOrder(a[0]) - areaOrder(b[0]));
    const areaOf = p => (D.areas.find(([, l]) => l.includes(p)) || ["Elsewhere"])[0];
    let list = "", lastArea = null;
    for(const [p, v] of places){
      const a = areaOf(p);
      if(a !== lastArea){ if(lastArea !== null) list += `</div>`; list += `<h4>${esc(a)}</h4><div class="pp-rplaces">`; lastArea = a; }
      list += `<article class="pp-rplace${D.towns.includes(p) ? " town" : ""}"><header><span>${esc(p)}</span><small>${v.ready.length} ready · ${v.done}/${v.total} done</small></header>
        <ul>${v.ready.slice(0, v.ready.length > 8 ? 6 : 8).map(n => `<li>${esc(checkName(n))}</li>`).join("")}</ul>${v.ready.length > 8 ? `<details><summary>Show ${v.ready.length - 6} more</summary><ul>${v.ready.slice(6).map(n => `<li>${esc(checkName(n))}</li>`).join("")}</ul></details>` : ""}</article>`;
    }
    if(lastArea !== null) list += `</div>`;
    const head = `<div class="pp-readyhead${t.goal ? " won" : t.logicGoal ? " goal" : ""}"><div class="pp-bigball" aria-hidden="true"></div>
      <div><b>${!logic ? "Town Map" : t.goal ? "Champion!" : m.ready ? `${m.ready} check${m.ready === 1 ? "" : "s"} you can do right now` : m.left ? "Nothing reachable right now" : "Every check done"}</b>
      <span>${!logic ? noLogic(t) : t.goal ? "You entered the Hall of Fame." : t.logicGoal ? "And the Champion is in reach: you have everything for the Pokémon League." : m.ready ? `In ${places.length} place${places.length === 1 ? "" : "s"}, pulsing on the map · ${m.left} checks left in all` : m.left ? "Wait for more items from the other players, or ask for a hint." : ""}</span></div></div>`;
    return `<div class="pp">${card(t, m)}${head}${svg}
      <p class="pp-legend"><span class="go">pulsing: checks you can do now</span><span class="done">gold: all done</span>${logic ? `<span class="shut">dim: nothing reachable yet</span>` : ""}<span>hover or tap a place to see its checks</span></p>
      ${list ? sec("Ready now", list, "Every check you can do with what you have, along the map", "ball") : ""}
      ${blocked.length && logic ? sec("Not reachable yet", `<div class="pp-blocked">${blocked.map(([p, v]) => `<span>${esc(p)} <small>${v.left}</small></span>`).join("")}</div>`, "Checks left here need something you don't have yet") : ""}
    </div>`;
  }

  /* ---------- Trainer tab: HMs and the Pokétch ---------- */
  function renderTrainer(t){
    const m = model(t), sd = t.slotData || {};
    const needBag = sd.bag === 1 && t.itemNames.includes("Bag"), hasBag = !needBag || t.has("Bag");
    const removed = new Set((sd.remove_badge_requirements || []).map(x => String(x).toLowerCase()));
    const badgeNeeded = hm => !(removed.has("all") || removed.has(hm));
    // the world's rule is HM + its badge + (Bag, or the HM Reader for most moves) + a Pokémon that can use it
    const reader = t.itemNames.includes("HM Reader") && t.has("HM Reader");
    const BAG_ALWAYS = new Set(["fly", "defog", "flash"]); // the HM Reader doesn't replace the Bag for these
    const hms = D.hms.filter(n => t.itemNames.includes(n)).map(n => {
      const key = HM_KEY[n], badge = key !== "flash" ? D.hmBadge[key] : null, needB = badge && badgeNeeded(key);
      const bagOk = hasBag || (!BAG_ALWAYS.has(key) && reader);
      const haveHM = t.has(n), haveB = !needB || t.has(badge), usable = haveHM && haveB && bagOk;
      const missing = [!haveHM && n, needB && !t.has(badge) && badge, !bagOk && "Bag"].filter(Boolean);
      return `<div class="pp-hm${usable ? " on" : haveHM ? " half" : ""}" style="--hc:${HM_COLOR[key] || "#c9ced8"}"${missing.length ? t.hint(missing, n) : ""}>
        <span class="pp-disc"><i></i></span><div><b>${esc(n.replace(/^(HM|TM)\d+ /, ""))}<em>${esc(n.split(" ")[0])}</em></b>
        <small>${usable ? "Ready to use" : missing.map(x => x === n ? "need the " + (n.startsWith("TM") ? "TM" : "HM") : "need " + x).join(" · ")}</small></div></div>`; }).join("");
    // Pokétch: the "Poketch" item turns it on; apps are separate items. Parcel + Coupons 1-3 open the Jubilife Pokétch checks.
    const watchItem = t.itemNames.includes("Poketch"), watchOn = !watchItem || t.has("Poketch");
    const apps = D.poketch.filter(n => n !== "Poketch" && t.itemNames.includes(n)).map(n => `<div class="pp-app${t.has(n) ? " on" : ""}"${t.has(n) ? "" : t.hint(n)}>${esc(n.replace("POKeMON", "POKéMON"))}</div>`).join("");
    const coupons = ["Parcel", "Coupon 1", "Coupon 2", "Coupon 3"].filter(n => t.itemNames.includes(n));
    return `<div class="pp">${card(t, m)}
      ${sec("HMs", hms && `<div class="pp-hms">${hms}</div>`, (removed.has("all") ? "Badge requirements removed" : "Each HM needs its badge" + (needBag ? " and the Bag" : "")) + " (plus a Pokémon that can learn it)" + (t.isMine ? " · click one you can't use yet for a hint" : ""), "ball")}
      ${sec("Pokétch", apps && `<div class="pp-poketch${watchOn ? "" : " off"}"><div class="pp-watch"${watchOn ? "" : t.hint("Poketch")}><span class="pp-btn"></span><div class="pp-lcd">${apps}</div><span class="pp-btn"></span></div>
        ${watchOn ? "" : `<span class="pp-lcdnote">You don't have the Pokétch yet, so these apps can't be used. Click the watch for a hint.</span>`}
        ${coupons.length ? `<div class="pp-coupons"><span class="pp-k">Jubilife Pokétch campaign</span>${coupons.map(n => `<span class="pp-chip${t.has(n) ? " on" : ""}"${t.has(n) ? "" : t.hint(n)}>${esc(n)}</span>`).join("")}</div>` : ""}</div>`, watchItem ? (watchOn ? "Pokétch on your wrist" : "Pokétch missing") : "")}
    </div>`;
  }

  /* ---------- Bag tab ---------- */
  function renderBag(t){
    const m = model(t), sd = t.slotData || {};
    const specials = Object.values(D.special).filter(n => t.itemNames.includes(n));
    const keyList = [...D.keyItems.filter(n => !/^(Parcel|Coupon \d)$/.test(n)), "HM Reader", ...specials.filter(n => n !== "Upgradable Pokedex")].filter((n, i, a) => t.itemNames.includes(n) && a.indexOf(n) === i);
    const have = keyList.filter(n => t.has(n)).length;
    const keys = keyList.sort((a, b) => (t.has(b) - t.has(a)) || a.localeCompare(b)).map(n => { const on = t.has(n);
      return `<div class="pp-key${on ? " on" : ""}"${on ? "" : t.hint(n)}>${icon(keyIcon(n), 20)}<span>${esc(n)}</span></div>`; }).join("");
    const fly = sd.randomize_fly_items ? D.fly.filter(n => t.itemNames.includes(n)).map(n => { const on = t.has(n);
      return `<div class="pp-key fly${on ? " on" : ""}"${on ? "" : t.hint(n)}>${icon("wing", 20)}<span>${esc(n.replace(/ Fly Region$/, ""))}</span></div>`; }).join("") : "";
    const carts = D.cartridges.filter(n => t.itemNames.includes(n)).map(n => { const on = t.has(n);
      return `<div class="pp-cart${on ? " on" : ""}" style="--cc:${CART[n] || "#888"}"${on ? "" : t.hint(n)}><span class="pp-cartbody"><i></i></span><b>${esc(n.replace(/ Cartridge$/, ""))}</b></div>`; }).join("");
    return `<div class="pp">${card(t, m)}
      ${sec("Key items", keys && `<div class="pp-keys">${keys}</div>`, `${have} of ${keyList.length}${t.isMine ? " · click a missing one for a hint" : ""}`, "case")}
      ${sec("Fly destinations", fly && `<div class="pp-keys">${fly}</div>`, "", "wing")}
      ${sec("GBA cartridges", carts && `<div class="pp-carts">${carts}</div>`, "Slot one into the DS to change which Pokémon appear", "cart")}
    </div>`;
  }

  APTracker.register({
    game: "Pokemon Platinum",
    slotData: true,
    async init(api){ D = await api.json("data/platinum.json"); },
    tabs: [{ id:"pp-map", label:"Town Map", render:renderMap }, { id:"trainer", label:"Trainer", render:renderTrainer }, { id:"pp-bag", label:"Bag", render:renderBag }],
    checksLabel: "Checks by place",
    locationGroup: n => placeOf(n),
    groupOrder: g => areaOrder(g),
    card(t){ const b = D.badges.filter(x => t.has(x)).length, m = model(t); return `${m.haveLogic ? `${m.ready} ready now · ` : ""}${b}/8 badges · ${D.hms.filter(h => t.has(h)).length} HMs`; }
  });
})();
