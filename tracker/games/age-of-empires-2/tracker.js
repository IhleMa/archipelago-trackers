/* Age of Empires II: Definitive Edition tracker (Ageipelago by dmwever).
   Logic: the world's own rules, exported from Archipelago (they are rule-builder trees, data/logic.json, one rule graph
   per mix of campaigns) and evaluated here exactly as Archipelago does: regions, scenario-complete events, sweep.
   Checked against real generation on 288 states (every campaign mix, both branching modes, several building shuffles).
   Look: a war council table. Each campaign is a march of six heraldic shields; buildings are laid out by age.
   Data: data/aoe.json (scenarios, objectives, buildings, items), data/logic.json, data/icons.json (drawn for this tracker). */
(() => {
  const esc = APTracker.esc;
  let A = null, L = null, IC = {};
  const CAMPAIGNS = { "Attila the Hun":{ key:"A", emblem:"bow", cls:"huns", progressive:"Progressive Attila Scenario", item:"Attila the Hun Campaign", prefix:"Attila, " },
    "Joan of Arc":{ key:"J", emblem:"fleur", cls:"franks", progressive:"Progressive Joan of Arc Scenario", item:"Joan of Arc Campaign", prefix:"Joan of Arc, " } };
  const ROMAN = ["", "I", "II", "III", "IV", "V", "VI"];
  const AGES = ["Dark", "Feudal", "Castle", "Imperial"];
  const TYPE = { VICTORY:["crown", "Victory"], OBJECTIVE:["flag", "Objective"], SIDE_QUEST:["scroll", "Side quest"], OBJECTIVE_BRANCHING_ALL:["branch", "One of the routes"],
    OBJECTIVE_BRANCHING_ANY:["branch", "Either route"], OBJECTIVE_SCENARIO_COLLECTION:["coins", "Plunder"] };
  const BICON = { "Town Center":"tc", "House":"house", "Mill":"mill", "Mining Camp":"mining", "Lumber Camp":"lumber", "Farm":"farm", "Fish Trap":"fishtrap", "Dock":"dock",
    "Market":"market", "University":"university", "Blacksmith":"blacksmith", "Monastery":"monastery", "Barracks":"barracks", "Archery Range":"archery", "Stable":"stable",
    "Siege Workshop":"siege", "Castle":"castle", "Palisade Gate":"palisade_gate", "Stone Gate":"gate", "Palisade Wall":"palisade_wall", "Stone Wall":"stone_wall",
    "Watch Tower":"watch_tower", "Bombard Tower":"bombard_tower", "Outpost":"outpost", "Wonder":"wonder" };
  const AGE_UP = { Feudal:["Mill", "Lumber Camp", "Mining Camp", "Dock", "Barracks"], Castle:["Archery Range", "Stable", "Market", "Blacksmith"], Imperial:["Monastery", "University", "Siege Workshop"] };

  const icon = (k, size, cls) => { const g = IC[k] || IC.unique;
    return `<svg class="ae-i ${cls || ""}" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><path class="s" d="${g.s}" fill-rule="evenodd"/>${g.d ? `<path class="d" d="${g.d}"/>` : ""}</svg>`; };

  /* ---------- the world's rules ---------- */
  function solve(key, counts){
    const cfg = L.configs[key]; if(!cfg) return null;
    const st = new Map(counts), has = (n, c) => (st.get(n) || 0) >= (c || 1);
    const regs = new Map(cfg.map(r => [r[0], r]));
    let reach, ev, got = new Set();
    for(let pass = 0; pass < 100; pass++){
      const memo = new Map();
      ev = i => { if(i < 0) return true; let v = memo.get(i); if(v !== undefined) return v; const n = L.nodes[i];
        switch(n[0]){
          case "H": v = has(n[1], n[2]); break;
          case "HA": v = n[1].every(x => has(x)); break;
          case "HY": v = n[1].some(x => has(x)); break;
          case "HC": v = n[1].every(([x, c]) => has(x, c)); break;
          case "&": v = n[1].every(ev); break;
          case "|": v = n[1].some(ev); break;
          case "N": { let k = 0; for(const c of n[2]) if(ev(c)) k++; v = k >= n[1]; break; }
          default: v = false;
        }
        memo.set(i, v); return v; };
      reach = new Set(["Menu"]); const q = ["Menu"];
      while(q.length){ const r = regs.get(q.shift()); if(!r) continue; for(const [to, rule] of r[1]) if(!reach.has(to) && ev(rule)){ reach.add(to); q.push(to); } }
      let changed = false;
      for(const name of reach) for(const [ln, rule, item] of regs.get(name)?.[2] || []) if(item && !got.has(ln) && ev(rule)){ got.add(ln); st.set(item, (st.get(item) || 0) + 1); changed = true; }
      if(!changed) break;
    }
    const ok = new Set(), ruleOf = new Map(), entry = new Map();
    for(const r of cfg){ for(const [ln, rule] of r[2]) ruleOf.set(ln, rule); for(const [to, rule] of r[1]) entry.set(to, rule); }
    for(const name of reach) for(const [ln, rule, item] of regs.get(name)?.[2] || []) if(!item && ev(rule)) ok.add(ln);
    const allEvents = cfg.flatMap(r => r[2].filter(l => l[2]).map(l => l[0]));
    // the fewest missing items that would satisfy a rule (for "needs …" and the hint button)
    const missMemo = new Map();
    const miss = i => { if(i < 0 || ev(i)) return []; if(missMemo.has(i)) return missMemo.get(i); const n = L.nodes[i]; let v;
      switch(n[0]){
        case "H": v = [n[1]]; break;
        case "HA": v = n[1].filter(x => !has(x)); break;
        case "HY": v = [n[1][0]]; break;
        case "HC": v = n[1].filter(([x, c]) => !has(x, c)).map(([x]) => x); break;
        case "&": v = [...new Set(n[1].flatMap(miss))]; break;
        case "|": v = n[1].map(miss).sort((a, b) => a.length - b.length)[0] || []; break;
        case "N": v = [...new Set(n[2].filter(c => !ev(c)).map(miss).sort((a, b) => a.length - b.length).slice(0, n[1] - n[2].filter(ev).length).flat())]; break;
        default: v = [];
      }
      missMemo.set(i, v); return v; };
    return { ok, reach, got, goal:allEvents.every(e => got.has(e)), has, ev, miss, ruleOf, entry, st };
  }

  const cache = new Map();
  function model(t){
    const ckey = t.slot + "|" + t.items.length + "|" + t.checked.length;
    if(cache.has(ckey)) return cache.get(ckey);
    const sd = t.slotData || {}, names = new Set(t.locations.map(l => l.name));
    const camps = Object.keys(CAMPAIGNS).filter(c => (c + "_unlocked") in sd || A.scenarios.some(s => s[1] === c && [...names].some(n => n.startsWith(s[0] + ": "))));
    const key = camps.map(c => CAMPAIGNS[c].key).join("");
    const counts = new Map(); for(const it of t.items) counts.set(it.name, (counts.get(it.name) || 0) + 1);
    const S = solve(key, counts);
    const locs = t.locations.map(l => ({ id:l.id, name:l.name, done:l.done, ready:!l.done && !!S && S.ok.has(l.name), info:A.locations[l.name] }));
    const m = { camps, key, S, locs, byName:new Map(locs.map(l => [l.name, l])), ready:locs.filter(l => l.ready).length };
    cache.set(ckey, m); if(cache.size > 30) cache.delete(cache.keys().next().value);
    return m;
  }
  const needsHint = (t, items, label) => { const left = items.filter(n => !t.has(n) && !/: Unlock Next Scenario$/.test(n)); return left.length ? t.hint(left, label || left[0]) : ""; };
  const prettyNeed = n => n.replace(/: Unlock Next Scenario$/, " (beat it first)").replace(/^(Attila|Joan of Arc), [^:]+: /, "");

  /* ---------- Campaigns ---------- */
  function renderCampaigns(t){
    const m = model(t), S = m.S;
    if(!m.camps.length) return `<div class="ae"><p class="ae-note">No Ageipelago campaign found in this slot.</p></div>`;
    let html = `<div class="ae">`;
    html += `<section class="ae-council"><div><small>Goal</small><b>${t.goal ? "All campaigns won" : S && S.goal ? "Every victory is in logic" : "Win every campaign"}</b></div>
      <div class="ae-stat"><b>${m.ready}</b><span>checks you can take now</span></div>
      <div class="ae-stat"><b>${m.locs.filter(l => l.done).length}<em>/${m.locs.length}</em></b><span>checks done</span></div></section>`;
    for(const c of m.camps){
      const C = CAMPAIGNS[c], scns = A.scenarios.filter(s => s[1] === c).sort((a, b) => a[2] - b[2]);
      const unlocked = t.has(C.item), prog = t.count(C.progressive);
      html += `<section class="ae-camp ${C.cls}"><header>${icon(C.emblem, 44, "gilt")}<div><h3>${esc(c)}</h3>
        <span>${unlocked ? "Campaign unlocked" : "Campaign locked"} · ${prog} of 5 Progressive Scenario${prog === 1 ? "" : "s"}</span></div>
        ${unlocked ? "" : `<button class="ae-ask" ${t.hint([C.item], C.item)}>Ask for it</button>`}</header>`;
      // the march
      html += `<ol class="ae-march">${scns.map(s => {
        const sl = m.locs.filter(l => l.info && l.info[0] === s[0]), done = sl.filter(l => l.done).length, ready = sl.filter(l => l.ready).length;
        const open = S && S.reach.has(s[0]), won = S && S.got.has("Complete " + s[0]) && sl.find(l => l.info[1] === "VICTORY")?.done;
        const st = won ? "won" : !open ? "shut" : ready ? "go" : "open", p = sl.length ? done / sl.length : 0;
        return `<li class="ae-shield ${st}"><a href="#ae-${esc(s[0].replace(/\W+/g, "-"))}" data-ae-jump>
          <svg class="ae-ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29"/><circle class="p" cx="32" cy="32" r="29" style="stroke-dasharray:${(p * 182.2).toFixed(1)} 200"/></svg>
          <span class="ae-crest">${ROMAN[s[2]]}</span></a><b>${esc(s[0])}</b><small>${won ? "won" : !open ? "locked" : ready ? `${ready} ready` : `${done}/${sl.length}`}</small></li>`; }).join("")}</ol>`;
      // scenario cards
      html += `<div class="ae-scns">${scns.map(s => {
        const sl = m.locs.filter(l => l.info && l.info[0] === s[0]).sort((a, b) => a.id - b.id), open = S && S.reach.has(s[0]);
        const need = S && !open ? S.miss(S.entry.get(s[0]) ?? -1) : [];
        const items = Object.entries(A.items).filter(([, v]) => (v[0] === "ScenarioItem" || v[0] === "Mercenary") && v[1] === s[0]).map(([n, v]) => [n, v[0]]);
        return `<article class="ae-scn${open ? "" : " shut"}" id="ae-${esc(s[0].replace(/\W+/g, "-"))}"><header><span class="ae-num">${ROMAN[s[2]]}</span><div><h4>${esc(s[0])}</h4><small>playing the ${esc(s[3])}</small></div></header>
          ${!open && need.length ? `<p class="ae-need"${needsHint(t, need, s[0])}>${icon("lock", 16)}Needs ${need.map(n => `<b>${esc(prettyNeed(n))}</b>`).join(", ")}</p>` : ""}
          <ul class="ae-objs">${sl.map(l => { const ty = TYPE[l.info[1]] || ["flag", ""], short = l.name.slice(s[0].length + 2);
            const why = !l.done && !l.ready && S && open ? S.miss(S.ruleOf.get(l.name) ?? -1) : [];
            return `<li class="${l.done ? "done" : l.ready ? "go" : "no"}"${!l.done && !l.ready && why.length ? needsHint(t, why, short) : ""} title="${esc(ty[1])}${why.length ? `: needs ${why.map(prettyNeed).join(", ")}` : ""}">${icon(l.done ? "check" : ty[0], 18)}<span>${esc(short)}</span></li>`; }).join("")}</ul>
          ${items.length ? `<div class="ae-items">${items.map(([n, k]) => { const own = t.has(n), label = n.replace(/^[^:]+: /, "");
            return `<span class="${own ? "on" : ""}"${own ? "" : t.hint([n], label)} title="${esc(n)}${k === "Mercenary" ? " (mercenaries)" : ""}">${esc(label)}</span>`; }).join("")}</div>` : ""}
        </article>`; }).join("")}</div></section>`;
    }
    return html + `</div>`;
  }

  /* ---------- Buildings ---------- */
  function renderBuildings(t){
    const m = model(t), S = m.S;
    const res = { wood:0, food:0, gold:0, stone:0 };
    for(const it of t.items){ const d = A.items[it.name]; if(d && d[0] === "StartingResources") res[d[1][0]] += d[1][1]; }
    const tcRes = ["Starting Town Center Wood", "Starting Town Center Stone"];
    let html = `<div class="ae"><section class="ae-panel ae-res"><h3>Starting stockpile <small>extra resources every scenario starts with</small></h3><div class="ae-resrow">${Object.entries(res).map(([k, v]) =>
      `<div class="ae-r ${k}">${icon(k, 34)}<b>+${v}</b><span>${k}</span></div>`).join("")}
      <div class="ae-r tcr${tcRes.every(n => t.has(n)) ? " on" : ""}"${tcRes.every(n => t.has(n)) ? "" : needsHint(t, tcRes, "Town Center resources")}>${icon("tc", 34)}<b>${tcRes.filter(n => t.has(n)).length}/2</b><span>Town Center resources</span></div></div></section>`;
    html += `<div class="ae-ages">${AGES.map((age, ai) => {
      const list = A.buildings.filter(b => b[2] === age && (m.byName.has(b[1]) || (!b[3].includes("Unique") && BICON[b[0]])));   // uniques only when a campaign civ can build them (then they are checks)
      const up = AGE_UP[age];
      return `<section class="ae-panel ae-age"><h3><span class="ae-num">${ROMAN[ai + 1]}</span>${age} Age</h3>
        ${up ? `<p class="ae-rule">To reach it: Town Center and its resources, plus ${age === "Imperial" ? "a Castle, or " : ""}two of ${up.map(n => `<b class="${t.has(n) ? "on" : ""}">${esc(n)}</b>`).join(" ")}</p>` : `<p class="ae-rule">Where every scenario begins.</p>`}
        <div class="ae-blds">${list.map(([name, loc, , opts, cost]) => {
          const own = t.has(name), l = m.byName.get(loc), uniq = opts.includes("Unique");
          const st = l ? (l.done ? "done" : l.ready ? "go" : "no") : "";
          const why = l && !l.done && !l.ready && S ? S.miss(S.ruleOf.get(loc) ?? -1) : [];
          return `<div class="ae-b${own ? " own" : ""} ${st}"${!own ? t.hint([name], name) : why.length ? needsHint(t, why, loc) : ""} title="${esc(name)}${own ? ": you can build it" : ": not received"}${l ? `\nCheck "${loc}": ${l.done ? "done" : l.ready ? "ready now" : "not yet" + (why.length ? ` (needs ${why.map(prettyNeed).join(", ")})` : "")}` : "\nNot a check in this seed"}">
            ${icon(BICON[name] || "unique", 38)}<b>${esc(name)}</b><small>${Object.entries(cost).map(([k, v]) => `<i class="${k}">${v}</i>`).join("")}${uniq ? "<em>unique</em>" : ""}</small>
            ${l ? `<span class="ae-flag" aria-label="${l.done ? "check done" : l.ready ? "check ready" : "check not yet"}"></span>` : ""}</div>`; }).join("")}</div></section>`; }).join("")}</div>`;
    return html + `</div>`;
  }

  document.addEventListener("click", e => {
    const a = e.target.closest("[data-ae-jump]"); if(!a) return;
    e.preventDefault(); document.getElementById(a.getAttribute("href").slice(1))?.scrollIntoView({ behavior:"smooth", block:"start" });
  });

  APTracker.register({
    game:"Age Of Empires II: Definitive Edition",
    slotData:true,
    async init(api){ [A, L, IC] = await Promise.all([api.json("data/aoe.json"), api.json("data/logic.json"), api.json("data/icons.json")]); },
    tabs:[{ id:"ae-camp", label:"Campaigns", render:renderCampaigns }, { id:"ae-build", label:"Buildings", render:renderBuildings }],
    checksLabel:"All checks",
    locationGroup:n => A?.locations[n]?.[0] || (/^Build /.test(n) ? "Buildings" : "Other"),
    _solve:(key, counts) => solve(key, counts),   // lets a test compare this logic with the world's own
    card(t){
      const m = model(t), won = A.scenarios.filter(s => m.camps.includes(s[1]) && m.locs.find(l => l.name === s[0] + ": Victory")?.done).length;
      const total = A.scenarios.filter(s => m.camps.includes(s[1])).length;
      return `${m.ready} ready now · ${won}/${total} scenarios won`;
    }
  });
})();
