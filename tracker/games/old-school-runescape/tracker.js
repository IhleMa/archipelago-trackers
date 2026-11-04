/* Old School RuneScape tracker (core Archipelago world "Old School Runescape").
   Quest list in the game's red/yellow/green style, a stylized F2P map of area unlocks, skill tasks per skill,
   and progressive equipment tiers. "Can do" follows the world's rules: an area is reachable when its Area item
   is held and it connects to a reachable area; a task needs its areas/resources, items and quest points.
   Skill levels aren't sent to Archipelago, so skill requirements are shown as text.
   Data: data/osrs.json, generated from worlds/osrs (Archipelago, MIT licence). */
(() => {
  let D = null, GEO = null;   // GEO: real map outlines, only when img/map.jpg is present
  const MAP = { // area -> [column, row, column span, row span] on a stylized 12 x 8 grid (west -> east, north -> south)
    "Wilderness":[1,1,12,1], "Monastery":[1,2,2,1], "Ice Mountain":[3,2,2,1], "Edgeville":[6,2,2,1], "Varrock Palace":[9,2,2,1], "Lumberyard":[11,2,2,1],
    "Dwarven Mines":[3,3,2,1], "Barbarian Village":[5,3,2,1], "West Varrock":[7,3,2,1], "Central Varrock":[9,3,2,1],
    "Falador":[2,4,3,1], "Draynor Manor":[5,4,2,1], "South of Varrock":[8,4,3,1], "Al Kharid":[11,4,2,3],
    "Falador Farms":[2,5,3,1], "Draynor Village":[5,5,1,1], "HAM Hideout":[6,5,1,1], "Lumbridge Farms":[7,5,3,1],
    "Crafting Guild":[1,6,1,1], "Rimmington":[2,6,2,1], "Port Sarim":[4,6,2,1], "Wizard Tower":[6,6,1,1], "Lumbridge":[8,6,2,1],
    "Corsair Cove":[1,7,1,1], "Mudskipper Point":[4,7,1,1], "Lumbridge Swamp":[8,7,2,1], "Citharede Abbey":[11,7,2,1],
    "Crandor":[3,8,1,1], "Karamja":[4,8,3,1], "Menaphos":[11,8,2,1]
  };
  const TIERS = {
    "Progressive Weapons":["Bronze","Iron","Steel","Black","Mithril","Adamant","Rune"],
    "Progressive Armor":["Bronze","Iron","Steel","Black","Mithril","Adamant","Rune"],
    "Progressive Tools":["Bronze","Iron","Steel","Black","Mithril","Adamant","Rune"],
    "Progressive Ranged Weapon":["Normal","Oak","Willow","Maple"],
    "Progressive Ranged Armor":["None","Leather","Studded","Green d'hide"],
    "Progressive Magic Spell":["Strike","Bolt","Blast"]
  };
  const TIER_LABEL = { "Progressive Weapons":"Melee weapons", "Progressive Armor":"Armour", "Progressive Tools":"Tools",
    "Progressive Ranged Weapon":"Bows", "Progressive Ranged Armor":"Ranged armour", "Progressive Magic Spell":"Spells" };
  const METAL = { Bronze:"#a8743b", Iron:"#8f8f8f", Steel:"#c9c9c9", Black:"#3a3a3a", Mithril:"#4b5fa8", Adamant:"#3f8a4a", Rune:"#3fa9c9",
    Normal:"#9b7a4b", Oak:"#b98d4e", Willow:"#c8b46a", Maple:"#d59a3a", None:"#6b5c49", Leather:"#8a5a2b", Studded:"#a0703e", "Green d'hide":"#3e8c3a",
    Strike:"#d9d9d9", Bolt:"#e4c34a", Blast:"#e06a2a" };
  const SKILL_ORDER = ["combat","prayer","magic","runecraft","crafting","mining","smithing","fishing","cooking","firemaking","woodcutting"];
  const SKILL_COLOR = { combat:"#c33c2c", prayer:"#e8e2c9", magic:"#4b6fd6", runecraft:"#c9b78f", crafting:"#a07a4b", mining:"#6f7c86", smithing:"#9a9a9a",
    fishing:"#6aa6d6", cooking:"#7b3fa0", firemaking:"#e07a2a", woodcutting:"#3f8a4a" };
  const cap = s => s[0].toUpperCase() + s.slice(1);

  /* ---------- reachability, ported from the world's region connections ---------- */
  function world(t){
    const sd = t.slotData || {}, have = n => t.has(n);
    const doneQP = Object.entries(D.questPoints).filter(([q]) => t.checked.includes("Quest: " + q) || t.checked.includes("Quest: " + q.replace(/^The /, "The "))).reduce((a, [, n]) => a + n, 0);
    let start = String(sd.starting_area || "").replace(/^Area: /, "").replace(/\s*\(.*$/, "");
    if(!D.regions[start]) start = Object.keys(D.regions).find(r => D.regions[r][0].replace("*", "") === "Area: " + start) || start;
    const open = new Set();
    const canEnter = r => { const row = D.regions[r]; if(!row) return false;
      if(r === "Crandor" && doneQP < 32) return false;
      return have(row[0].replace("*", "")); };
    if(D.regions[start] && have(D.regions[start][0].replace("*", ""))) open.add(start);
    // the starting area item may not be marked; fall back to any held area connected to nothing else
    if(!open.size) for(const r of Object.keys(D.regions)) if(canEnter(r)){ open.add(r); break; }
    let grew = true;
    while(grew){ grew = false;
      for(const r of [...open]) for(const c of D.regions[r][1]){ const to = c.replace("*", ""); if(!open.has(to) && D.regions[to] && canEnter(to)){ open.add(to); grew = true; } } }
    const resources = new Set(); for(const r of open) for(const res of D.regions[r][2]) if(res) resources.add(res.replace("*", ""));
    const reach = name => open.has(name) || resources.has(name);
    // what a task still needs
    const needs = loc => {
      const row = D.locations[loc]; if(!row) return null;
      const [, regs, , items, qp] = row, miss = { areas:[], items:[], qp:0, cut:[] };
      for(const r of regs){ const n = r.replace("*", "");
        if(!reach(n)){ const area = D.regions[n] ? D.regions[n][0].replace("*", "") : null;
          if(area) miss.areas.push(area); else { const from = Object.entries(D.regions).filter(([, v]) => v[2].some(x => x.replace("*", "") === n)).map(([, v]) => v[0].replace("*", "")); miss.areas.push(...from.slice(0, 3)); } } }
      const counts = {}; for(const i of items) counts[i] = (counts[i] || 0) + 1;
      for(const [i, n] of Object.entries(counts)) if(t.count(i) < n) miss.items.push(i);
      if(qp && doneQP <= qp) miss.qp = qp;
      // areas already held but not connected to anything reachable yet: no hint needed for them
      miss.cut = [...new Set(miss.areas.filter(a => have(a)))];
      miss.areas = [...new Set(miss.areas.filter(a => !have(a)))];
      return miss;
    };
    return { open, reach, needs, doneQP, start };
  }

  function panel(t){
    const e = t.esc, W = world(t), done = new Set(t.checked), inSeed = new Set([...t.checked, ...t.missing]);
    const status = loc => { if(done.has(loc)) return ["done", null]; const m = W.needs(loc); return m && (m.areas.length || m.items.length || m.qp || m.cut.length) ? ["locked", m] : ["avail", m]; };
    const reqText = (loc, m) => { const row = D.locations[loc] || [], parts = [];
      for(const [s, l] of row[2] || []) parts.push(`${s} ${l}`);
      if(m){ if(m.areas.length) parts.push("Needs " + m.areas.map(a => a.replace("Area: ", "")).join(", ")); if(m.items.length) parts.push("Needs " + [...new Set(m.items)].join(", ")); if(m.qp) parts.push(`More than ${m.qp} QP`); if(m.cut.length) parts.push("No path to " + m.cut.map(a => a.replace("Area: ", "")).join(", ") + " yet"); }
      return parts.join(" · "); };
    const line = loc => { const [st, m] = status(loc), hints = m ? [...m.areas, ...m.items] : [];
      return `<li class="os-${st}"${st === "locked" && hints.length ? t.hint(hints, loc.replace(/^Quest: /, "")) : ""}><span>${e(loc.replace(/^Quest: /, ""))}</span>${reqText(loc, st === "locked" ? m : null) ? `<small>${e(reqText(loc, st === "locked" ? m : null))}</small>` : ""}</li>`; };

    // quests
    const quests = Object.keys(D.locations).filter(n => (D.locations[n][0] === "quest" || D.locations[n][0] === "goal") && inSeed.has(n));
    const qDone = quests.filter(q => done.has(q)).length, goal = Object.keys(D.locations).find(n => D.locations[n][0] === "goal");
    const qList = quests.map(q => { const qp = D.questPoints[q.replace(/^Quest: /, "")];
      return line(q).replace("</span>", `${qp ? ` <b class="os-qp">${qp} QP</b>` : ""}</span>`); }).join("");

    // map: real map with outlines when available
    const realMap = () => {
      const poly = (name, pts, w) => { const a = "Area: " + name; if(!t.itemNames.includes(a)) return "";
        const on = t.has(a), isStart = W.start && (W.start === name || (D.regions[W.start] && D.regions[W.start][0].replace("*", "") === a));
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = name === "Wilderness" ? Math.min(...ys) + 40 : (Math.min(...ys) + Math.max(...ys)) / 2;
        // fit the label inside its area: shrink it, and wrap onto two lines when one line is too wide
        const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys), cw = 0.62;
        const words = name.split(" "), oneLine = Math.min(12, bw / (name.length * cw));
        let lines = [name], fs = oneLine;
        if(oneLine < 8 && words.length > 1){
          const mid = Math.ceil(words.length / 2), two = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
          const fs2 = Math.min(12, bw / (Math.max(...two.map(l => l.length)) * cw), bh / 2.6);
          if(fs2 > oneLine){ lines = two; fs = fs2; }
        }
        fs = Math.max(5, Math.min(fs, w / 40));
        const label = lines.map((l, i) => `<tspan x="${cx}" dy="${i === 0 ? -(lines.length - 1) * 0.55 : 1.1}em">${e(l)}</tspan>`).join("");
        return `<g class="os-reg${on ? " on" : " locked"}${isStart ? " start" : ""}"${on ? "" : t.hint(a, name)}><title>${e(name)}${on ? " (unlocked)" : " (locked)"}</title>
          <polygon points="${pts.map(p => p.join(",")).join(" ")}"/><text x="${cx}" y="${cy}" font-size="${fs.toFixed(1)}">${label}</text></g>`; };
      const m = GEO.main;
      const main = `<div class="os-mapscroll"><div class="os-mapwrap"><img src="${GEO.url(m.file)}" alt="Old School RuneScape world map" width="${m.w}" height="${m.h}">
        <svg viewBox="0 0 ${m.w} ${m.h}" preserveAspectRatio="none">${Object.entries(m.areas).sort((a, b) => a[0] === "Wilderness" ? -1 : b[0] === "Wilderness" ? 1 : 0).map(([n, p]) => poly(n, p, m.w)).join("")}</svg></div></div>`;
      const insets = Object.entries(GEO.insets).filter(([n]) => t.itemNames.includes("Area: " + n)).map(([n, g]) =>
        `<figure class="os-inset"><div class="os-mapwrap"><img src="${GEO.url(g.file)}" alt="" width="${g.w}" height="${g.h}"><svg viewBox="0 0 ${g.w} ${g.h}" preserveAspectRatio="none">${poly(n, g.points, 520)}</svg></div><figcaption>${e(n)}</figcaption></figure>`).join("");
      return main + (insets ? `<div class="os-insets"><span class="os-dim">Further away</span>${insets}</div>` : "");
    };
    const mapTiles = GEO ? "" : D.areas.map(a => { const name = a.replace("Area: ", ""), pos = MAP[name]; if(!pos || !t.itemNames.includes(a)) return "";
      const on = t.has(a), isStart = W.start && (W.start === name || (D.regions[W.start] && D.regions[W.start][0].replace("*", "") === a));
      return `<div class="os-area${on ? " on" : ""}${isStart ? " start" : ""}"${on ? "" : t.hint(a, name)} style="grid-column:${pos[0]}/span ${pos[2]};grid-row:${pos[1]}/span ${pos[3]}" title="${e(name)}${on ? " (unlocked)" : " (locked)"}"><span>${e(name)}</span></div>`; }).join("");
    const areasHeld = D.areas.filter(a => t.has(a)).length;

    // skills (stats tab)
    const byCat = {}; for(const n of inSeed){ const row = D.locations[n]; if(!row) continue; (byCat[row[0]] ||= []).push(n); }
    const skillTiles = SKILL_ORDER.filter(s => byCat[s]).map(s => { const list = byCat[s], d = list.filter(n => done.has(n)).length;
      return `<div class="os-skill" style="--sc:${SKILL_COLOR[s]}"><i></i><span>${cap(s)}</span><b>${d}<em>/${list.length}</em></b></div>`; }).join("");
    const taskGroups = [...SKILL_ORDER, "general"].filter(s => byCat[s]).map(s => {
      const list = byCat[s].sort((a, b) => ((D.locations[a][2][0] || [,0])[1]) - ((D.locations[b][2][0] || [,0])[1]) || a.localeCompare(b));
      return `<div class="os-tasks"><h4 style="--sc:${SKILL_COLOR[s] || "#ff981f"}">${s === "general" ? "General" : cap(s)}</h4><ul>${list.map(line).join("")}</ul></div>`; }).join("");

    // equipment
    const gear = Object.keys(TIERS).filter(n => t.itemNames.includes(n)).map(n => { const k = Math.min(t.count(n), TIERS[n].length - 1);
      return `<div class="os-gear"${t.hint(n, TIER_LABEL[n])}><span class="os-k">${TIER_LABEL[n]}</span><div class="os-tiers">${TIERS[n].map((tier, i) =>
        `<span class="${i <= k ? "on" : ""}${i === k ? " cur" : ""}" style="--mc:${METAL[tier]}" title="${e(tier)}">${e(tier)}</span>`).join("")}</div></div>`; }).join("");

    const sec = (title, body, note = "") => body ? `<section class="os-sec"><div class="os-shead"><h3>${title}</h3>${note ? `<span class="os-dim">${note}</span>` : ""}</div>${body}</section>` : "";
    return `<div class="os">
      <div class="os-top">
        <div class="os-stat"><span class="os-k">Quest points</span><b>${W.doneQP}</b><small>Dragon Slayer needs 32</small></div>
        <div class="os-stat"><span class="os-k">Quests</span><b>${qDone}/${quests.length}</b><small>${goal && done.has(goal) ? "Dragon Slayer complete!" : "Goal: Dragon Slayer"}</small></div>
        <div class="os-stat"><span class="os-k">Areas</span><b>${areasHeld}/${D.areas.filter(a => t.itemNames.includes(a)).length}</b><small>${W.start ? "Started in " + e(W.start) : ""}</small></div>
      </div>
      ${sec("Quest list", `<ul class="os-list">${qList}</ul>`, `<span class="os-g">Done</span> · <span class="os-y">Can start</span> · <span class="os-r">Missing areas or items</span>${t.isMine ? " · click red for a hint" : ""}`)}
      ${sec("World map", GEO ? realMap() : `<div class="os-map">${mapTiles}</div>`, `${GEO ? "Clear = unlocked · dark = locked" : "Lit = unlocked · stylized, not to scale"}${t.isMine ? " · click a locked area for a hint" : ""}`)}
      ${sec("Equipment", gear && `<div class="os-gears">${gear}</div>`)}
      ${sec("Skills", `<div class="os-skills">${skillTiles}</div>${taskGroups}`, "Tasks done per skill · your levels aren't sent to Archipelago, so level requirements are listed")}
    </div>`;
  }

  APTracker.register({
    game: "Old School Runescape",
    slotData: true,
    async init(api){
      D = await api.json("data/osrs.json");
      // use the real world map if the server owner added the image; otherwise keep the stylized grid
      try {
        const geo = await api.json("data/map.json");
        const ok = await new Promise(res => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = api.url(geo.main.file); });
        if(ok) GEO = { ...geo, url:api.url };
      } catch(e){}
    },
    tabs: [{ id:"adventure", label:"Adventure", render:panel }],
    checksLabel: "Checks by skill",
    locationGroup: n => { const row = D.locations[n]; return row ? (row[0] === "goal" || row[0] === "quest" ? "Quests" : row[0] === "general" ? "General" : cap(row[0])) : "Other"; },
    groupOrder: g => g === "Quests" ? 0 : g === "General" ? 99 : 1 + SKILL_ORDER.indexOf(g.toLowerCase()),
    card(t){
      const W = world(t), quests = Object.keys(D.locations).filter(n => ["quest", "goal"].includes(D.locations[n][0]));
      return `${W.doneQP} QP · ${quests.filter(q => t.checked.includes(q)).length} quests · ${D.areas.filter(a => t.has(a)).length} areas`;
    }
  });
})();
