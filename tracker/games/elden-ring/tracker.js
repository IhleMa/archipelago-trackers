/* Elden Ring tracker (EldenRing apworld by Bedrock, fswap/Archipelago "er" branch; thefifthmatt's randomizer).
   Goal bosses (defeat read from their drop checks), Great Runes against the seed's thresholds, region locks,
   the lands with checks done per area, key items, flask and character upgrades, remembrances.
   Data: data/eldenring.json, generated from the world's source. That source is Copyright (c) 2026 Bedrock under
   a modified MIT licence (see data/NOTICE.txt). */
(() => {
  let D = null, REGION_OF_PREFIX = {}, REGION_EXCEPT = {}, AREA_OF_REGION = {};
  const regionOf = n => REGION_EXCEPT[n] || REGION_OF_PREFIX[n.includes(":") ? n.slice(0, n.indexOf(":")) : n] || null;

  const AREA_NAMES = { "The hold":"Roundtable Hold", "Stormveil":"Stormveil Castle", "Weeping":"Weeping Peninsula", "Siofra":"Siofra River", "Liurnia":"Liurnia of the Lakes",
    "Nokron":"Nokron, Eternal City", "Ainsel Late":"Ainsel River & Nokstella", "Altus":"Altus Plateau", "Mt Gelmir":"Mt. Gelmir",
    "forbidden lands":"Forbidden Lands", "Mountaintops":"Mountaintops of the Giants", "Farum Azula":"Crumbling Farum Azula",
    "Snowfield":"Consecrated Snowfield", "Haligtree":"Miquella's Haligtree", "Leyndell":"Leyndell, Royal Capital" };
  const areaName = a => AREA_NAMES[a] || a;

  /* Region locks, from the world's _region_lock(): lock item -> regions it opens */
  const LOCKS = {
    "Weeping Lock":["Weeping Peninsula"], "Liurnia Lock":["Liurnia of The Lakes"], "Siofra Lock":["Siofra River","Nokron, Eternal City Start"],
    "Ainsel Lock":["Ainsel River","Ainsel River Main"], "Deeproot Lock":["Deeproot Depths","Deeproot Depths Upper"], "Caelid Lock":["Caelid","Sellia Crystal Tunnel"],
    "Mt. Gelmir Lock":["Mt. Gelmir"], "Volcano Lock":["Volcano Manor Entrance","Volcano Manor Dungeon"], "Sewer Lock":["Subterranean Shunning-Grounds"],
    "Mohgwyn Lock":["Mohgwyn Palace"], "Farum Azula Lock":["Farum Azula"], "Ashen Lock":["Leyndell, Ashen Capital"], "Haligtree Lock":["Miquella's Haligtree"],
    "Gravesite Lock":["Gravesite Plain"], "Belurat Lock":["Belurat","Belurat Swamp"], "Ensis & Scadu Altus Lock":["Castle Ensis","Scadu Altus"],
    "Ellac Lock":["Ellac River"], "Cerulean & Charo Lock":["Cerulean Coast","Charo's Hidden Grave"], "Stone Coffin Lock":["Stone Coffin Fissure"],
    "Jagged Peak Lock":["Jagged Peak Foot"], "Rauh Base Lock":["Rauh Base"], "Shadow Keep Lock":["Shadow Keep","Shadow Keep, Church District"],
    "Recluses' Lock":["Recluses' River"], "Abyssal Lock":["Abyssal Woods"], "Ancient Ruins Lock":["Ancient Ruins of Rauh"]
  };
  const GREAT_RUNES = [["Godrick's Great Rune","Godrick"],["Great Rune of the Unborn","Rennala"],["Radahn's Great Rune","Radahn"],
    ["Rykard's Great Rune","Rykard"],["Morgott's Great Rune","Morgott"],["Mohg's Great Rune","Mohg"],["Malenia's Great Rune","Malenia"]];
  const MEDALLIONS = [["Dectus Medallion (Left)","Dectus Medallion (Right)","Dectus Medallion","Altus Plateau lift"],
    ["Haligtree Secret Medallion (Left)","Haligtree Secret Medallion (Right)","Haligtree Secret Medallion","Haligtree lift"]];
  const KEYS = ["Rold Medallion","Rusty Key","Academy Glintstone Key","Carian Inverted Statue","Drawing-Room Key","Discarded Palace Key","Sewer-Gaol Key",
    "Well Depths Key","Storeroom Key","Prayer Room Key","Gaol Upper Level Key","Gaol Lower Level Key","Imbued Sword Key","Chapel Sword Key","Eternal Sword Key",
    "Crumbling Sword Key","Ancient Sword Key","Messmer's Kindling","Stonesword Master Key"];
  const SHARDS = { "Rold Medallion":"Rold Medallion Shard", "Rusty Key":"Rusty Key Shard", "Messmer's Kindling":"Messmer's Kindling Shard" };
  const COUNTERS = [["Golden Seed","Golden Seeds","Flask uses"],["Sacred Tear","Sacred Tears","Flask potency"],["Talisman Pouch","Talisman Pouches","Talisman slots"],
    ["Memory Stone","Memory Stones","Spell slots"],["Stonesword Key","Stonesword Keys","Imp statues"],["Progressive Smithing-Stone Bell Bearing","Smithing bell bearings",""],
    ["Progressive Somberstone Bell Bearing","Somber bell bearings",""],["Scadutree Fragment","Scadutree Fragments","DLC blessing"],["Revered Spirit Ash","Revered Spirit Ash","Spirit blessing"]];

  const stack = (t, base) => t.items.reduce((a, it) => { const m = new RegExp("^" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?: x(\\d+))?$").exec(it.name); return a + (m ? +(m[1] || 1) : 0); }, 0);


  /* ---------- map: an original schematic of the Lands Between (data/map.json), lit by what you can reach ---------- */
  let MAPD = null;
  const MAP_NAMES = { "Farum Azula":"Farum Azula", "Haligtree":"Haligtree", "Mountaintops":"Mountaintops", "Liurnia":"Liurnia", "Snowfield":"Snowfield" };
  const STATE_WORD = { sealed:"Sealed", open:"Open", done:"Cleared", empty:"No checks here" };
  function worldMap(t, landInfo, dlc){
    if(!MAPD) return "";
    const e = t.esc;
    const region = (area, pts, labelAt) => {
      const L = landInfo(area), c = L.c, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const w = Math.max(...xs) - Math.min(...xs);
      const [cx, cy] = labelAt || [xs.reduce((a, b) => a + b) / xs.length, ys.reduce((a, b) => a + b) / ys.length];
      const name = MAP_NAMES[area] || areaName(area), size = w > 220 ? 24 : w > 120 ? 19 : 15;
      const words = name.replace(/,.*$/, "").split(" "), lines = name.length > 11 && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [name.replace(/,.*$/, "")];
      const tip = `${areaName(area)}: ${STATE_WORD[L.state]}${c ? ` · ${c[0]}/${c[1]} checks` : ""}${L.missing.length ? ` · needs ${[...new Set(L.missing)].slice(0, 4).join(", ")}` : ""}`;
      return [`<g class="er-reg ${L.state}"${L.missing.length ? t.hint(L.missing, name) : ""}><title>${e(tip)}</title><path data-area="${e(area)}" d="${smooth(pts)}"/></g>`,
        `<g class="er-reg er-lbl ${L.state}"><text data-area="${e(area)}" x="${cx}" y="${cy - (lines.length - 1) * size * .5}" style="font-size:${size}px">${lines.map((l, i) => `<tspan x="${cx}" dy="${i ? size * 1.05 : 0}">${e(l)}</tspan>`).join("")}${c ? `<tspan class="er-regn" x="${cx}" dy="${size * 1.05}">${L.state === "done" ? "✦ " : L.state === "sealed" ? "⊘ " : ""}${c[0]}/${c[1]}</tspan>` : ""}</text></g>`];
    };
    // rounded coastlines: curves through the edge midpoints, corners as control points
    const smooth = pts => { const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], n = pts.length, m0 = mid(pts[n - 1], pts[0]);
      return `M${m0.join(",")}` + pts.map((p, i) => `Q${p.join(",")} ${mid(p, pts[(i + 1) % n]).join(",")}`).join("") + "Z"; };
    const draw = (m, extra = "") => { const parts = m.order.map(a => region(a, m.regions[a], m.labels[a]));
      const land = m.order.map(a => `<path d="${smooth(m.regions[a])}"/>`).join("");
      return `<svg viewBox="${(m.view || [0, 0, m.w, m.h]).join(" ")}" role="img" aria-label="Map"><g class="er-landmass">${land}</g>${parts.map(p => p[0]).join("")}${extra}${parts.map(p => p[1]).join("")}</svg>`; };
    // a compass rose and the Erdtree over Leyndell, both drawn here
    const compass = `<g class="er-compass" transform="translate(170 880)"><circle r="44"/><path d="M0-58L8-8 0 0-8-8zM0 58L8 8 0 0-8 8zM-58 0L-8-8 0 0-8 8zM58 0L8-8 0 0 8 8"/><text y="-66">N</text></g>`;
    const tree = `<g class="er-tree" transform="translate(660 284) scale(.36)"><path d="M0 40V-6M0 6C-24-2-44-20-46-44M0 0C22-8 40-26 42-50M0-10C-10-30-14-52-6-70M0-16C10-34 18-54 14-74"/><ellipse cx="0" cy="-48" rx="62" ry="40"/></g>`;
    const inset = area => { const L = landInfo(area), c = L.c; if(!c && L.state !== "sealed") return "";
      return `<div class="er-inset ${L.state}"${L.missing.length ? t.hint(L.missing, areaName(area)) : ""} title="${e(areaName(area) + ": " + STATE_WORD[L.state])}"><b>${e(areaName(area))}</b><span>${L.state === "done" ? "✦ " : L.state === "sealed" ? "⊘ " : ""}${c ? `${c[0]}/${c[1]}` : ""}</span></div>`; };
    queueMicrotask(fitLabels);   // runs once the core has put this HTML on the page
    const below = [...MAPD.under, ...MAPD.offmap].map(inset).join("");
    return `<div class="er-map">${draw(MAPD.main, tree + compass)}</div>
      ${below ? `<div class="er-insets"><span class="er-dim">Below ground and beyond the map</span>${below}</div>` : ""}
      ${dlc ? `<h4>Realm of Shadow</h4><div class="er-map er-map-dlc">${draw(MAPD.dlc)}</div>` : ""}`;
  }

  /* Fit every label inside its own region without touching another label: try the drawn spot first,
     then nearby spots, then smaller type. Results are cached per label text, so live updates stay cheap. */
  const FIT = new Map();
  let fontsWatched = false;
  function fitLabels(){
    if(!fontsWatched && document.fonts){ fontsWatched = true; document.fonts.ready.then(() => { FIT.clear(); fitLabels(); }); }
    for(const svg of document.querySelectorAll(".er-map svg")){
      const shapes = {}; for(const p of svg.querySelectorAll("path[data-area]")) shapes[p.dataset.area] = p;
      const labels = [...svg.querySelectorAll("text[data-area]")].map(el => ({ el, shape:shapes[el.dataset.area] })).filter(l => l.shape && l.shape.isPointInFill);
      // tight regions first: they have the fewest options
      for(const l of labels){ const b = l.shape.getBBox(); l.room = b.width * b.height; }
      labels.sort((a, b) => a.room - b.room);
      const placed = [];
      for(const l of labels){
        const key = svg.viewBox.baseVal.width + "|" + l.el.dataset.area + "|" + l.el.textContent;
        let fit = FIT.get(key);
        const base = parseFloat(l.el.dataset.base || l.el.style.fontSize) || 16;
        if(l.el.dataset.y0 == null){   // remember the drawn size and centre before any fitting
          l.el.dataset.base = base;
          l.el.dataset.y0 = +l.el.getAttribute("y") + (l.el.querySelectorAll("tspan").length - (l.el.querySelector(".er-regn") ? 1 : 0) - 1) * base * .5;
        }
        if(!fit){ fit = place(l, base, placed) ; FIT.set(key, fit); }
        apply(l.el, base, fit);
        const b = l.el.getBBox(); placed.push({ x:b.x + fit.dx, y:b.y + fit.dy, w:b.width, h:b.height });
      }
    }
  }
  function apply(el, base, fit){
    el.style.fontSize = base * fit.s + "px";
    for(const ts of el.querySelectorAll("tspan")) if(ts.getAttribute("dy") && ts.getAttribute("dy") !== "0") ts.setAttribute("dy", (base * 1.05 * fit.s).toFixed(1));
    const first = el.querySelector("tspan"), lines = el.querySelectorAll("tspan").length - (el.querySelector(".er-regn") ? 1 : 0);
    el.setAttribute("transform", `translate(${fit.dx} ${fit.dy})`);
    if(first) el.setAttribute("y", +el.dataset.y0 - (lines - 1) * base * fit.s * .5);
  }
  function place(l, base, placed){
    const el = l.el, shape = l.shape, pad = 3;
    const inside = (x, y) => shape.isPointInFill(new DOMPoint(x, y));
    const offsets = [[0, 0]];
    for(let r = 8; r <= 96; r += 8) for(let a = 0; a < 16; a++) offsets.push([Math.round(r * Math.cos(a * Math.PI / 8)), Math.round(r * Math.sin(a * Math.PI / 8))]);
    for(let s = 1; s >= .5; s -= .06){
      apply(el, base, { s, dx:0, dy:0 });
      const b = el.getBBox();
      for(const [dx, dy] of offsets){
        const x0 = b.x + dx - pad, y0 = b.y + dy - pad, x1 = b.x + b.width + dx + pad, y1 = b.y + b.height + dy + pad;
        const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1], [x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2]];
        if(!pts.every(([x, y]) => inside(x, y))) continue;
        if(placed.some(p => x0 < p.x + p.w && p.x < x1 && y0 < p.y + p.h && p.y < y1)) continue;
        return { s, dx, dy };
      }
    }
    // nothing fits cleanly: smallest type on the drawn spot, nudged off other labels if possible
    for(const [dx, dy] of offsets){ apply(el, base, { s:.5, dx:0, dy:0 }); const b = el.getBBox();
      if(!placed.some(p => b.x + dx < p.x + p.w && p.x < b.x + b.width + dx && b.y + dy < p.y + p.h && p.y < b.y + b.height + dy)) return { s:.5, dx, dy }; }
    return { s:.5, dx:0, dy:0 };
  }

  /* ---------- panel ---------- */
  function panel(t){
    const e = t.esc, sd = t.slotData || {}, o = sd.options || {}, req = sd.requiredShards || {};
    const done = new Set(t.checked), dlc = !!o.enable_dlc, regionLock = o.world_logic === 0;

    // checks per region and area
    const perRegion = {}, perArea = {};
    const locs = t.locations || [...t.checked.map(name => ({ name, done:true })), ...t.missing.map(name => ({ name, done:false }))];
    for(const l of locs){ const r = regionOf(l.name) || "?", a = AREA_OF_REGION[r] || "Other";
      (perRegion[r] ||= [0, 0])[1]++; (perArea[a] ||= [0, 0])[1]++; if(l.done){ perRegion[r][0]++; perArea[a][0]++; } }

    // goal bosses
    const goalFlags = [].concat(sd.goal || []);
    const bossDone = b => b && b[3].length ? b[3].some(n => done.has(n)) : null;
    const goalHtml = goalFlags.map(f => { const b = D.bosses[String(f)]; const st = bossDone(b);
      return `<div class="er-boss${st ? " slain" : ""}"><span class="er-mark">${st ? "✦" : "◇"}</span><div><b>${e(b ? b[0].replace(/\s*\([A-Z]+\)$/, "") : "Boss " + f)}</b>
        <span class="er-dim">${st == null ? "Defeat not tracked" : st ? "Defeated" : "Not yet defeated"}${b && b[2] ? " · Shadow of the Erdtree" : ""}</span></div></div>`; }).join("");

    // great runes
    const have = GREAT_RUNES.filter(([n]) => t.has(n)).length;
    const thresholds = [["Leyndell", o.great_runes_required_leyndell], ["Mountaintops", o.great_runes_required_mountain], ["Erdtree", o.great_runes_required_erdtree]]
      .filter(([, n]) => n > 0);
    const runeNodes = GREAT_RUNES.map(([n, who], i) => { const a = (i / 7) * Math.PI * 2 - Math.PI / 2, x = 50 + 40 * Math.cos(a), y = 50 + 40 * Math.sin(a);
      return `<div class="er-rune${t.has(n) ? " on" : ""}"${t.hint(n, n)} style="left:${x}%;top:${y}%" title="${e(n)}"><i></i><span>${e(who)}</span></div>`; }).join("");
    const runesHtml = `<div class="er-runes"><div class="er-ring">${runeNodes}<div class="er-runecount"><b>${have}</b><span>of 7</span></div></div>
      <div class="er-thresh">${thresholds.length ? thresholds.map(([where, n]) => `<div class="er-row${have >= n ? " ok" : ""}"><span>${where}</span><span>${Math.min(have, n)} / ${n}${have >= n ? " ✦" : ""}</span></div>`).join("") : '<span class="er-dim">No Great Runes required in this seed</span>'}</div></div>`;

    // lands
    const lockOfRegion = {}; for(const [lock, regions] of Object.entries(LOCKS)) for(const r of regions) lockOfRegion[r] = lock;
    const areaLocks = area => {
      const list = new Set();
      for(const r of D.areaList.find(a => a[0] === area)?.[1] || []) if(lockOfRegion[r] && t.itemNames.includes(lockOfRegion[r])) list.add(lockOfRegion[r]);
      return [...list];
    };
    const specialGate = { "Altus":[MEDALLIONS[0][0], MEDALLIONS[0][1]], "Snowfield":[MEDALLIONS[1][0], MEDALLIONS[1][1]], "Mountaintops":["Rold Medallion"] };
    const landInfo = area => {
      const c = perArea[area];
      const gates = [...(regionLock ? areaLocks(area) : []), ...(specialGate[area] || [])];
      const missing = gates.filter(g => !t.has(g) && !(SHARDS[g] && stack(t, SHARDS[g]) >= (req[SHARDS[g]] || 1)));
      // Leyndell also needs a number of Great Runes
      const runeNeed = area === "Leyndell" ? o.great_runes_required_leyndell || 0 : 0, runeShort = runeNeed > have;
      if(runeShort) missing.push(...GREAT_RUNES.map(r => r[0]).filter(n => !t.has(n)));
      const state = missing.length ? "sealed" : !c ? "empty" : c[0] === c[1] ? "done" : "open";
      return { c, gates, missing, runeNeed, runeShort, state };
    };
    const tile = ([area]) => {
      const { c, gates, missing, runeNeed, runeShort, state } = landInfo(area); if(!c) return "";
      return `<div class="er-land ${state}"${missing.length ? t.hint(missing, areaName(area)) : ""} title="${e(areaName(area))}">
        <div class="er-lhead"><span>${e(areaName(area))}</span>${state === "done" ? '<span class="er-mark">✦</span>' : ""}</div>
        <div class="er-lbar"><i style="width:${Math.round(c[0] / c[1] * 100)}%"></i></div>
        <span class="er-lnote">${c[0]} / ${c[1]} checks</span>
        ${gates.length || runeNeed ? `<div class="er-gates">${gates.map(g => `<span class="${missing.includes(g) ? "" : "on"}">${e(g.replace(/ Lock$/, "").replace(/^Haligtree Secret Medallion/, "Secret Medallion"))}</span>`).join("")}${runeNeed ? `<span class="${runeShort ? "" : "on"}">Great Runes ${Math.min(have, runeNeed)}/${runeNeed}</span>` : ""}</div>` : ""}
      </div>`;
    };
    const lands = worldMap(t, landInfo, dlc) + `<h4>The Lands Between</h4><div class="er-lands">${D.areaList.filter(a => !a[2]).map(tile).join("")}</div>`
      + (dlc ? `<h4>Realm of Shadow</h4><div class="er-lands">${D.areaList.filter(a => a[2]).map(tile).join("")}</div>` : "");

    // region locks list
    const lockList = regionLock ? Object.keys(LOCKS).filter(l => t.itemNames.includes(l) && (dlc || !D.dlcLocks.includes(l))).map(l =>
      `<div class="er-item${t.has(l) ? " on" : ""}"${t.hint(l)}><span class="er-mark">${t.has(l) ? "✦" : "◇"}</span><span>${e(l.replace(/ Lock$/, ""))}</span></div>`).join("") : "";

    // key items
    const keyItem = n => {
      if(!t.itemNames.includes(n) && !(SHARDS[n] && t.itemNames.includes(SHARDS[n]))) return "";
      const shard = SHARDS[n], need = shard && req[shard];
      if(need){ const k = stack(t, shard), whole = t.has(n) || k >= need;
        return `<div class="er-item${whole ? " on" : ""}"${t.hint([n, shard], n)}><span class="er-mark">${whole ? "✦" : "◇"}</span><span>${e(n)}</span><small>${Math.min(k, need)}/${need} shards</small></div>`; }
      return `<div class="er-item${t.has(n) ? " on" : ""}"${t.hint(n)}><span class="er-mark">${t.has(n) ? "✦" : "◇"}</span><span>${e(n)}</span></div>`;
    };
    const medallions = MEDALLIONS.map(([l, r, name, use]) => { const a = t.has(l), b = t.has(r);
      return `<div class="er-medal${a && b ? " on" : ""}"><div class="er-halves"><span class="${a ? "on" : ""}"${t.hint(l, name + " (left)")}>Left</span><span class="${b ? "on" : ""}"${t.hint(r, name + " (right)")}>Right</span></div><b>${e(name)}</b><span class="er-dim">${use}</span></div>`; }).join("");
    const masterKeys = t.itemNames.filter(n => / Master Key$/.test(n) && n !== "Stonesword Master Key").sort();
    const masterHtml = o.use_master_key === 1 && masterKeys.length ? `<div class="er-sub">Regional Stonesword keys</div><div class="er-items">${masterKeys.map(n => `<div class="er-item${t.has(n) ? " on" : ""}"${t.hint(n)}><span class="er-mark">${t.has(n) ? "✦" : "◇"}</span><span>${e(n.replace(/ Master Key$/, ""))}</span></div>`).join("")}</div>` : "";

    // counters
    const counters = COUNTERS.filter(([n]) => t.itemNames.includes(n) && (dlc || !/Scadutree|Revered/.test(n))).map(([n, label, sub]) =>
      `<div class="er-count"${t.hint(t.itemNames.filter(x => x === n || x.startsWith(n + " x")), label)}><b>${n.startsWith("Progressive") ? t.count(n) : stack(t, n)}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ""}</div>`).join("");

    const remembrances = t.items.map(i => i.name).filter((n, i, a) => /^Remembrance of|^Elden Remembrance/.test(n) && a.indexOf(n) === i).sort();
    const sec = (title, body, note = "") => body ? `<section class="er-sec"><div class="er-shead"><h3>${title}</h3>${note ? `<span class="er-dim">${note}</span>` : ""}</div>${body}</section>` : "";
    return `<div class="er">
      <div class="er-top"><div class="er-grace" aria-hidden="true"></div><div><span class="er-k">Tarnished</span><b class="er-name">${e(t.name)}</b>
        <span class="er-dim">${t.checked.length} of ${locs.length} checks${regionLock ? ` · ${Object.keys(LOCKS).filter(l => t.has(l)).length} region locks opened` : " · open world"}</span></div></div>
      ${sec("Goal", goalHtml && `<div class="er-bosses">${goalHtml}</div>`, goalFlags.length > 1 ? "Defeat all of them" : "")}
      ${sec("Great Runes", runesHtml, t.isMine ? "Click a rune for a hint" : "")}
      ${sec("The world", lands, regionLock ? "Gold = open · dim = sealed by a missing lock" + (t.isMine ? " · click a sealed area for a hint" : "") : "")}
      ${sec("Region locks", lockList && `<div class="er-items">${lockList}</div>`)}
      ${sec("Key items", `<div class="er-medals">${medallions}</div><div class="er-items">${KEYS.map(keyItem).join("")}</div>${masterHtml}`)}
      ${sec("Upgrades", counters && `<div class="er-counts">${counters}</div>`)}
      ${sec("Remembrances", remembrances.length ? `<div class="er-tags">${remembrances.map(n => `<span>${e(n.replace(/^Remembrance of (the )?/, ""))}</span>`).join("")}</div>` : "", `${remembrances.length} received`)}
    </div>`;
  }

  APTracker.register({
    game: "EldenRing",
    slotData: true,
    async init(api){
      [D, MAPD] = await Promise.all([api.json("data/eldenring.json"), api.json("data/map.json").catch(() => null)]);
      REGION_OF_PREFIX = D.prefix;
      for(const [r, names] of Object.entries(D.except)) for(const n of names) REGION_EXCEPT[n] = r;
      // the world files Stormveil under the Roundtable Hold heading; give the castle its own area
      const isStormveil = r => /^Stormveil|^Divine Tower of Limgrave/.test(r);
      const base = [];
      for(const [name, regions] of D.areas){
        const sv = regions.filter(isStormveil), rest = regions.filter(r => !isStormveil(r));
        if(rest.length) base.push([name, rest, 0]);
        if(sv.length) base.push(["Stormveil", sv, 0]);
      }
      D.areaList = [...base, ...D.dlcAreas.map(a => [a[0], a[1], 1])];
      for(const [area, regions] of D.areaList) for(const r of regions) AREA_OF_REGION[r] = area;
      AREA_OF_REGION["Roundtable Hold DLC Only"] = "The hold";
      D.dlcLocks = ["Gravesite Lock","Belurat Lock","Ensis & Scadu Altus Lock","Ellac Lock","Cerulean & Charo Lock","Stone Coffin Lock","Jagged Peak Lock","Rauh Base Lock","Shadow Keep Lock","Recluses' Lock","Abyssal Lock","Ancient Ruins Lock"];
    },
    tabs: [{ id:"journey", label:"Journey", render:panel }],
    checksLabel: "Checks by area",
    locationGroup: n => areaName(AREA_OF_REGION[regionOf(n)] || "Other"),
    groupOrder: g => { const i = D.areaList.findIndex(a => areaName(a[0]) === g); return i < 0 ? 999 : i; },
    card(t){
      const have = GREAT_RUNES.filter(([n]) => t.has(n)).length, sd = t.slotData || {};
      const goals = [].concat(sd.goal || []), slain = goals.filter(f => { const b = D.bosses[String(f)]; return b && b[3].some(n => t.checked.includes(n)); }).length;
      return [`${have} Great Rune${have === 1 ? "" : "s"}`, goals.length ? `${slain}/${goals.length} goal bosses` : "", `${t.count(/ Lock$/)} locks`].filter(Boolean).join(" · ");
    }
  });
})();
