/* Satisfactory tracker: goal, HUB milestones with their real part costs from the seed, which parts you
   can produce right now (recipe + building unlocked), MAM research, buildings, equipment and vehicles.
   Data: data/satisfactory.json, generated from the Satisfactory Archipelago world (MIT licence):
   recipe items -> parts and building, MAM trees, Space Elevator phases, item groups, part IDs. */
(() => {
  let D = null;
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
    const canMake = part => {
      if(D.freeParts.includes(part)) return true;
      return (partRecipes[part] || []).some(n => recipeOn(n) && buildingOn(D.recipes[n].building));
    };
    // why a part can't be made yet: no recipe, or recipe but no building
    const blocker = part => {
      const rs = partRecipes[part] || [];
      const owned = rs.filter(recipeOn);
      if(!owned.length) return { kind:"recipe", items:rs };
      const b = [...new Set(owned.map(n => D.recipes[n].building).filter(x => x && !buildingOn(x)))];
      return { kind:"building", items:b.map(x => "Building: " + x) };
    };
    return { opts, recipeOn, buildingOn, partRecipes, canMake, blocker };
  }

  function hubProgress(t){
    const tiers = {};
    for(const l of t.locations || [...t.checked.map(name => ({ name, done:true })), ...t.missing.map(name => ({ name, done:false }))]){
      const m = /^Hub (\d+)-(\d+), item (\d+)$/.exec(l.name); if(!m) continue;
      const k = (tiers[m[1]] ||= {}), ms = (k[m[2]] ||= { done:0, total:0 });
      ms.total++; if(l.done) ms.done++;
    }
    return tiers;
  }

  /* ---------- panel ---------- */
  function panel(t){
    const e = t.esc, S = state(t), opts = S.opts, layout = t.slotData?.Data?.HubLayout || [];
    const hub = hubProgress(t);
    const partName = id => D.partsById[id] || `Part ${id}`;
    const chip = (part, amount) => {
      const ok = S.canMake(part), b = ok ? null : S.blocker(part);
      const why = ok ? "You can produce this" : b.kind === "recipe" ? "No recipe unlocked yet" : `Needs ${b.items.map(x => x.replace("Building: ", "")).join(" or ")}`;
      const hint = !ok && b.items.length ? t.hint(b.items, part) : "";
      return `<span class="sf-cost${ok ? " ok" : ""}"${hint} title="${e(part)}: ${e(why)}"><b>${fmt(amount)}</b> ${e(part)}</span>`;
    };

    // goal
    const goals = [].concat(opts.GoalSelection || []);
    const phase = opts.FinalElevatorPhase, phaseCost = phase ? D.elevator[phase - 1] : null;
    const exploration = t.slotData?.Data?.ExplorationCosts || {};
    const goalCards = goals.map(g => {
      let body = "";
      if(g === "Space Elevator Phase" && phaseCost) body = `<b class="sf-big">Phase ${phase}</b><div class="sf-costs">${Object.entries(phaseCost).map(([p, n]) => chip(p, n)).join("")}</div>`;
      else if(g === "AWESOME Sink Points (total)") body = `<b class="sf-big">${fmt(opts.FinalResourceSinkPointsTotal || 0)}</b><span class="sf-dim">points in total</span>`;
      else if(g === "AWESOME Sink Points (per minute)") body = `<b class="sf-big">${fmt(opts.FinalResourceSinkPointsPerMinute || 0)}</b><span class="sf-dim">points per minute</span>`;
      else if(g === "Exploration Collectables") body = `<div class="sf-costs">${Object.entries(exploration).map(([id, n]) => `<span class="sf-cost ok"><b>${fmt(n)}</b> ${e(partName(id))}</span>`).join("")}</div>`;
      return `<div class="sf-goal"><span class="sf-k">${e(GOAL_LABEL[g] || g)}</span>${body}</div>`;
    }).join("");
    const goalHead = goals.length > 1 ? `<span class="sf-dim">${opts.GoalRequirement === 1 ? "Complete all of these" : "Complete any one of these"}</span>` : "";

    // HUB
    let doneMs = 0, totalMs = 0;
    const tiersHtml = layout.map((milestones, ti) => {
      const tier = ti + 1, prog = hub[tier] || {};
      const cards = milestones.map((cost, mi) => {
        const p = prog[mi + 1]; if(!p) return "";
        totalMs++; const done = p.done === p.total; if(done) doneMs++;
        const parts = Object.entries(cost).map(([id, n]) => [partName(id), n]);
        const ready = parts.every(([part]) => S.canMake(part));
        return `<div class="sf-ms${done ? " done" : ready ? " ready" : ""}">
          <div class="sf-mshead"><span>Milestone ${tier}-${mi + 1}</span><span class="sf-slots">${Array.from({ length:p.total }, (_, i) => `<i class="${i < p.done ? "on" : ""}"></i>`).join("")}</span></div>
          ${done ? '<span class="sf-state">Purchased</span>' : `<div class="sf-costs">${parts.map(([part, n]) => chip(part, n)).join("")}</div>`}
        </div>`;
      }).join("");
      if(!cards) return "";
      const needPhase = tier > 2 ? Math.ceil(tier / 2) - 1 : 0;
      return `<div class="sf-tier"><div class="sf-tierhead"><h4>Tier ${tier}</h4>${needPhase ? `<span class="sf-dim">Needs Space Elevator phase ${needPhase}</span>` : ""}</div><div class="sf-mss">${cards}</div></div>`;
    }).join("");

    // parts you can make, grouped by building of their recipes
    const byBuilding = {};
    for(const [part, rs] of Object.entries(S.partRecipes)){
      const b = D.recipes[rs[0]].building || "Other"; (byBuilding[b] ||= []).push(part);
    }
    const partsHtml = [...PROD_ORDER, "Other"].filter(b => byBuilding[b]).map(b => {
      const bOn = b === "Other" || S.buildingOn(b);
      const tiles = byBuilding[b].sort().map(part => {
        const rs = S.partRecipes[part], have = rs.filter(S.recipeOn).length, ok = S.canMake(part);
        return `<div class="sf-part${ok ? " ok" : have ? " half" : ""}"${t.hint(rs, part)} title="${e(part)}: ${have} of ${rs.length} recipes unlocked"><span>${e(part)}</span><small>${have}/${rs.length}</small></div>`;
      }).join("");
      return `<div class="sf-bgroup"><div class="sf-bhead${bOn ? " on" : ""}"${b !== "Other" ? t.hint("Building: " + b, b) : ""}><span class="sf-led"></span>${e(b)}${b !== "Other" && !bOn ? ' <span class="sf-dim">· building locked</span>' : ""}</div><div class="sf-parts">${tiles}</div></div>`;
    }).join("");

    // MAM
    const locId = {}; for(const l of t.locations || []) locId[l.name] = l.id;
    const doneSet = new Set(t.checked), inSeed = new Set([...t.checked, ...t.missing]);
    const mam = Object.entries(D.mam).map(([tree, nodes]) => {
      const here = nodes.filter(([n]) => inSeed.has(`${tree}: ${n}`)); if(!here.length) return "";
      const done = here.filter(([n]) => doneSet.has(`${tree}: ${n}`)).length;
      return `<div class="sf-tree"><div class="sf-treehead"><span>${e(tree)}</span><span class="tab">${done}/${here.length}</span></div><div class="sf-bar"><i style="width:${Math.round(done / here.length * 100)}%"></i></div>
        <div class="sf-nodes">${here.map(([n]) => { const name = `${tree}: ${n}`, d = doneSet.has(name), id = locId[name];
          return t.isMine && !d && id != null ? `<button type="button" class="sf-node" data-loc="${id}" title="What's in this research?">${e(n)}</button>` : `<span class="sf-node${d ? " on" : ""}">${e(n)}</span>`; }).join("")}</div></div>`;
    }).join("");

    // buildings
    const allBuildings = t.itemNames.filter(n => n.startsWith("Building: "));
    const grouped = {}; for(const n of allBuildings){ const plain = n.slice(10); const g = (BUILDING_GROUPS.find(([, re]) => re.test(plain)) || ["Construction & decor"])[0]; (grouped[g] ||= []).push(plain); }
    const bHtml = [...BUILDING_GROUPS.map(g => g[0]), "Construction & decor"].filter(g => grouped[g]).map(g => {
      const list = grouped[g].sort(), on = list.filter(b => S.buildingOn(b)).length;
      return `<div class="sf-bcat"><div class="sf-treehead"><span>${g}</span><span class="tab">${on}/${list.length}</span></div><div class="sf-chips">${list.map(b => `<span class="sf-chip${S.buildingOn(b) ? " on" : ""}"${t.hint("Building: " + b, b)}>${e(b)}</span>`).join("")}</div></div>`;
    }).join("");

    // equipment, vehicles, upgrades
    const gear = [...D.groups.Equipment.filter(n => !/Cup|Statue|golden|gold\)/i.test(n)), ...D.groups.Vehicles, ...D.groups.Trains, ...D.groups.Upgrades]
      .filter(n => t.itemNames.includes(n));
    const gearHtml = gear.map(n => { const label = n.replace(/^(Bundle|Single|Transport): /, ""), k = t.count(n);
      return `<span class="sf-chip${k ? " on" : ""}"${t.hint(n, label)}>${e(label)}${k > 1 ? ` ×${k}` : ""}</span>`; }).join("");

    const shop = t.locations ? t.locations.filter(l => /^AWESOME Shop purchase/.test(l.name)) : [];
    const drives = t.locations ? t.locations.filter(l => /^Hard drive random check/.test(l.name)) : [];
    const traps = t.count(/^Trap: /);
    const sec = (title, body, note = "") => body ? `<section class="sf-sec"><div class="sf-shead"><h3>${title}</h3>${note ? `<span class="sf-dim">${note}</span>` : ""}</div>${body}</section>` : "";

    return `<div class="sf">
      <div class="sf-top"><div class="sf-brand"><span class="sf-k">FICSIT Inc. · Pioneer</span><b>${e(t.name)}</b><span class="sf-dim">${doneMs} of ${totalMs} milestones purchased${traps ? ` · ${traps} trap${traps > 1 ? "s" : ""} received` : ""}</span></div>
        <div class="sf-mini">${shop.length ? `<div><span class="sf-k">AWESOME Shop</span><b class="tab">${shop.filter(l => l.done).length}/${shop.length}</b></div>` : ""}${drives.length ? `<div><span class="sf-k">Hard drives</span><b class="tab">${drives.filter(l => l.done).length}/${drives.length}</b></div>` : ""}</div></div>
      ${sec("Project goal", goalHead + `<div class="sf-goals">${goalCards || '<span class="sf-dim">Goal not shared by this slot</span>'}</div>`)}
      ${sec("The HUB", tiersHtml, `Orange = you can produce it · grey = missing recipe or building${t.isMine ? " · click a grey part for a hint" : ""}`)}
      ${sec("Production", partsHtml, `Lit = you can make this part · count = recipes unlocked${t.isMine ? " · click to hint a recipe" : ""}`)}
      ${sec("MAM research", mam && `<div class="sf-trees">${mam}</div>`, t.isMine && t.locations ? "Click open research to see what it holds" : "")}
      ${sec("Buildings", `<div class="sf-bcats">${bHtml}</div>`)}
      ${sec("Equipment & vehicles", gearHtml && `<div class="sf-chips">${gearHtml}</div>`)}
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
    tabs: [{ id:"factory", label:"Factory", render:panel }],
    checksLabel: "Checks by source",
    locationGroup: group,
    groupOrder: g => { const m = /^HUB Tier (\d+)$/.exec(g); return m ? +m[1] : g.startsWith("MAM") ? 20 : g === "Hard drives" ? 30 : g === "AWESOME Shop" ? 40 : 50; },
    card(t){
      const tiers = hubProgress(t); let top = 0, done = 0, total = 0;
      for(const [tier, ms] of Object.entries(tiers)) for(const p of Object.values(ms)){ total++; if(p.done === p.total){ done++; top = Math.max(top, +tier); } }
      const phase = t.slotData?.Data?.Options?.FinalElevatorPhase;
      return [`HUB tier ${top || 0}`, `${done}/${total} milestones`, phase ? `Goal: elevator phase ${phase}` : ""].filter(Boolean).map(t.esc).join(" · ");
    }
  });
})();
