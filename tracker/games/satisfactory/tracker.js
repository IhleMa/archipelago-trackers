/* Satisfactory tracker: a FICSIT pioneer terminal. The HUB tab has the project goal, a Space Elevator whose phases light
   up as their parts come into reach, and every HUB tier as a row of milestone machines with their real part costs from
   the seed. A conveyor runs under the header carrying the parts you can make right now. Production shows each building
   with the parts its recipes make (its gear turns once you can use it), then buildings, equipment and vehicles. MAM &
   more has the research trees as node graphs, the hard drives and the AWESOME Shop.
   What's in logic comes from Archipelago itself: the relay rebuilds the player's world from slot data (relay/ap_logic.py),
   the way Universal Tracker shows it, so "ready now" is exact.
   Data: data/satisfactory.json, generated from the Satisfactory Archipelago world (MIT licence): recipe items -> parts and
   building, MAM trees, Space Elevator phases, item groups, part IDs. Icons are drawn for this tracker. */
(() => {
  let D = null;
  const esc = APTracker.esc;
  const PROD_ORDER = ["Smelter", "Constructor", "Foundry", "Assembler", "Manufacturer", "Refinery", "Packager", "Blender",
    "Particle Accelerator", "Converter", "Quantum Encoder", "Equipment Workshop"];
  const BUILDING_GROUPS = [
    ["Production", /Smelter|Constructor|Foundry|Assembler|Manufacturer|Refinery|Packager|Blender|Particle Accelerator|Converter|Quantum Encoder|Equipment Workshop|Crafting Bench/],
    ["Extraction", /Miner|Extractor|Resource Well|Pressurizer/],
    ["Power", /Burner|Generator|Power Plant|Power Pole|Power Storage|Power Switch|Power Tower|Augmenter|Wall Outlet|Priority Power/],
    ["Conveyors", /Conveyor|Splitter|Merger/],
    ["Pipes", /Pipeline|Pipe|Pump|Valve|Fluid Buffer|Fluid Freight/],
    ["Storage & logistics", /Storage|Container|Shelf|Depot|Drone|Truck Station|Train|Freight|Station|Hypertube|Sink|Shop|Elevator|Lookout/],
  ];
  const GOAL_LABEL = { "Space Elevator Phase":"Space Elevator", "AWESOME Sink Points (total)":"AWESOME Sink points", "AWESOME Sink Points (per minute)":"AWESOME Sink points per minute", "Exploration Collectables":"Exploration" };
  const fmt = n => Number(n).toLocaleString("en-US");

  /* ---------- icons (original, 24×24) ---------- */
  const P = {
    ingot:"M3.5 15.5l3.2-7h10.6l3.2 7zM3.5 16.8h17v3h-17z",
    plate:"M2.5 8.2L12 4l9.5 4.2L12 12.4zM2.5 9.8v3.3l9.5 4.2 9.5-4.2V9.8L12 14z",
    rod:"M3.5 18.3L18.3 3.5l2.2 2.2L5.7 20.5z",
    screw:"M8 2.5h8v3.2H8zM10.7 5.7h2.6v12.6l-1.3 3.2-1.3-3.2zM9 9h6v1.4H9zm0 3h6v1.4H9zm0 3h6v1.4H9z",
    wire:"M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zm0 3.4a5.1 5.1 0 1 0 0 10.2 5.1 5.1 0 0 0 0-10.2zm0 2.6a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z",
    block:"M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4zM12 11.3l-6-2.8v6.6l6 2.9z",
    frame:"M3.5 3.5h17v17h-17zm4 4v9h9v-9z",
    gear:"M10.3 2.5h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9-2.6-.5v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
    chip:"M7 7h10v10H7zM9 3h2v3H9zm4 0h2v3h-2zM9 18h2v3H9zm4 0h2v3h-2zM3 9h3v2H3zm0 4h3v2H3zm15-4h3v2h-3zm0 4h3v2h-3z",
    drop:"M12 2.5c4.2 5.2 6.5 8.4 6.5 11.5a6.5 6.5 0 0 1-13 0c0-3.1 2.3-6.3 6.5-11.5z",
    canister:"M8.5 2.5h7v3l2.5 2.5v13.5H6V8l2.5-2.5zM8.5 11h7v6h-7z",
    leaf:"M4.5 19.5C4.5 9.5 10.5 4 20 4c0 9.5-5.5 15.5-15.5 15.5zm0 0l7.5-7.5",
    ore:"M4.5 16.5l2-7.5 6.5-4.5 6 3.5 1 7.5-5 5H9z",
    crystal:"M12 2l5.5 6.5L12 22 6.5 8.5z",
    crate:"M3.5 7.2L12 3l8.5 4.2v9.6L12 21l-8.5-4.2zM12 11.2v8m0-8L4.5 7.6M12 11.2l7.5-3.6",
    battery:"M7 5h10v16.5H7zM10 2h4v3h-4zM10.5 9l-1 5h2.5l-1 4.5 3.5-6h-2.5l1-3.5z",
    beam:"M2.5 8.5h19v7h-19zM2.5 6h19v1.5h-19zm0 11h19V18.5h-19z",
    elevator:"M10 2h4l1 4h-6zM8.5 7h7l1.5 15H7zM11 10v9h2v-9z",
    hub:"M3 20.5L5 10h14l2 10.5zM8.5 3.5h7L17 9H7z",
    flask:"M9 2.5h6V4h-1v4.5l5.5 9.8A2.2 2.2 0 0 1 17.6 21.5H6.4a2.2 2.2 0 0 1-1.9-3.2L10 8.5V4H9zM8 15h8l1.8 3.3H6.2z",
    drive:"M4 4.5h16v15H4zM7 7.5v4h10v-4zm0 7v2h2v-2zm4 0v2h6v-2z",
    coupon:"M3 6.5h18v3.2a2.3 2.3 0 0 0 0 4.6v3.2H3v-3.2a2.3 2.3 0 0 0 0-4.6zm11 1.5v8h1.5V8z",
    trophy:"M7 3h10v6a5 5 0 0 1-10 0zM4 4.5h3V8H5.5A1.5 1.5 0 0 1 4 6.5zm16 0h-3V8h1.5A1.5 1.5 0 0 0 20 6.5zM11 14h2v4h3v2.5H8V18h3z",
    check:"M4 12.5l5 5L20 6.5l-1.8-1.8L9 14 5.8 10.7z",
    lock:"M7 10V7.5a5 5 0 0 1 10 0V10h1.5v11.5h-13V10zm2.5 0h5V7.5a2.5 2.5 0 0 0-5 0z"
  };
  const icon = (k, size, color, cls) => `<svg class="sf-i${cls ? " " + cls : ""}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"${color ? ` style="color:${color}"` : ""}><path d="${P[k] || P.crate}" fill-rule="evenodd"/></svg>`;
  const SHAPE = [[/Ingot/, "ingot"], [/Plate|Sheet|Plating/, "plate"], [/Rod|Pipe|Rebar/, "rod"], [/Screw/, "screw"], [/Wire|Cable|Quickwire|Wiring/, "wire"],
    [/Concrete|Cube|Cell$/, "block"], [/Frame|Framework/, "frame"], [/Beam/, "beam"], [/Motor|Rotor|Stator|Engine|Gear|Turbine/, "gear"],
    [/Circuit|Computer|Processor|Control Unit|Limiter|Server|Director|Oscillator|Connector|Matrix/, "chip"], [/Battery|Power Shard|Slug/, "battery"],
    [/^Packaged|Canister|Tank/, "canister"], [/Fuel|Oil|Water|Acid|Solution|Resin|Nitrogen|Turbo|Plastic|Rubber|Fluid/, "drop"],
    [/Leaves|Wood|Biomass|Mycelia|Biofuel|Paleberry|Beryl|Agaric|Fabric/, "leaf"], [/Crystal|Quartz|Diamond|Silica|Time|Dark Matter|Trigon/, "crystal"],
    [/Ore|Coal|Limestone|Sulfur|Bauxite|Uranium|Raw|SAM|Scrap|Powder/, "ore"]];
  const TINT = [[/Iron|Reinforced/, "#a9b4c2"], [/Copper/, "#e08a4a"], [/Caterium|Quickwire|Gold/, "#f0c94e"], [/Alumin|Alclad|Bauxite/, "#9fdcf5"],
    [/Steel|Encased Industrial/, "#7f8c9b"], [/Plastic/, "#57b0f0"], [/Rubber/, "#a0a0b8"], [/Concrete|Limestone/, "#d6cfbf"], [/Quartz|Crystal|Silica|Diamond/, "#efb8f7"],
    [/Uran|Pluton|Nuclear|Ficsonium/, "#9be860"], [/Fuel|Oil|Turbo|Rocket|Coke/, "#f07a5a"], [/Circuit|Computer|Processor|Control|AI |Director|Server/, "#62d9a2"],
    [/Quantum|SAM|Ficsite|Time|Dark|Singularity|Superposition|Alien|Matrix|Neural/, "#b98cff"], [/Coal|Black/, "#8d96a2"], [/Sulfur/, "#ece35e"],
    [/Leaves|Wood|Biomass|Mycelia|Bio|Paleberry|Beryl|Agaric|Fabric/, "#86c862"], [/Water/, "#5fb8ff"]];
  const partIcon = (part, size) => icon((SHAPE.find(([re]) => re.test(part)) || [0, "crate"])[1], size, (TINT.find(([re]) => re.test(part)) || [0, "#f39c32"])[1]);

  /* ---------- what is unlocked ---------- */
  function state(t){
    const opts = t.slotData?.Data?.Options || {};
    const startIds = new Set(opts.StartingRecipies || []);
    const recipeOn = name => t.has(name) || startIds.has(D.recipes[name]?.id);
    const implicit = new Set(D.implicitBuildings);
    // starting buildings arrive in slot data together with the starting recipes (as item IDs)
    const buildingOn = b => !b || implicit.has(b) || t.has("Building: " + b) || startIds.has(D.buildingIds["Building: " + b]);
    const partRecipes = {};
    for(const [name, r] of Object.entries(D.recipes)) for(const part of r.parts) (partRecipes[part] ||= []).push(name);
    const canMake = part => D.freeParts.includes(part) || (partRecipes[part] || []).some(n => recipeOn(n) && buildingOn(D.recipes[n].building));
    // why a part can't be made yet: no recipe, or recipe but no building
    const blocker = part => {
      const rs = partRecipes[part] || [], owned = rs.filter(recipeOn);
      if(!owned.length) return { kind:"recipe", items:rs };
      return { kind:"building", items:[...new Set(owned.map(n => D.recipes[n].building).filter(x => x && !buildingOn(x)))].map(x => "Building: " + x) };
    };
    return { opts, recipeOn, buildingOn, partRecipes, canMake, blocker };
  }

  const cache = new Map();
  function model(t){
    const key = t.slot + "|" + t.checked.length + "|" + t.items.length + "|" + (t.inLogic ? t.inLogic.size : -1);
    if(cache.has(key)) return cache.get(key);
    const S = state(t), logic = t.inLogic, ready = l => !l.done && !!logic && logic.has(l.id);
    const hub = {}, mam = {}, drives = [], shop = [];
    for(const l of t.locations){
      let m = /^Hub (\d+)-(\d+), item (\d+)$/.exec(l.name);
      if(m){ const ms = ((hub[m[1]] ||= {})[m[2]] ||= { done:0, total:0, ready:0, slots:[] }); ms.total++; if(l.done) ms.done++; if(ready(l)) ms.ready++; ms.slots[+m[3] - 1] = l.done ? "on" : ready(l) ? "go" : ""; continue; }
      if(/^Hard drive/.test(l.name)){ drives.push({ ...l, ready:ready(l) }); continue; }
      if(/^AWESOME Shop/.test(l.name)){ shop.push({ ...l, ready:ready(l) }); continue; }
      m = /^([^:]+): (.+)$/.exec(l.name);
      if(m && D.mam[m[1]]) (mam[m[1]] ||= {})[m[2]] = { ...l, ready:ready(l) };
    }
    const all = t.locations.length, done = t.locations.filter(l => l.done).length;
    const m = { S, hub, mam, drives, shop, haveLogic:!!logic, ready:t.locations.filter(ready).length, all, done };
    cache.set(key, m); if(cache.size > 20) cache.delete(cache.keys().next().value);
    return m;
  }
  const noLogic = t => t.logicNote ? esc(t.logicNote) : `"Ready now" needs exact logic on the server: run <code>tracker update</code> in the console.`;

  /* ---------- shared pieces ---------- */
  function costChip(t, S, part, amount){
    const ok = S.canMake(part), b = ok ? null : S.blocker(part);
    const why = ok ? "you can produce this" : b.kind === "recipe" ? "no recipe unlocked yet" : `needs ${b.items.map(x => x.replace("Building: ", "")).join(" or ")}`;
    return `<span class="sf-cost${ok ? " ok" : ""}"${!ok && b.items.length ? t.hint(b.items, part) : ""} title="${esc(part)}: ${esc(why)}">${partIcon(part, 18)}<b>${fmt(amount)}</b><span>${esc(part)}</span></span>`;
  }
  function header(t, m){
    const S = m.S, opts = S.opts, phase = opts.FinalElevatorPhase || 0, goals = [].concat(opts.GoalSelection || []);
    let msDone = 0, msAll = 0;
    for(const tier of Object.values(m.hub)) for(const ms of Object.values(tier)){ msAll++; if(ms.done === ms.total) msDone++; }
    const mamAll = Object.values(m.mam).reduce((a, tr) => a + Object.keys(tr).length, 0), mamDone = Object.values(m.mam).reduce((a, tr) => a + Object.values(tr).filter(l => l.done).length, 0);
    // the elevator: each phase lights up when all its parts can be made
    const floors = Array.from({ length:phase }, (_, i) => { const cost = D.elevator[i] || {}, ok = Object.keys(cost).every(S.canMake);
      return `<i class="${ok ? "on" : ""}" title="Phase ${i + 1}: ${ok ? "all parts in reach" : "parts not all in reach yet"}"><b>${i + 1}</b></i>`; }).reverse().join("");
    // the conveyor carries parts you can make now
    const making = Object.keys(S.partRecipes).filter(p => !D.freeParts.includes(p) && S.canMake(p)).sort();
    const pick = making.filter((_, i) => i % Math.max(1, Math.floor(making.length / 14)) === 0).slice(0, 14);
    const belt = pick.length ? pick.map(p => `<span title="${esc(p)}">${partIcon(p, 22)}</span>`).join("") : "";
    return `<header class="sf-hero${t.goal ? " won" : t.logicGoal ? " go" : ""}">
      <div class="sf-id"><span class="sf-k">FICSIT Inc. · Pioneer terminal</span><b>${esc(t.name)}</b>
        <span class="sf-goalline">${t.goal ? "Project complete. FICSIT thanks you for your service." : `Project: ${goals.map(g => esc(GOAL_LABEL[g] || g)).join(goals.length > 1 ? (opts.GoalRequirement === 1 ? " and " : " or ") : "") || "not shared"}${goals.includes("Space Elevator Phase") && phase ? ` (phase ${phase})` : ""}`}${!t.goal && t.logicGoal ? ` <em>· everything for it is in reach</em>` : ""}</span>
        ${m.haveLogic ? "" : `<span class="sf-note">${noLogic(t)}</span>`}</div>
      <div class="sf-stats">
        ${m.haveLogic ? `<div class="sf-stat go"><span class="sf-led"></span><b>${m.ready}</b><span>ready right now</span></div>` : ""}
        <div class="sf-stat"><b>${msDone}<em>/${msAll}</em></b><span>milestones</span></div>
        ${mamAll ? `<div class="sf-stat"><b>${mamDone}<em>/${mamAll}</em></b><span>MAM research</span></div>` : ""}
        <div class="sf-stat"><b>${m.done}<em>/${m.all}</em></b><span>checks done</span></div></div>
      ${phase ? `<div class="sf-elevator${t.goal ? " won" : ""}" title="Space Elevator"><span class="sf-beacon"></span><div class="sf-shaft">${floors}</div><span class="sf-base">${icon("elevator", 20)}</span></div>` : ""}
      ${belt ? `<div class="sf-belt" aria-hidden="true"><div class="sf-track">${belt}${belt}</div></div>` : ""}
    </header>`;
  }
  const sec = (title, body, note = "", ic = "") => body ? `<section class="sf-sec"><div class="sf-shead"><h3>${ic ? icon(ic, 20) : ""}${title}</h3>${note ? `<span class="sf-dim">${note}</span>` : ""}</div>${body}</section>` : "";

  /* ---------- HUB tab ---------- */
  function renderHub(t){
    const m = model(t), S = m.S, opts = S.opts, layout = t.slotData?.Data?.HubLayout || [];
    const partName = id => D.partsById[id] || `Part ${id}`;
    const goals = [].concat(opts.GoalSelection || []), phase = opts.FinalElevatorPhase, exploration = t.slotData?.Data?.ExplorationCosts || {};
    const goalCards = goals.map(g => {
      let body = "", ic = "trophy";
      if(g === "Space Elevator Phase" && phase){ ic = "elevator"; body = `<b class="sf-big">Phase ${phase}</b><div class="sf-costs">${Object.entries(D.elevator[phase - 1] || {}).map(([p, n]) => costChip(t, S, p, n)).join("")}</div>`; }
      else if(g === "AWESOME Sink Points (total)") body = `<b class="sf-big">${fmt(opts.FinalResourceSinkPointsTotal || 0)}</b><span class="sf-dim">points in total</span>`;
      else if(g === "AWESOME Sink Points (per minute)") body = `<b class="sf-big">${fmt(opts.FinalResourceSinkPointsPerMinute || 0)}</b><span class="sf-dim">points per minute</span>`;
      else if(g === "Exploration Collectables") body = `<div class="sf-costs">${Object.entries(exploration).map(([id, n]) => `<span class="sf-cost ok">${partIcon(partName(id), 18)}<b>${fmt(n)}</b><span>${esc(partName(id))}</span></span>`).join("")}</div>`;
      return `<div class="sf-goal">${icon(ic, 30)}<div><span class="sf-k">${esc(GOAL_LABEL[g] || g)}</span>${body}</div></div>`;
    }).join("");
    const tiers = layout.map((milestones, ti) => {
      const tier = ti + 1, prog = m.hub[tier] || {};
      const cards = milestones.map((cost, mi) => {
        const p = prog[mi + 1]; if(!p) return "";
        const done = p.done === p.total, parts = Object.entries(cost).map(([id, n]) => [partName(id), n]), inReach = parts.every(([part]) => S.canMake(part));
        const cls = done ? "done" : p.ready ? "go" : inReach && !m.haveLogic ? "reach" : "";
        return `<article class="sf-ms ${cls}">
          <header><span class="sf-lamp"></span><b>${tier}-${mi + 1}</b>${p.ready ? `<em>${p.ready} ready</em>` : done ? `<em class="ok">${icon("check", 13)}Purchased</em>` : ""}
            <span class="sf-slots">${Array.from({ length:p.total }, (_, i) => `<i class="${p.slots[i] || ""}"></i>`).join("")}</span></header>
          ${done ? "" : `<div class="sf-costs">${parts.map(([part, n]) => costChip(t, S, part, n)).join("")}</div>`}</article>`;
      }).join("");
      if(!cards) return "";
      const all = Object.values(prog), d = all.filter(x => x.done === x.total).length, needPhase = tier > 2 ? Math.ceil(tier / 2) - 1 : 0;
      const head = `<div class="sf-tierhead"><h4>Tier ${tier}</h4><span class="sf-dim">${d}/${all.length} milestones${needPhase ? ` · after elevator phase ${needPhase}` : ""}</span>`;
      if(d === all.length)   // a finished tier folds into one row
        return `<div class="sf-tier full">${head}<span class="sf-pills">${Object.keys(prog).map(k => `<i>${icon("check", 12)}${tier}-${k}</i>`).join("")}</span></div></div>`;
      return `<div class="sf-tier">${head}</div><div class="sf-mss">${cards}</div></div>`;
    }).join("");
    return `<div class="sf">${header(t, m)}
      ${sec("Project goal", (goals.length > 1 ? `<span class="sf-dim">${opts.GoalRequirement === 1 ? "Complete all of these" : "Complete any one of these"}</span>` : "") + `<div class="sf-goals">${goalCards || '<span class="sf-dim">Goal not shared by this slot</span>'}</div>`, "", "trophy")}
      ${sec("The HUB", tiers, `${m.haveLogic ? "Blinking lamp: checks you can do now · " : ""}lit part: you can make it${t.isMine ? " · click an unlit part for a hint" : ""}`, "hub")}
    </div>`;
  }

  /* ---------- Production tab ---------- */
  function renderProduction(t){
    const m = model(t), S = m.S;
    const byBuilding = {};
    for(const [part, rs] of Object.entries(S.partRecipes)){ const b = D.recipes[rs[0]].building || "Other"; (byBuilding[b] ||= []).push(part); }
    const machines = [...PROD_ORDER, "Other"].filter(b => byBuilding[b]).map(b => {
      const bOn = b === "Other" || S.buildingOn(b), parts = byBuilding[b].sort(), can = parts.filter(S.canMake).length;
      const tiles = parts.map(part => { const rs = S.partRecipes[part], have = rs.filter(S.recipeOn).length, ok = S.canMake(part);
        return `<div class="sf-part${ok ? " ok" : have ? " half" : ""}"${t.hint(rs, part)} title="${esc(part)}: ${have} of ${rs.length} recipes unlocked">${partIcon(part, 22)}<span>${esc(part)}</span><small>${have}/${rs.length}</small></div>`; }).join("");
      return `<div class="sf-machine${bOn ? " on" : ""}${can ? " busy" : ""}"><div class="sf-mhead"${b !== "Other" && !bOn ? t.hint("Building: " + b, b) : ""}>${icon("gear", 30, null, "sf-cog")}<div><b>${esc(b)}</b><span class="sf-dim">${b !== "Other" && !bOn ? "building locked" : `${can} of ${parts.length} parts in production`}</span></div></div><div class="sf-parts">${tiles}</div></div>`;
    }).join("");
    const allBuildings = t.itemNames.filter(n => n.startsWith("Building: "));
    const grouped = {}; for(const n of allBuildings){ const plain = n.slice(10); const g = (BUILDING_GROUPS.find(([, re]) => re.test(plain)) || ["Construction & decor"])[0]; (grouped[g] ||= []).push(plain); }
    const bHtml = [...BUILDING_GROUPS.map(g => g[0]), "Construction & decor"].filter(g => grouped[g]).map(g => {
      const list = grouped[g].sort(), on = list.filter(b => S.buildingOn(b)).length;
      return `<div class="sf-bcat"><div class="sf-bcathead"><span>${g}</span><span class="tab">${on}/${list.length}</span></div><div class="sf-bar"><i style="width:${Math.round(on / list.length * 100)}%"></i></div>
        <div class="sf-chips">${list.map(b => `<span class="sf-chip${S.buildingOn(b) ? " on" : ""}"${S.buildingOn(b) ? "" : t.hint("Building: " + b, b)}>${esc(b)}</span>`).join("")}</div></div>`;
    }).join("");
    const gear = [...D.groups.Equipment.filter(n => !/Cup|Statue|golden|gold\)/i.test(n)), ...D.groups.Vehicles, ...D.groups.Trains, ...D.groups.Upgrades].filter(n => t.itemNames.includes(n));
    const gearHtml = gear.map(n => { const label = n.replace(/^(Bundle|Single|Transport): /, ""), k = t.count(n);
      return `<span class="sf-chip${k ? " on" : ""}"${k ? "" : t.hint(n, label)}>${esc(label)}${k > 1 ? ` ×${k}` : ""}</span>`; }).join("");
    return `<div class="sf">${header(t, m)}
      ${sec("Production", `<div class="sf-machines">${machines}</div>`, `Gear turning: the building is unlocked and making something · lit part: you can make it${t.isMine ? " · click a part to hint a recipe" : ""}`, "gear")}
      ${sec("Buildings", `<div class="sf-bcats">${bHtml}</div>`, "", "hub")}
      ${sec("Equipment & vehicles", gearHtml && `<div class="sf-chips">${gearHtml}</div>`, "", "crate")}
    </div>`;
  }

  /* ---------- MAM & more tab ---------- */
  function renderMam(t){
    const m = model(t), traps = t.count(/^Trap: /);
    const trees = Object.entries(D.mam).map(([tree, nodes]) => {
      const here = nodes.filter(([n]) => m.mam[tree]?.[n]); if(!here.length) return "";
      // columns by depth: a node sits one column right of its deepest prerequisite
      const deps = Object.fromEntries(nodes), depth = {}, dOf = n => depth[n] ??= Math.max(0, ...(deps[n] || []).filter(x => deps[x]).map(x => dOf(x) + 1));
      const cols = []; for(const [n] of here) (cols[dOf(n)] ||= []).push(n);
      const done = here.filter(([n]) => m.mam[tree][n].done).length, rd = here.filter(([n]) => m.mam[tree][n].ready).length;
      const node = n => { const l = m.mam[tree][n], cls = l.done ? "on" : l.ready ? "go" : "";
        return t.isMine && !l.done && l.id != null ? `<button type="button" class="sf-node ${cls}" data-loc="${l.id}" title="What's in this research?">${esc(n)}</button>` : `<span class="sf-node ${cls}">${esc(n)}</span>`; };
      return `<div class="sf-tree${done === here.length ? " full" : ""}"><div class="sf-treehead">${icon("flask", 20)}<b>${esc(tree)}</b>${rd ? `<em>${rd} ready</em>` : ""}<span class="tab">${done}/${here.length}</span></div><div class="sf-bar"><i style="width:${Math.round(done / here.length * 100)}%"></i></div>
        <div class="sf-graph">${cols.filter(Boolean).map(c => `<div class="sf-col">${c.map(node).join("")}</div>`).join("")}</div></div>`;
    }).join("");
    const drives = m.drives.length ? `<div class="sf-drives">${m.drives.map((l, i) => `<span class="sf-drive ${l.done ? "on" : l.ready ? "go" : ""}" title="Hard drive ${i + 1}${l.done ? ": found" : l.ready ? ": in reach" : ""}">${icon("drive", 18)}</span>`).join("")}</div>` : "";
    const shop = m.shop.length ? `<div class="sf-coupons">${m.shop.map((l, i) => `<span class="sf-coupon ${l.done ? "on" : l.ready ? "go" : ""}" title="AWESOME Shop purchase ${i + 1}">${icon("coupon", 22)}<b>${i + 1}</b></span>`).join("")}</div>` : "";
    return `<div class="sf">${header(t, m)}
      ${sec("MAM research", trees && `<div class="sf-trees">${trees}</div>`, [m.haveLogic ? "Glowing: research you can do now" : "", t.isMine ? "click open research to see what it holds" : ""].filter(Boolean).join(" · "), "flask")}
      ${sec("Hard drives", drives, `${m.drives.filter(l => l.done).length} of ${m.drives.length} found${m.haveLogic ? ` · ${m.drives.filter(l => l.ready).length} in reach` : ""}`, "drive")}
      ${sec("AWESOME Shop", shop, `${m.shop.filter(l => l.done).length} of ${m.shop.length} purchases${traps ? ` · ${traps} trap${traps > 1 ? "s" : ""} received` : ""}`, "coupon")}
    </div>`;
  }

  function group(name){
    let m = /^Hub (\d+)-/.exec(name); if(m) return `HUB Tier ${m[1]}`;
    if(/^AWESOME Shop/.test(name)) return "AWESOME Shop";
    if(/^Hard drive/.test(name)) return "Hard drives";
    m = /^([^:]+): /.exec(name); if(m && D.mam[m[1]]) return `MAM: ${m[1]}`;
    return "Other";
  }

  APTracker.register({
    game: "Satisfactory",
    slotData: true,
    async init(api){ D = await api.json("data/satisfactory.json"); },
    tabs: [{ id:"sf-hub", label:"HUB", render:renderHub }, { id:"sf-prod", label:"Production", render:renderProduction }, { id:"sf-mam", label:"MAM & more", render:renderMam }],
    checksLabel: "Checks by source",
    locationGroup: group,
    groupOrder: g => { const m = /^HUB Tier (\d+)$/.exec(g); return m ? +m[1] : g.startsWith("MAM") ? 20 : g === "Hard drives" ? 30 : g === "AWESOME Shop" ? 40 : 50; },
    card(t){
      const m = model(t); let top = 0, done = 0, total = 0;
      for(const [tier, ms] of Object.entries(m.hub)) for(const p of Object.values(ms)){ total++; if(p.done === p.total){ done++; top = Math.max(top, +tier); } }
      return [m.haveLogic ? `${m.ready} ready now` : "", `HUB tier ${top}`, `${done}/${total} milestones`].filter(Boolean).map(esc).join(" · ");
    }
  });
})();
