/* Resident Evil 4 Remake tracker (RE4R-AP-Wizard world, game "Resident Evil 4 Remake").
   The 16 chapters with their sections and the key items that open them, the attaché case
   with weapons and gear, merchant and spinel trades, and The Mercenaries.
   Data: data/re4r.json, read from the world's milestones.py / locations.py / items.py (MIT licence, Meta // Cam). */
(() => {
  let D = null, IDX = {}, CH_FIRST = {}, CH_SECTIONS = {};
  const WEAPONS = [
    ["Handguns", ["Punisher", "Red9", "Blacktail", "Matilda", "Sentinel Nine"]],
    ["Shotguns", ["W-870", "Riot Gun", "Striker", "Skull Shaker"]],
    ["Rifles", ["SR M1903", "Stingray", "CQBR Assault Rifle"]],
    ["Submachine guns", ["TMP", "LE 5", "Chicago Sweeper"]],
    ["Magnums", ["Broken Butterfly", "Killer7", "Handcannon"]],
    ["Special", ["Bolt Thrower", "Rocket Launcher", "Flamethrower", "XM96E1"]],
  ];
  const MERC_CHARS = ["Leon", "Leon (Pinstripe)", "Luis", "Krauser", "HUNK", "Ada", "Ada (Dress)", "Wesker"];
  const MERC_STAGES = ["Village", "Castle", "Island", "Docks"];
  const short = n => n.replace(/ x\d+$/, "");
  const parse = n => { let m = /^Chapter (\d+) - (.+?) - /.exec(n); if(m) return { kind:"story", ch:+m[1], sec:m[2] };
    m = /^Merchant (Shop|Trade) Chapter (\d+) Check/.exec(n); if(m) return { kind:m[1].toLowerCase(), ch:+m[2] };
    m = /^Mercenaries - (.+) - (\w+) - Rank (\S+)$/.exec(n); if(m) return { kind:"merc", who:m[1], stage:m[2], rank:m[3] };
    return { kind:"other" }; };

  /* Which gates stand between the start and each section: index of the first unmet gate. */
  function route(t){
    const sd = t.slotData || {}, gates = { ...D.gates };
    if(sd.minimize_backtracking) for(const [k, v] of Object.entries(D.backtrackGates)) gates[k] = [...(gates[k] || []), ...v];
    let blockAt = Infinity, blockNeeds = null;
    const needs = {};
    D.order.forEach(([c, s], i) => { const g = gates[c + "|" + s]; if(!g) return; needs[i] = g;
      const miss = g.filter(x => !t.has(x)); if(miss.length && blockAt === Infinity){ blockAt = i; blockNeeds = miss; } });
    return { open:i => i < blockAt, blockAt, blockNeeds, needs };
  }

  function panel(t){
    const e = t.esc, sd = t.slotData || {}, R = route(t), done = new Set(t.checked), all = [...t.checked, ...t.missing];
    const spinel = ["Spinel x1", "Spinel x2", "Spinel x3", "Spinel x5"].reduce((a, n) => a + t.count(n) * +n.slice(-1), 0);
    const tradeCost = {}; for(const c of sd.trade_shop?.checks || []) tradeCost[c.name] = c.cumulative_spinel;
    const reachedCh = R.blockAt === Infinity ? 16 : D.order[Math.max(0, R.blockAt - 1)][0];

    // checks per chapter / section, and how many are in logic
    const ch = {}; const sec = {};
    for(const n of all){ const p = parse(n), d = done.has(n);
      if(p.kind === "story"){ const c = (ch[p.ch] ||= { d:0, n:0, open:0, shop:[0, 0], trade:[0, 0] }); c.n++; if(d) c.d++;
        const k = p.ch + "|" + p.sec, s = (sec[k] ||= [0, 0]); s[1]++; if(d) s[0]++;
        const g = /\[([0-9a-f]{8})\]$/.exec(n), cache = g && D.cacheKeys[g[1]];
        if(!d && R.open(IDX[k] ?? 0) && !(cache && cache.some(x => !t.has(x)))) c.open++; }
      else if(p.kind === "shop" || p.kind === "trade"){ const c = (ch[p.ch] ||= { d:0, n:0, open:0, shop:[0, 0], trade:[0, 0] }); c[p.kind][1]++; if(d) c[p.kind][0]++;
        const reach = R.open(CH_FIRST[p.ch] ?? 0) && (p.kind === "shop" || spinel >= (tradeCost[n] || 0)); if(!d && reach) c.open++; } }

    // ---- chapters
    const chapters = D.milestones.map(([area, chs]) => {
      const cards = chs.filter(c => ch[c]).map(c => { const x = ch[c], open = R.open(CH_FIRST[c] ?? 0), tot = x.n + x.shop[1] + x.trade[1], dn = x.d + x.shop[0] + x.trade[0];
        const secs = CH_SECTIONS[c].filter(s => sec[c + "|" + s]).map(s => { const i = IDX[c + "|" + s], [a, b] = sec[c + "|" + s], gate = R.needs[i];
          const lock = gate && gate.some(g => !t.has(g));
          return `${gate ? `<span class="re-gate${lock ? "" : " ok"}"${lock ? t.hint(gate.filter(g => !t.has(g)), s) : ""} title="${e(gate.map(short).join(", "))}">${lock ? "🔒" : "🔓"} ${e(gate.map(short).join(" + "))}</span>` : ""}
            <span class="re-secn${R.open(i) ? "" : " shut"}${a === b ? " clear" : ""}">${e(s)} <em>${a}/${b}</em></span>`; }).join("");
        const extra = [x.shop[1] && `Merchant ${x.shop[0]}/${x.shop[1]}`, x.trade[1] && `Trades ${x.trade[0]}/${x.trade[1]}`].filter(Boolean).join(" · ");
        return `<article class="re-ch${open ? "" : " shut"}${dn === tot ? " clear" : ""}">
          <header><span class="re-chno">Chapter ${c}</span><b>${dn}/${tot}</b></header>
          <div class="re-bar"><i style="width:${Math.round(dn / tot * 100)}%"></i></div>
          <div class="re-meta">${open ? (x.open ? `<span class="re-go">${x.open} in logic</span>` : dn === tot ? "Cleared" : "Nothing in logic") : "Not reachable yet"}${extra ? ` · ${extra}` : ""}</div>
          <div class="re-secs">${secs}</div></article>`; }).join("");
      return cards ? `<div class="re-act"><h4>${e(area)}</h4><div class="re-chs">${cards}</div></div>` : ""; }).join("");

    // ---- key items, ordered by the gate that needs them
    const firstUse = {}; Object.entries(R.needs).sort((a, b) => a[0] - b[0]).forEach(([i, g]) => g.forEach(x => firstUse[x] ??= +i));
    const cacheOnly = new Set(Object.values(D.cacheKeys).flat());
    const keys = D.keyItems.filter(n => t.itemNames.includes(n)).sort((a, b) => (firstUse[a] ?? 999) - (firstUse[b] ?? 999) || a.localeCompare(b)).map(n => {
      const i = firstUse[n], where = i != null ? `Ch ${D.order[i][0]} · ${D.order[i][1]}` : cacheOnly.has(n) ? "Opens a locked cache" : "";
      return `<div class="re-key${t.has(n) ? " on" : ""}"${t.hint(n)}><b>${e(short(n))}</b><small>${e(where)}</small></div>`; }).join("");
    const smallKeys = t.itemNames.includes("Small Key x1") ? t.count("Small Key x1") : null;

    // ---- attaché case
    const caseN = t.count("Progressive Attache Case x1"), caseName = caseN ? D.caseTiers[Math.min(caseN, D.caseTiers.length) - 1].replace("Case: ", "") : "7x10";
    const [cw, chh] = caseName.split("x").map(Number);
    const own = w => t.items.some(it => it.name === w || it.name.startsWith(w + " x"));
    const wname = w => t.itemNames.find(n => n === w + " x1") || t.itemNames.find(n => n.startsWith(w + " x"));
    const weapons = WEAPONS.map(([cat, list]) => { const tiles = list.filter(w => wname(w)).map(w => `<div class="re-gun${own(w) ? " on" : ""}"${own(w) ? "" : t.hint(wname(w))}>${e(w)}</div>`).join("");
      return tiles ? `<div class="re-cat"><span class="re-k">${cat}</span><div class="re-guns">${tiles}</div></div>` : ""; }).join("");
    const knifeN = t.count("Progressive Knife x1");
    const gear = [
      ...["Kitchen Knife x1", "Boot Knife x1"],
      ...D.attachments, "Body Armor x1", ...D.recipes, ...D.charms, "Exclusive Upgrade Ticket x1",
    ].filter(n => t.itemNames.includes(n)).map(n => `<div class="re-gear${t.has(n) ? " on" : ""}"${t.hint(n)}>${e(short(n))}</div>`).join("");

    // ---- mercenaries
    const merc = sd.mercenaries?.enabled ? (() => {
      const ranks = sd.mercenaries.ranks || ["C", "B", "A"], start = [sd.mercenaries.starting_character, sd.mercenaries.starting_stage];
      const has = n => t.has(n) || start.includes(n);
      const stageOn = MERC_STAGES.map(s => has("Mercenaries Stage: " + s));
      const head = `<div></div>${MERC_STAGES.map((s, i) => `<div class="re-mh${stageOn[i] ? " on" : ""}"${stageOn[i] ? "" : t.hint("Mercenaries Stage: " + s)}>${e(s)}</div>`).join("")}`;
      const rows = MERC_CHARS.map(c => { const on = has("Mercenaries Character: " + c);
        return `<div class="re-mc${on ? " on" : ""}"${on ? "" : t.hint("Mercenaries Character: " + c)}>${e(c)}</div>` + MERC_STAGES.map((s, i) =>
          `<div class="re-mcell${on && stageOn[i] ? " open" : ""}">${ranks.map(r => { const n = `Mercenaries - ${c} - ${s} - Rank ${r}`;
            return all.includes(n) ? `<span class="${done.has(n) ? "on" : ""}">${e(r)}</span>` : ""; }).join("")}</div>`).join(""); }).join("");
      return `<div class="re-merc">${head}${rows}</div>`; })() : "";

    const sec2 = (title, body, note = "") => body ? `<section class="re-sec"><div class="re-shead"><h3>${title}</h3>${note ? `<span class="re-dim">${note}</span>` : ""}</div>${body}</section>` : "";
    const storyLeft = Object.values(ch).reduce((a, x) => a + x.open, 0);
    return `<div class="re">
      <div class="re-top">
        <div><span class="re-k">Agent</span><b class="re-name">${e(t.name)}</b><span class="re-dim">${e((sd.difficulty || "standard").replace(/^./, c => c.toUpperCase()))} · ${t.goal ? "Mission complete" : "Goal: finish Chapter 16"}</span></div>
        <div class="re-stats">
          <div><span class="re-k">Chapter</span><b>${reachedCh}</b><small>${R.blockAt === Infinity ? "Whole route open" : "furthest reachable"}</small></div>
          <div><span class="re-k">In logic</span><b>${storyLeft}</b><small>checks you can do now</small></div>
          <div><span class="re-k">Key items</span><b>${D.keyItems.filter(n => t.has(n)).length}/${D.keyItems.filter(n => t.itemNames.includes(n)).length}</b><small>${smallKeys != null ? `${smallKeys} small key${smallKeys === 1 ? "" : "s"}` : ""}</small></div>
          ${sd.trade_shop?.enabled ? `<div><span class="re-k">Spinel</span><b>${spinel}</b><small>for trades</small></div>` : ""}
        </div>
        ${R.blockAt !== Infinity ? `<div class="re-block"${t.hint(R.blockNeeds, "Next door")}><span class="re-k">Next locked door</span><b>Ch ${D.order[R.blockAt][0]} · ${e(D.order[R.blockAt][1])}</b><span>needs ${e(R.blockNeeds.map(short).join(" + "))}</span></div>` : ""}
      </div>
      ${sec2("Chapters", chapters, "🔒 marks a door and the key items it needs" + (t.isMine ? " · click one for a hint" : ""))}
      ${sec2("Key items", keys && `<div class="re-keys">${keys}</div>`, "Where each one is first needed")}
      ${sec2("Attaché case", `<div class="re-case" style="--cw:${cw};--ch:${chh}"><div class="re-caseh"><span>ATTACHÉ CASE</span><b>${e(caseName)}</b>${t.itemNames.includes("Progressive Attache Case x1") ? `<span class="re-lv"${caseN < D.caseTiers.length ? t.hint("Progressive Attache Case x1", "Bigger case") : ""}>${caseN}/${D.caseTiers.length} upgrades</span>` : ""}</div>
          <div class="re-cat"><span class="re-k">Starting</span><div class="re-guns"><div class="re-gun on">SG-09 R</div><div class="re-gun on"${knifeN < D.knifeTiers.length && t.itemNames.includes("Progressive Knife x1") ? t.hint("Progressive Knife x1", "Better knife") : ""}>${knifeN ? e(D.knifeTiers[Math.min(knifeN, D.knifeTiers.length) - 1]) : "Combat Knife"}</div></div></div>
          ${weapons}</div>
        ${gear ? `<div class="re-gears">${gear}</div>` : ""}`, "Weapons and gear received")}
      ${sec2("The Mercenaries", merc, "Unlock a character and a stage to play it · lit letters are ranks reached")}
    </div>`;
  }

  APTracker.register({
    game: "Resident Evil 4 Remake",
    slotData: true,
    async init(api){ D = await api.json("data/re4r.json");
      D.order.forEach(([c, s], i) => { IDX[c + "|" + s] = i; CH_FIRST[c] ??= i; (CH_SECTIONS[c] ||= []).push(s); }); },
    tabs: [{ id:"mission", label:"Mission", render:panel }],
    checksLabel: "Checks by area",
    locationGroup(n){ const p = parse(n);
      return p.kind === "story" ? `Chapter ${p.ch} · ${p.sec}` : p.kind === "shop" ? `Merchant · Chapter ${p.ch}` : p.kind === "trade" ? `Spinel trades · Chapter ${p.ch}` : p.kind === "merc" ? `Mercenaries · ${p.who}` : "Other"; },
    groupOrder(g){ let m = /^Chapter (\d+) · (.+)$/.exec(g); if(m) return IDX[m[1] + "|" + m[2]] ?? 500;
      m = /^(Merchant|Spinel trades) · Chapter (\d+)$/.exec(g); if(m) return 1000 + +m[2] * 2 + (m[1] === "Merchant" ? 0 : 1);
      m = /^Mercenaries · (.+)$/.exec(g); if(m) return 2000 + MERC_CHARS.indexOf(m[1]); return 9999; },
    card(t){ const R = route(t); const k = D.keyItems.filter(n => t.has(n)).length;
      return R.blockAt === Infinity ? `All doors open · ${k} key items` : `Up to Ch ${D.order[Math.max(0, R.blockAt - 1)][0]} · ${k} key items`; }
  });
})();
