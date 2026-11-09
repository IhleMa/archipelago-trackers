/* Animal Crossing tracker (the AP_ACGC_PC world: the GameCube game through its PC port).
   Logic follows the world's feature files exactly: museum critters need a month and time slot they spawn in
   (Timesanity), their tool, and their bug/fish/fossil passes; loans need Progressive House (and fossil money);
   catalog and favor checks need their pool; beach checks their month; tree checks the fruit and a shovel; shops need
   an open hour. Everything is drawn as icons: town (goal, calendar, clock, tools, house, store, fruit), the museum's
   four wings, and the catalog, favors, beach and orchard.
   Data: data/ac.json (museum, furniture sets, catalog categories from the world), data/icons.json (drawn for this
   tracker). */
(() => {
  const esc = APTracker.esc;
  let D = null, IC = {};
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const SLOTS = ["Morning Hours", "Day Hours", "Evening Hours", "Night Hours"];
  const SHOP_SLOTS = ["Day Hours", "Evening Hours", "Night Hours"], KK_SLOTS = ["Evening Hours", "Night Hours"];
  const SEASON_MONTHS = [[2, 3, 4], [5, 6, 7], [8, 9, 10], [11, 0, 1]];
  const FRUITS = ["apple", "cherry", "pear", "peach", "orange"];
  const TOOLS = ["net", "fishing rod", "shovel"];
  const LOANS = ["Starting", "Medium", "Basement", "Large", "Upper"];
  const FOSSIL_SERIES = ["Tricera", "T-rex", "Apato", "Stego", "Ptera", "Plesio", "Mammoth", "Single"].map(s => s + " Fossils");
  const FISH_PASSES = ["Small River Fish", "Medium River Fish", "Large River Fish", "Pond Fish", "Sea Fish"];
  const BUG_PASSES = ["Tree Bugs", "Beetles", "Flower Bugs", "Ground Bugs", "Flying Bugs"];
  const BUG_ICON = ["cicada", "beetle", "butterfly", "cricket", "dragonfly"];
  const CAT = { FOSSIL:0, PAINTING:1, BUG:2, FISH:3 };
  const FIND = 1, DONATE = 2;
  const SHOVEL_BUGS = ["mole cricket", "pill bug"];

  const icon = (k, cls, size) => { const g = IC[k] || IC.leaf;
    return `<svg class="ac-i ${cls || ""}" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><path class="s" d="${g.s}" fill-rule="evenodd"/>${g.d ? `<path class="d" d="${g.d}"/>` : ""}</svg>`; };
  const fossilIcon = n => /skull/.test(n) ? "skull" : n === "amber" ? "amber" : n === "dinosaur track" ? "track" : n === "ammonite" ? "ammonite" : n === "dinosaur egg" ? "egg" : n === "trilobite" ? "trilobite" : "bone";
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- logic ---------- */
  const cache = new Map();
  function compute(t){
    const key = t.slot + "|" + t.items.length + "|" + t.checked.length;
    if(cache.has(key)) return cache.get(key);
    const sd = t.slotData || {};
    const o = { timesanity:+sd.timesanity || 0, shopsOpen:+sd.shops_always_open || 0, turnips:+sd.turnips_never_spoil || 0, toolsInPool:+sd.tools_in_pool || 0,
      startTool:sd.starting_tool || null, fossilLoans:+sd.fossil_loans || 0, loansanity:+sd.loansanity || 0,
      modes:[+sd.fossil_checks || 0, +sd.painting_checks || 0, +sd.bug_checks || 0, +sd.fish_checks || 0],
      fossilAv:+sd.fossil_availability || 0, fishAv:+sd.fish_availability || 0, bugAv:+sd.bug_availability || 0,
      fossilSeasons:sd.fossil_seasons || D.fossil_seasons, fossilSeries:sd.fossil_series || D.fossil_series,
      fishTable:sd.fish_passes || D.fish_pass_table, bugPasses:sd.bug_passes || D.bug_passes,
      favorsPer:+sd.favors_per_pool || 1, townFruit:+(sd.town_fruit ?? 0), goals:sd.goal || ["Statue"],
      catalogPools:sd.catalog_pools || [], catalogGoal:+sd.catalog_goal_count || 0, museumGoal:+sd.museum_goal_count || 0,
      furnitureSet:sd.furniture_set_items && sd.furniture_set_items.length ? Object.keys(D.sets)[+sd.furniture_set] : null,
      loanChecks:sd.loan_checks || [], loans:sd.loans || [] };
    const has = n => t.has(n), cnt = n => t.count(n), any = l => l.some(has);
    const shop = () => !o.timesanity || o.shopsOpen || any(SHOP_SLOTS);
    const month = ms => !o.timesanity || ms.some(m => has(MONTHS[m]));
    const spawn = when => !o.timesanity || Object.entries(when).some(([m, sl]) => has(MONTHS[+m]) && sl.some(s => has(SLOTS[s])));
    const tool = n => o.toolsInPool ? has(n) : n === o.startTool ? true : shop();
    const fossilItems = o.fossilAv === 2 && o.modes[CAT.FOSSIL];
    const fishItems = o.fishAv === 1 && o.modes[CAT.FISH], bugItems = o.bugAv === 1 && o.modes[CAT.BUG];
    const fishPassesOf = D.fish.map((_, i) => [...new Set(o.fishTable.flatMap((entries, p) => entries.filter(e => e[0] === i).map(() => p)))]);

    /* why a museum thing isn't doable yet ([] = doable): each entry {text, items} */
    function museumWhy(c, i){
      const out = [];
      if(c === CAT.BUG || c === CAT.FISH){
        const [name, when] = (c === CAT.BUG ? D.bugs : D.fish)[i];
        if(!spawn(when)) out.push({ text:"needs a month and time it shows up", items:[...new Set(Object.keys(when).map(m => MONTHS[+m]))].filter(m => !has(m)).concat(SLOTS.filter(s => !has(s))) });
        if(c === CAT.BUG && o.timesanity){
          if(name === "ant" && o.turnips && !month([9])) out.push({ text:"needs October (candy)", items:["October"] });
          if((name === "ant" && o.turnips || name === "snail") && !shop()) out.push({ text:"needs an open shop hour", items:SHOP_SLOTS });
        }
        const tl = c === CAT.BUG ? "net" : "fishing rod";
        if(!tool(tl)) out.push({ text:`needs the ${tl}`, items:o.toolsInPool ? [tl] : SHOP_SLOTS });
        if(c === CAT.BUG && SHOVEL_BUGS.includes(name) && !tool("shovel")) out.push({ text:"needs the shovel", items:o.toolsInPool ? ["shovel"] : SHOP_SLOTS });
        if(c === CAT.BUG && bugItems){ const p = BUG_PASSES[o.bugPasses[i]]; if(!has(p)) out.push({ text:`needs ${p}`, items:[p] }); }
        if(c === CAT.FISH && fishItems){ const ps = fishPassesOf[i].map(p => FISH_PASSES[p]); if(!any(ps)) out.push({ text:`needs ${ps.join(" or ")}`, items:ps }); }
      } else if(c === CAT.FOSSIL){
        if(!tool("shovel")) out.push({ text:"needs the shovel", items:o.toolsInPool ? ["shovel"] : SHOP_SLOTS });
        if(o.fossilAv === 1 && !month(SEASON_MONTHS[o.fossilSeasons[i]])) out.push({ text:"needs a month of its season", items:SEASON_MONTHS[o.fossilSeasons[i]].map(m => MONTHS[m]) });
        if(fossilItems){ const s = FOSSIL_SERIES[o.fossilSeries[i]]; if(!has(s)) out.push({ text:`needs ${s}`, items:[s] }); }
      }
      return out;
    }
    const fossilMoney = () => {
      if(!o.fossilLoans) return true;
      const items = fossilItems ? FOSSIL_SERIES.filter(s => s !== "Single Fossils") : [];
      return (!o.toolsInPool || has("shovel")) && (!items.length || any(items));
    };
    /* location id -> {kind, ok, why} */
    function check(id){
      if(id >= 0x10001 && id < 0x15000){ const k = Math.floor((id - 0x10000) / 0x1000), why = [];
        if(k > 0 && cnt("Progressive House") < k) why.push({ text:`needs ${k} Progressive House`, items:["Progressive House"] });
        if(k > 0 && !fossilMoney()) why.push({ text:"needs a way to dig fossils for money", items:["shovel", ...FOSSIL_SERIES.slice(0, 7)] });
        if(!shop()) why.push({ text:"needs an open shop hour", items:SHOP_SLOTS });
        return { kind:"loan", k, why }; }
      if(id > 0x20000 && id < 0x21000){ const n = id - 0x20000, k = Math.floor((n - 1) / o.favorsPer), why = [];
        if(n > o.favorsPer && cnt("Progressive Favor Pool") < k) why.push({ text:`needs Favor Pool ${k + 1}`, items:["Progressive Favor Pool"] });
        return { kind:"favor", k, why }; }
      if(id >= 0x30000 && id < 0x30200){ const find = id >= 0x30100, slot = id - (find ? 0x30100 : 0x30000), c = slot >> 6, i = slot & 63;
        return { kind:"museum", c, i, find, why:museumWhy(c, i) }; }
      if(id >= 0x40000 && id < 0x50000){ const item = id - 0x40000, k = o.catalogPools.findIndex(p => p.includes(item)), why = [];
        if(k >= 0 && cnt("Progressive Catalog Pool") < k + 1) why.push({ text:`needs Catalog Pool ${k + 1}`, items:["Progressive Catalog Pool"] });
        if(!shop()) why.push({ text:"needs an open shop hour", items:SHOP_SLOTS });
        return { kind:"catalog", k, item, why }; }
      if(id >= 0x50000 && id < 0x60000){ const m = (id - 0x50000) >> 8, why = [];
        if(!month([m])) why.push({ text:`needs ${MONTHS[m]}`, items:[MONTHS[m]] });
        return { kind:"beach", m, why }; }
      if(id >= 0x60000 && id < 0x70000){ const f = (id - 0x60000) >> 8, why = [];
        if(f !== o.townFruit){ if(!has(FRUITS[f])) why.push({ text:`needs a ${FRUITS[f]}`, items:[FRUITS[f]] });
          if(!tool("shovel")) why.push({ text:"needs the shovel to plant it", items:o.toolsInPool ? ["shovel"] : SHOP_SLOTS }); }
        return { kind:"tree", f, why }; }
      return { kind:"other", why:[] };
    }
    const checks = t.locations.map(l => Object.assign({ id:l.id, name:l.name, done:l.done }, check(l.id)));
    for(const c of checks) c.ok = !c.why.length;

    // goals (all chosen are required, then K.K.'s Saturday show)
    const museumItems = t.items.filter(i => i.name && i.name.startsWith("Museum: ")).length;
    const pieces = list => list.filter(has).length;
    const goals = o.goals.map(g => {
      if(g === "Statue") return { g, icon:"statue", have:cnt("Progressive House"), need:4, ok:cnt("Progressive House") >= 4 && fossilMoney() };
      if(g === "Museum") return { g, icon:"museum", have:museumItems, need:o.museumGoal, ok:museumItems >= o.museumGoal };
      if(g === "Froggy Chair") return { g, icon:"froggy", have:null, ok:true, note:"get it into your catalog any way you can" };
      if(g === "Catalog"){ let held = 0, pools = 0; while(held < o.catalogGoal && pools < o.catalogPools.length){ held += o.catalogPools[pools].length; pools++; }
        return { g, icon:"catalog", have:cnt("Progressive Catalog Pool"), need:pools, ok:cnt("Progressive Catalog Pool") >= pools && shop(), note:`${o.catalogGoal} catalog items` }; }
      const list = g === "Chess Set" ? D.chess : D.sets[o.furnitureSet] || [];
      return { g, icon:g === "Chess Set" ? "chess" : "chair", have:pieces(list), need:list.length, ok:pieces(list) >= list.length && (!o.loansanity || cnt("Progressive House") >= 2) && shop(), list,
        label:g === "Furniture Set" && o.furnitureSet ? `${o.furnitureSet} set` : null };
    });
    const kk = !o.timesanity || any(KK_SLOTS);
    const S = { o, has, cnt, shop, tool, checks, goals, kk, goalOK:goals.every(x => x.ok) && kk, museumWhy, fishPassesOf, fossilItems, fishItems, bugItems };
    cache.set(key, S); if(cache.size > 30) cache.delete(cache.keys().next().value);
    return S;
  }

  /* ---------- town ---------- */
  function hintAttr(t, why){ const items = [...new Set(why.flatMap(w => w.items || []))].filter(n => !t.has(n)); return items.length ? t.hint(items, items[0]) : ""; }
  function renderTown(t){
    const S = compute(t), o = S.o;
    const left = S.checks.filter(c => !c.done), ok = left.filter(c => c.ok);
    const kinds = [["museum", "Museum", "museum"], ["loan", "Loans", "house"], ["catalog", "Catalog", "catalog"], ["favor", "Favors", "favor"], ["beach", "Beach", "shell"], ["tree", "Orchard", "tree"]];
    let html = `<div class="ac">`;
    // goals
    html += `<section class="ac-goals"><h3>${S.goalOK ? "Everything for your goal is in logic" : "Your goal"}</h3><div class="ac-goalrow">${S.goals.map(g => {
      const p = g.need ? Math.min(1, g.have / g.need) : 1;
      return `<div class="ac-goal${g.ok ? " ok" : ""}"${g.list && !g.ok ? t.hint(g.list.filter(n => !t.has(n)), g.g) : ""}>${icon(g.icon, "gold", 54)}
        <b>${esc(g.label ? cap(g.label) : g.g)}</b>${g.need != null && g.have != null ? `<span class="ac-meter"><i style="width:${p * 100}%"></i></span><small>${g.have} of ${g.need}${g.note ? ` · ${esc(g.note)}` : ""}</small>` : `<small>${esc(g.note || "")}</small>`}</div>`; }).join("")}
      <div class="ac-goal${S.kk ? " ok" : ""}"${S.kk ? "" : t.hint(KK_SLOTS, "K.K.'s show")}>${icon("guitar", "gold", 54)}<b>K.K. on Saturday night</b><small>${S.kk ? "then listen to finish" : "needs Evening or Night Hours"}</small></div></div></section>`;
    // in logic now
    html += `<section><h3>Ready to do <small>${ok.length} of ${left.length} checks left</small></h3><div class="ac-ready">${kinds.map(([k, label, ic]) => {
      const all = S.checks.filter(c => c.kind === k); if(!all.length) return "";
      const l = all.filter(c => !c.done), n = l.filter(c => c.ok).length;
      return `<div class="ac-tile${n ? " go" : ""}">${icon(ic, n ? "leafc" : "mute", 46)}<b>${n}</b><span>${label}</span><small>${all.length - l.length} / ${all.length} done</small></div>`; }).join("")}</div></section>`;
    // calendar and clock
    if(o.timesanity){
      html += `<section><h3>Calendar & clock <small>time only moves to what you've unlocked</small></h3><div class="ac-cal">${MONTHS.map((m, i) => {
        const season = [3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3][i];
        return `<div class="ac-month ac-s${season}${t.has(m) ? " on" : ""}"${t.has(m) ? "" : t.hint([m], m)} title="${m}">${icon("month", "", 34)}<span>${m.slice(0, 3)}</span></div>`; }).join("")}</div>
        <div class="ac-clock">${SLOTS.map(s => `<div class="ac-slot${t.has(s) ? " on" : ""}"${t.has(s) ? "" : t.hint([s], s)} title="${s}">${icon(s, "", 40)}<span>${s.replace(" Hours", "")}</span></div>`).join("")}
          <p class="ac-note">${S.shop() ? "Shops are open in your hours." : "No shop hours yet: Nook's opens in Day, Evening or Night."}</p></div></section>`;
    }
    // tools, house, store, fruit
    const toolCard = n => { const own = o.toolsInPool ? t.has(n) : n === o.startTool || S.shop();
      return `<div class="ac-tool${own ? " on" : ""}"${own ? "" : t.hint(o.toolsInPool ? [n] : SHOP_SLOTS, n)} title="${esc(cap(n))}: ${own ? "you have it" : o.toolsInPool ? "an item to find" : "buy it at Nook's when a shop is open"}">${icon(n, "", 48)}<span>${esc(cap(n))}</span></div>`; };
    const houses = cnt => LOANS.map((l, k) => `<li class="${k <= cnt ? "on" : ""}" title="${l} house${o.loans[k] ? `, loan ${o.loans[k].toLocaleString()} bells` : ""}">${icon("house", "", 26 + k * 6)}</li>`).join("");
    const store = Math.min(3, t.count("Progressive Nook Store")), stores = ["Nook's Cranny", "Nook 'n' Go", "Nookway", "Nookington's"];
    html += `<section><h3>Pockets & property</h3><div class="ac-prop">
      <div class="ac-box"><h4>Tools</h4><div class="ac-tools">${TOOLS.map(toolCard).join("")}</div></div>
      <div class="ac-box"><h4>House</h4><ul class="ac-houses"${o.loansanity ? t.hint(["Progressive House"], "Progressive House") : ""}>${houses(Math.min(4, t.count("Progressive House")))}</ul><p class="ac-cap">${LOANS[Math.min(4, t.count("Progressive House"))]} house${o.loansanity ? ` · ${Math.min(4, t.count("Progressive House"))} of 4 upgrades` : ""}</p></div>
      <div class="ac-box"><h4>Nook's store</h4><ul class="ac-stores">${stores.map((s, k) => `<li class="${k <= store ? "on" : ""}" title="${s}">${icon("shop", "", 24 + k * 7)}</li>`).join("")}</ul><p class="ac-cap">${stores[store]}</p></div>
      <div class="ac-box"><h4>Fruit</h4><div class="ac-fruits">${FRUITS.map((f, i) => { const own = i === o.townFruit || t.has(f);
        return `<div class="ac-fruit ${f}${own ? " on" : ""}"${own ? "" : t.hint([f], f)} title="${cap(f)}${i === o.townFruit ? " (your town's fruit)" : own ? "" : ": not received"}">${icon(f, f, 34)}${i === o.townFruit ? "<em>town</em>" : ""}</div>`; }).join("")}</div></div>
    </div></section>`;
    return html + `</div>`;
  }

  /* ---------- museum ---------- */
  function renderMuseum(t){
    const S = compute(t), o = S.o;
    const locs = new Map(); for(const c of S.checks) if(c.kind === "museum") locs.set((c.find ? "f" : "d") + (c.c * 64 + c.i), c);
    const wing = (c, title, list, iconOf, extra) => {
      if(!o.modes[c] && c !== CAT.PAINTING) return "";
      if(c === CAT.PAINTING && !o.modes[c]) return "";
      const cards = list.map((name, i) => {
        const f = locs.get("f" + (c * 64 + i)), d = locs.get("d" + (c * 64 + i)), parts = [f, d].filter(Boolean);
        const done = parts.length && parts.every(x => x.done), why = S.museumWhy(c, i), item = t.has("Museum: " + name);
        const st = done ? "done" : !why.length ? "go" : "no";
        const months = (c === CAT.BUG ? D.bugs : c === CAT.FISH ? D.fish : null)?.[i]?.[1];
        const tip = `${cap(name)}\n${parts.map(x => `${x.find ? (c === CAT.FOSSIL ? "Dig up" : "Catch") : "Donate"}: ${x.done ? "done" : "to do"}`).join("\n")}${why.length ? "\n" + why.map(w => w.text).join("; ") : ""}${item ? "\nMuseum donation item received" : ""}`;
        return `<li class="ac-spec ${st}${item ? " item" : ""}"${st === "no" ? hintAttr(t, why) : ""} title="${esc(tip)}">${icon(iconOf(name, i), "", 34)}<span>${esc(name)}</span>
          ${months ? `<span class="ac-yr" aria-hidden="true">${MONTHS.map((_, m) => `<i class="${months[m] ? "in" : ""}${months[m] && (!o.timesanity || t.has(MONTHS[m])) ? " open" : ""}"></i>`).join("")}</span>` : ""}
          <span class="ac-marks">${parts.map(x => `<i class="${x.done ? "on" : ""}">${x.find ? "◆" : "●"}</i>`).join("")}</span></li>`;
      }).join("");
      const n = list.length, doneN = list.filter((_, i) => [locs.get("f" + (c * 64 + i)), locs.get("d" + (c * 64 + i))].filter(Boolean).every(x => x && x.done)).length;
      return `<section class="ac-wing w${c}"><header>${icon(c === CAT.BUG ? "butterfly" : c === CAT.FISH ? "fish" : c === CAT.FOSSIL ? "skull" : "painting", "", 36)}<h3>${title}</h3><span>${doneN} / ${n}</span></header>${extra || ""}<ul class="ac-specs">${cards}</ul></section>`;
    };
    const passRow = (items, label) => `<div class="ac-passes"><span>${label}</span>${items.map(p => `<b class="${t.has(p) ? "on" : ""}"${t.has(p) ? "" : t.hint([p], p)}>${esc(p)}</b>`).join("")}</div>`;
    let html = `<div class="ac"><p class="ac-note">◆ catch or dig up, ● donate. A green card can be done now; tap a grey one to ask for what it needs.${o.timesanity ? " The little bar is the year: its months, bright where you have the month." : ""}</p>`;
    html += wing(CAT.FOSSIL, "Fossils", D.fossils, n => fossilIcon(n), S.fossilItems ? passRow(FOSSIL_SERIES, "Dig sites") : o.fossilAv === 1 ? `<p class="ac-note">Season locked: each fossil only comes out in its season.</p>` : "");
    html += wing(CAT.BUG, "Insects", D.bugs.map(b => b[0]), (n, i) => BUG_ICON[S.o.bugPasses[i]] || "butterfly", S.bugItems ? passRow(BUG_PASSES, "Habitats") : "");
    html += wing(CAT.FISH, "Fish", D.fish.map(f => f[0]), (n, i) => S.fishPassesOf[i].includes(4) ? "seafish" : "fish", S.fishItems ? passRow(FISH_PASSES, "Waters") : "");
    html += wing(CAT.PAINTING, "Paintings", D.paintings, () => "painting", "");
    if(!o.modes.some(Boolean)) html += `<p class="ac-note">Museumsanity is off in this seed.</p>`;
    return html + `</div>`;
  }

  /* ---------- catalog, favors, beach, orchard ---------- */
  function renderErrands(t){
    const S = compute(t), o = S.o; let html = `<div class="ac">`;
    const by = k => S.checks.filter(c => c.kind === k);
    const cat = by("catalog");
    if(cat.length){
      const pools = o.catalogPools.map((p, k) => { const list = cat.filter(c => c.k === k), done = list.filter(c => c.done).length, open = t.count("Progressive Catalog Pool") > k;
        const kinds = {}; for(const c of list) { const g = D.catalog_cat[c.item] || "other"; kinds[g] = (kinds[g] || 0) + 1; }
        return `<div class="ac-pool${open ? " on" : ""}"${open ? "" : t.hint(["Progressive Catalog Pool"], "Progressive Catalog Pool")}>${icon("catalog", "", 40)}<b>Pool ${k + 1}</b><span class="ac-meter"><i style="width:${list.length ? done / list.length * 100 : 0}%"></i></span><small>${done} / ${list.length} · ${Object.entries(kinds).map(([g, n]) => `${n} ${g}`).join(", ")}</small></div>`; }).join("");
      html += `<section><h3>Catalog <small>${cat.filter(c => c.done).length} / ${cat.length} items</small></h3><div class="ac-pools">${pools}</div></section>`;
    }
    const fav = by("favor");
    if(fav.length){
      const per = o.favorsPer, pools = Math.ceil(fav.length / per);
      html += `<section><h3>Favors for neighbours <small>${fav.filter(c => c.done).length} / ${fav.length}</small></h3><div class="ac-favors">${Array.from({ length:pools }, (_, k) => {
        const list = fav.filter(c => c.k === k), open = k === 0 || t.count("Progressive Favor Pool") >= k;
        return `<div class="ac-fpool${open ? " on" : ""}"${open ? "" : t.hint(["Progressive Favor Pool"], "Progressive Favor Pool")}><span>Pool ${k + 1}</span><div>${list.map(c => `<i class="${c.done ? "done" : c.ok ? "go" : ""}" title="${esc(c.name)}">${icon("favor", "", 22)}</i>`).join("")}</div></div>`; }).join("")}</div></section>`;
    }
    const beach = by("beach");
    if(beach.length){
      html += `<section><h3>Beach combing <small>${beach.filter(c => c.done).length} / ${beach.length} shells and finds</small></h3><div class="ac-beach">${MONTHS.map((m, i) => {
        const list = beach.filter(c => c.m === i), done = list.filter(c => c.done).length, ok = !list.length || list[0].ok;
        return `<div class="ac-bm${ok ? " on" : ""}${done === list.length ? " full" : ""}"${ok ? "" : t.hint([m], m)} title="${m}: ${done} of ${list.length}">${icon("shell", "", 30)}<b>${m.slice(0, 3)}</b><small>${done}/${list.length}</small></div>`; }).join("")}</div></section>`;
    }
    const trees = by("tree");
    if(trees.length){
      html += `<section><h3>Orchard <small>${trees.filter(c => c.done).length} / ${trees.length} fruit trees</small></h3><div class="ac-orchard">${FRUITS.map((f, i) => {
        const list = trees.filter(c => c.f === i), done = list.filter(c => c.done).length, ok = list.length && (list[0].ok || done === list.length);
        return `<div class="ac-grove${ok ? " on" : ""}"${ok || !list.length ? "" : hintAttr(t, list[0].why)} title="${cap(f)} trees: ${done} of ${list.length}${list[0] && list[0].why.length ? "\n" + list[0].why.map(w => w.text).join("; ") : ""}">
          <div class="ac-trees">${list.map(c => `<i class="${c.done ? "done" : ""}">${icon("tree", c.done ? "leafc" : "", 22)}</i>`).join("")}</div>${icon(f, f, 30)}<b>${cap(f)}${i === o.townFruit ? " (town)" : ""}</b><small>${done}/${list.length}</small></div>`; }).join("")}</div></section>`;
    }
    const loans = by("loan");
    if(loans.length){
      html += `<section><h3>Loan payments <small>${loans.filter(c => c.done).length} / ${loans.length}</small></h3><div class="ac-loans">${LOANS.map((l, k) => {
        const list = loans.filter(c => c.k === k); if(!list.length) return ""; const done = list.filter(c => c.done).length, ok = list[0].ok;
        return `<div class="ac-loan${ok ? " on" : ""}"${ok ? "" : hintAttr(t, list[0].why)} title="${esc(`${l} loan${o.loans[k] ? `: ${o.loans[k].toLocaleString()} bells` : ""}${list[0].why.length ? "\n" + list[0].why.map(w => w.text).join("; ") : ""}`)}">${icon("house", "", 26 + k * 4)}<b>${l}</b><span class="ac-meter"><i style="width:${done / list.length * 100}%"></i></span><small>${done} / ${list.length}${o.loans[k] ? ` · ${o.loans[k].toLocaleString()} bells` : ""}</small></div>`; }).join("")}</div></section>`;
    }
    return html + `</div>`;
  }

  const KIND_LABEL = { museum:"Museum", loan:"Loans", catalog:"Catalog", favor:"Favors", beach:"Beach", tree:"Orchard", other:"Other" };
  APTracker.register({
    game:"Animal Crossing",
    slotData:true,
    async init(api){ [D, IC] = await Promise.all([api.json("data/ac.json"), api.json("data/icons.json")]); },
    tabs:[{ id:"ac-town", label:"Town", render:renderTown }, { id:"ac-museum", label:"Museum", render:renderMuseum }, { id:"ac-errands", label:"Catalog & errands", render:renderErrands }],
    checksLabel:"All checks",
    locationGroup:n => /^(Catch|Dig up|Donate) /.test(n) ? "Museum" : /Loan \d+$/.test(n) ? "Loans" : n.startsWith("Catalog: ") ? "Catalog" : n.startsWith("Favor ") ? "Favors" : n.startsWith("Beach: ") ? "Beach" : n.startsWith("Tree: ") ? "Orchard" : "Other",
    groupOrder:["Museum", "Loans", "Catalog", "Favors", "Beach", "Orchard", "Other"],
    _compute:t => compute(t),   // lets a test compare this logic with the world's own
    card(t){
      const S = compute(t), n = S.checks.filter(c => !c.done && c.ok).length;
      return `${n} checks ready${S.o.timesanity ? ` · ${MONTHS.filter(m => t.has(m)).length}/12 months` : ""}${S.goalOK ? " · goal in logic" : ""}`;
    }
  });
})();
