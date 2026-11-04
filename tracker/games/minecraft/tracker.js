/* Minecraft tracker: goal (egg shards, advancements, bosses), gear tiers, recipes, compasses,
   books and resources, drawn as original 16x16 pixel icons (no game textures). Advancement
   regions come from data/advancements.json (from the Minecraft Archipelago world, MIT licence). */
(() => {
  /* original 16×16 pixel icons; K = outline, other letters map to each icon's palette */
  const K0="#1d1a1c";
  const TIER={wood:{H:"#9b6b38",h:"#c4955a",d:"#6b4520"},stone:{H:"#8c8c8c",h:"#b8b8b8",d:"#5c5c5c"},iron:{H:"#cfcfcf",h:"#f4f4f4",d:"#8e8e8e"},gold:{H:"#e8c33a",h:"#fbe98a",d:"#a8831a"},diamond:{H:"#3fc9c3",h:"#a8f5f0",d:"#1f7f7b"},netherite:{H:"#4d4246",h:"#7a6c70",d:"#2e2629"}};
  const WOOD={W:"#8a5a2b",w:"#5c3a1a"};
  const SHAPES={
  pick:["","...KKKKKKKKK","..KhhhhhhhhHK",".KhHHHHHHHHHdK",".KdK...KWK..KdK",".KK...KWwK...KK","......KWwK",".....KWwK",".....KWwK","....KWwK","....KWwK","...KWwK","...KWwK","..KWwK","..KKK"],
  sword:["............KKK","...........KhHK","..........KhHdK",".........KhHdK","........KhHdK",".......KhHdK","..KK..KhHdK","..KGKKhHdK","...KGKHdK","....KGKK","...KWwKGK","..KWwK.KGK",".KWwK...KK","KWwK","KKK"],
  chest:["","..KKKK....KKKK",".KhHHdK..KhHHdK",".KhHHHdKKdHHHdK",".KhHHHHHHHHHHdK","..KKhHHHHHHdKK","...KhHHHHHHdK","...KhHHHHHHdK","...KhHHHHHHdK","...KhHHHHHHdK","...KhHHHHHHdK","...KddddddddK","...KKKKKKKKKK"],
  ingot:["","","","",".....KKKKKKKK","....KhhhhhhHK","...KhHHHHHHdK","..KKKKKKKKKdK","..KhHHHHHHKdK","..KHHHHHHHKK","..KddddddK","..KKKKKKKK"],
  block:["","..KKKKKKKKKKKK","..KhhhhhhhhhHK","..KhHHHHHHHHdK","..KhHdHHHHdHdK","..KhHHHHHHHHdK","..KhHHHHHHHHdK","..KhHHHHHHHHdK","..KhHdHHHHdHdK","..KhHHHHHHHHdK","..KHdddddddddK","..KKKKKKKKKKKK"],
  bow:["......KKK",".....KWwK.S","....KWK...S","...KWK.....S","...KWK.....S","..KWK......S","..KhK......S","..KhK......S","..KWK......S","..KWK......S","...KWK.....S","...KWK.....S","....KWK...S",".....KWwK.S","......KKK"],
  shield:["","..KKKKKKKKKKKK","..KWWWWhhWWWWK","..KWwwWhhWwwWK","..KWwwWhhWwwWK","..KhhhhhhhhhhK","..KhhhhhhhhhhK","..KWwwWhhWwwWK","..KWwwWhhWwwWK","...KWwWhhWwWK","....KWWhhWWK",".....KWhhWK","......KhhK",".......KK"],
  bucket:["",".....KKKKKK","....K......K","...K........K","..KKKKKKKKKKKK","..KhHHHHHHHHdK","..KKddddddddKK","...KhHHHHHHdK","...KhHHHHHHdK","...KhHHHHHHdK","....KhHHHHdK","....KhHHHHdK","....KKKKKKKK"],
  bottle:["","......KKKK","......KccK","......KKKK",".......KgK",".......KgK","......KgggK",".....KgGGGgK","....KgGGGGGgK","....KgGGGGGgK","....KgGGGGGgK","....KgGGGGGgK",".....KgGGGgK","......KKKKK"],
  book:["","...KKKKKKKKK","..KPPPPPPPPpK","..KPppppppppK","..KPpYYYYYYpK","..KPpYppppYpK","..KPpYYYYYYpK","..KPppppppppK","..KPppppSpppK","..KPpppSSSppK","..KPppppSpppK","..KPPPPPPPPPK","..KccccccccccK","...KKKKKKKKKK"],
  bed:["","","","","..KK","..KwK","..KwKKKKKKKKKKK","..KwKpppRRRRRRRK","..KwKpppRRRRRRRK","..KwKKKKKKKKKKKK","..KwWWWWWWWWWWwK","..KwKKKKKKKKKKwK","..KK..........KK"],
  rod:["...........KK","..........KWK",".........KWKS","........KWK.S",".......KWK..S","......KWK...S",".....KWK....S","....KWK.....S","...KWK......S","..KWK......KRK",".KWK.......KRK","KWK.........K","KK"],
  flint:["","..KKKKK",".KhHHHdK","KhK...KdK","KhK...KdK","KhK...KdK",".KdK.KdK","..KK.KK....KKK","..........KfFK",".........KfFFK","........KfFFdK",".......KfFFdK","......KfFddK","......KKKKK"],
  fire:["","......o",".....oOo","....oOYOo","...oOYYYOo","...oOYYYOo","....oOYOo",".KKKKKKKKKKKKK",".KWwWwWwWwWwWK",".KKKKKKKKKKKKK","..KwWWWWWWWWK",".KKKKKKKKKKKKK",".KWwWwWwWwWwWK",".KKKKKKKKKKKKK"],
  saddle:["","","","....KKKKKKKK","...KWWWWWWWWK","..KWwwwwwwwWK",".KWwwwwwwwwwWK",".KWwwwwwwwwwWK",".KKKKWwwwWKKKK","....KKhKKKK","....KhhK","....KhK","....KK"],
  spyglass:["..........KKKK",".........KYYgK","........KYYYYK",".......KYYYdK","......KyyydK",".....KyyydK","....KyyydK","...KYYYdK","..KYYYdK",".KYYdK",".KKKK"],
  lead:["",".....KKKKK","...KKrrrrrKK","..KrrKKKKKrrK",".KrK.KKKK.KrK",".KrK.KrrK.KrK",".KrK..KK..KrK","..KrK....KrK","...KrrKKrrK",".....KrrK","......KrK","......KrK","......KK"],
  brush:["............KK","...........KWK","..........KWK",".........KWK","........KWK",".......KWK","......KhK",".....KhhK","...KKYYK","..KYYYYK",".KYYYYK",".KYYYK",".KKKK"],
  shulker:["",".KKKKKKKKKKKKK",".KPPPPPPPPPPpK",".KPppppppppppK",".KPpPPPPPPPPpK",".KKKKKKKKKKKKK",".KPpYYYYYYYYpK",".KPppppppppppK",".KPppppppppppK",".KPppppppppppK",".KPppppppppppK",".KPPPPPPPPPPPK",".KKKKKKKKKKKKK"],
  compass:["","....KKKKKK","...KhhhhhhK","..KhGGGGGGhK",".KhGGGGRGGGhK",".KhGGGGRRGGhK",".KhGGGRRRGGhK",".KhGGGWWWGGhK",".KhGGWWGGGGhK",".KhGGWGGGGGhK","..KhGGGGGGhK","...KhhhhhhK","....KKKKKK"],
  egg:["","......KKKK",".....KpPPpK","....KpPmPPpK","...KpPPPPmPpK","...KPmPPPPPpK","..KpPPPPmPPPpK","..KpPPmPPPPPpK","..KpPPPPPPmPpK","..KpPmPPPPPPpK","...KpPPPmPPpK","....KpPPPPpK",".....KKKKKK"],
  gem:["","......KKKK",".....KhhHHK","....KhHHHHdK","...KhHHHHHHdK","...KhHHHHHHdK","...KHHHHHHHdK","....KHHHHHdK",".....KHHHdK","......KdK",".......K"],
  ore:["","..KKKKKKKKKKKK","..KsssssssssSK","..KsOOssssssSK","..KsOoSssOOsSK","..KssssssOosSK","..KsssOOsssssK","..KsssOossssSK","..KsSsssssOOSK","..KsOOsssssoSK","..KsOosSssssSK","..KSSSSSSSSSSK","..KKKKKKKKKKKK"],
  orb:["","","","......KKKK",".....KhhHHK","....KhHHHHdK","....KHHHHHdK","....KHHHHddK",".....KHdddK","......KKKK"],
  arrow:["............KK","...........KhK","..........KhK",".........KWK","........KWK",".......KWK","......KWK",".....KWK","..KFKWK","..KFWK",".KFFK","KFFK","KK"],
  meat:["","","....KKKKKK","...KRRRRrRK","..KRRpRRRRrK","..KRRRRRRRRrK","..KRRRRRpRRRrK","...KRRRRRRRrrK","....KKRRRRrrK","......KKrrrK","........KKK"],
  bee:["","","......hh.hh",".....hWWhWWh","..KKKKKKKKKK",".KYYKKYYKKYK",".KYYKKYYKKYK",".KYYKKYYKKYK","..KKKKKKKKKK","...K.K..K.K"]
  };
  const PAL={
  bow:{...WOOD,h:"#d9d2c0",S:"#e8e8e8"},shield:{...WOOD,h:"#c9c9c9"},bucket:TIER.iron,bottle:{c:"#8a5a2b",g:"#e9f6ff",G:"#cde7f5"},potion:{c:"#8a5a2b",g:"#f2d9ff",G:"#c04ee0"},
  book:{P:"#6b2fa0",p:"#4a1d73",Y:"#e8c33a",S:"#ff9cf6",c:"#efe4c8"},bed:{w:"#6b4520",W:"#9b6b38",p:"#f2f2f2",R:"#c8322f"},rod:{...WOOD,S:"#e8e8e8",R:"#d93030"},
  flint:{...TIER.iron,f:"#6a6a6a",F:"#4a4a4a"},fire:{...WOOD,o:"#c8322f",O:"#f08a24",Y:"#ffd84a"},saddle:{...WOOD,h:"#bdbdbd"},spyglass:{Y:"#d08a4a",y:"#9c5d2b",d:"#6e3d18",g:"#bfe8ff"},
  lead:{r:"#c9a46a"},brush:{...WOOD,h:"#d08a4a",Y:"#e6d3a3"},shulker:{P:"#9b5fc0",p:"#6c3a8c",Y:"#c7a2e0"},compass:{h:"#cfcfcf",G:"#4f4f4f",R:"#d93030",W:"#e8e8e8"},
  egg:{P:"#3b1a4a",p:"#1a0d22",m:"#a259c4"},emerald:{H:"#35c46a",h:"#9cf2bd",d:"#18803e"},lapis:{H:"#2f5fd0",h:"#88a8ff",d:"#1b3a8a"},scrap:{H:"#6b5048",h:"#9a7a6e",d:"#3e2c27"},diamondg:TIER.diamond,
  oreDiamond:{s:"#8f8f8f",S:"#6a6a6a",O:"#5fe8e0",o:"#2a9e98"},oreIron:{s:"#8f8f8f",S:"#6a6a6a",O:"#e0c0a0",o:"#a5825f"},oreGold:{s:"#8f8f8f",S:"#6a6a6a",O:"#fcd34d",o:"#c8961a"},
  pearl:{H:"#1f8a7a",h:"#7fe0cc",d:"#0d4a40"},xp:{H:"#9be23a",h:"#e6ff9c",d:"#4c8a10"},arrow:{...WOOD,h:"#cfcfcf",F:"#f2f2f2"},meat:{R:"#e8838a",p:"#ffd3d6",r:"#b24a54"},flesh:{R:"#8a6a3a",p:"#a99a5a",r:"#5a4a24"},
  bee:{Y:"#f2c230",W:"#e8f4ff",h:"#b8d6ee"}
  };

  function icon(shape, pal){
    const key = shape + JSON.stringify(pal); if(cache.has(key)) return cache.get(key);
    const P = { K:K0, ...pal }; let r = "";
    (SHAPES[shape] || []).forEach((row, y) => { let x = 0; while(x < row.length){ const ch = row[x]; if(ch === "." || !P[ch]){ x++; continue; } let w = 1; while(row[x + w] === ch) w++; r += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${P[ch]}"/>`; x += w; } });
    const uri = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${r}</svg>`);
    cache.set(key, uri); return uri;
  }
  const cache = new Map();
  const img = (shape, pal, alt) => `<img src="${icon(shape, pal)}" alt="${alt ? APTracker.esc(alt) : ""}" width="32" height="32">`;

  const LADDERS = [
    { item:"Progressive Tools", label:"Tools", tiers:[["Stone","pick",{...TIER.stone,...WOOD}],["Iron","pick",{...TIER.iron,...WOOD}],["Diamond","pick",{...TIER.diamond,...WOOD}]] },
    { item:"Progressive Weapons", label:"Weapons", tiers:[["Stone","sword",{...TIER.stone,...WOOD,G:"#6b4520"}],["Iron","sword",{...TIER.iron,...WOOD,G:"#8e8e8e"}],["Diamond","sword",{...TIER.diamond,...WOOD,G:"#e8c33a"}]] },
    { item:"Progressive Armor", label:"Armor", tiers:[["Iron","chest",TIER.iron],["Diamond","chest",TIER.diamond]] },
    { item:"Progressive Resource Crafting", label:"Resource crafting", tiers:[["Ingots from nuggets","ingot",TIER.iron],["Storage blocks","block",TIER.gold]] }
  ];
  const UNLOCKS = [
    [/^archery/i,"bow","bow","Archery"],[/^shields?$/i,"shield","shield","Shield"],[/^buckets?$/i,"bucket","bucket","Bucket"],[/flint/i,"flint","flint","Flint and Steel"],
    [/^beds?$/i,"bed","bed","Bed"],[/^bottles?$/i,"bottle","bottle","Bottles"],[/^brewing/i,"bottle","potion","Brewing"],[/^enchanting$/i,"book","book","Enchanting"],
    [/fishing/i,"rod","rod","Fishing Rod"],[/^campfires?$/i,"fire","fire","Campfire"],[/^saddles?$/i,"saddle","saddle","Saddle"],[/^spyglass/i,"spyglass","spyglass","Spyglass"],
    [/^leads?$/i,"lead","lead","Lead"],[/^brush/i,"brush","brush","Brush"],[/shulker/i,"shulker","shulker","Shulker Box"]
  ];
  const RES = [
    [/emerald/i,"gem","emerald","Emeralds"],[/diamond ore/i,"ore","oreDiamond","Diamond Ore"],[/iron ore/i,"ore","oreIron","Iron Ore"],[/gold ore/i,"ore","oreGold","Gold Ore"],
    [/netherite/i,"gem","scrap","Netherite Scrap"],[/lapis/i,"gem","lapis","Lapis Lazuli"],[/ender pearl/i,"orb","pearl","Ender Pearls"],[/arrow/i,"arrow","arrow","Arrows"],
    [/porkchop/i,"meat","meat","Porkchops"],[/rotten flesh/i,"meat","flesh","Rotten Flesh"],[/\bxp\b/i,"orb","xp","Experience"]
  ];
  const ORDER = ["Overworld","Village","Pillager Outpost","The Nether","Nether Fortress","Bastion Remnant","The End","End City","Other advancements"];
  let REGION = {};

  function stackTotal(t, re){ let total = 0; for(const it of t.items) if(re.test(it.name)){ const m = /^(\d+)\s/.exec(it.name); total += m ? +m[1] : 1; } return total; }

  function panel(t){
    const e = t.esc, sd = t.slotData || {}, pool = t.itemNames;
    const cell = (inner, { on = true, label = "", count = 0, hint = null, title = "" } = {}) =>
      `<div class="mc-cell"><div class="mc-slot${on ? "" : " off"}"${hint ? t.hint(hint, label) : ""} title="${e(title || label)}">${inner}${count > 1 ? `<span class="mc-n">${count > 999 ? "999+" : count}</span>` : ""}</div>${label ? `<span class="mc-l">${e(label)}</span>` : ""}</div>`;

    // goal
    const shards = t.count("Dragon Egg Shard"), need = sd.egg_shards_required, avail = sd.egg_shards_available;
    const adv = t.checked.length, advGoal = sd.advancement_goal;
    const bosses = { ender_dragon:["Ender Dragon"], wither:["Wither"], both:["Ender Dragon", "Wither"], none:[] }[sd.required_bosses];
    const eggN = Math.max(avail || 0, need || 0, shards);
    const eggs = eggN ? Array.from({ length:eggN }, (_, i) => `<img class="mc-egg${i < shards ? "" : " off"}${need && i === need - 1 ? " goal" : ""}" src="${icon("egg", PAL.egg)}" alt="" width="24" height="24">`).join("") : "";
    const goal = `<div class="mc-goal">
      <div class="mc-box"${t.hint("Dragon Egg Shard", "Dragon egg shards")}><span class="mc-k">Dragon egg shards</span><span class="mc-big">${shards}${need ? ` / ${need}` : ""}</span>${eggs ? `<div class="mc-eggs">${eggs}</div>` : '<span class="mc-dim">None needed for this goal</span>'}</div>
      <div class="mc-box"><span class="mc-k">Advancements</span><span class="mc-big">${adv}${advGoal ? ` / ${advGoal}` : ""}</span><div class="mc-xp"><i style="width:${advGoal ? Math.min(100, adv / advGoal * 100) : 0}%"></i></div>${advGoal ? `<span class="mc-dim">${adv >= advGoal ? "Advancement goal reached" : `${advGoal - adv} more for the goal`}</span>` : ""}</div>
      <div class="mc-box"><span class="mc-k">Bosses to defeat</span>${bosses ? (bosses.length ? bosses.map(b => `<span class="mc-boss">${b}</span>`).join("") : '<span class="mc-dim">No boss required</span>') : '<span class="mc-dim">Not shared by this slot</span>'}</div>
    </div>`;

    const ladders = LADDERS.filter(L => pool.includes(L.item)).map(L => { const n = t.count(L.item);
      return `<div class="mc-ladder"><span class="mc-k">${L.label}</span><div class="mc-row">${L.tiers.map(([tn, sh, pal], i) => cell(img(sh, pal, tn), { on:i < n, label:tn, hint:L.item, title:`${L.label}: ${tn} ${i < n ? "unlocked" : "locked"}` })).join('<span class="mc-arrow" aria-hidden="true">›</span>')}</div></div>`; }).join("");
    const unlocks = UNLOCKS.map(([re, sh, pal, label]) => { const nm = pool.find(n => re.test(n)); if(!nm) return ""; const on = t.has(nm);
      return cell(img(sh, PAL[pal], label), { on, label, hint:nm, title:`${label}: ${on ? "unlocked" : "locked"}` }); }).join("");
    const comps = pool.filter(n => /compass/i.test(n)).sort().map(n => { const st = (/\(([^)]+)\)/.exec(n) || [])[1] || n.replace(/structure|compass/ig, "").trim() || n; const on = t.has(n);
      return cell(img("compass", PAL.compass, st), { on, label:st, hint:n, title:`${n}: ${on ? "received" : "not yet"}` }); }).join("");
    const books = pool.filter(n => /book$/i.test(n)).sort().map(n => { const on = t.has(n), l = n.replace(/ book$/i, "");
      return cell(img("book", PAL.book, l), { on, label:l, hint:n, title:`${n}: ${on ? "received" : "not yet"}` }); }).join("");
    const res = RES.map(([re, sh, pal, label]) => { if(!pool.some(n => re.test(n))) return ""; const total = stackTotal(t, re);
      return cell(img(sh, PAL[pal], label), { on:total > 0, label, count:total, hint:pool.filter(n => re.test(n)), title:`${label}: ${total} received` }); }).join("");
    const traps = t.count(/trap/i);
    const sec = (title, body, note = "") => body ? `<div class="mc-sec"><div class="mc-h"><h3>${title}</h3>${note ? `<span class="mc-dim">${note}</span>` : ""}</div>${body}</div>` : "";
    return `<div class="mc">${goal}
      ${sec("Gear tiers", ladders && `<div class="mc-ladders">${ladders}</div>`, t.isMine ? "Click any slot for a hint" : "")}
      ${sec("Recipes unlocked", unlocks && `<div class="mc-grid">${unlocks}</div>`)}
      ${sec("Structure compasses", comps && `<div class="mc-grid">${comps}</div>`)}
      ${sec("Enchanted books", books && `<div class="mc-grid">${books}</div>`)}
      ${sec("Resources received", res && `<div class="mc-grid">${res}</div>`, traps ? `<img src="${icon("bee", PAL.bee)}" alt="" width="18" height="18" style="vertical-align:-3px;image-rendering:pixelated"> ${traps} trap${traps > 1 ? "s" : ""} received` : "")}
    </div>`;
  }

  APTracker.register({
    game: "Minecraft",
    slotData: true,
    async init(api){
      const regions = await api.json("data/advancements.json");
      for(const [r, names] of Object.entries(regions)) for(const n of names) REGION[n] = r;
    },
    tabs: [{ id:"progress", label:"Progress", render:panel }],
    checksLabel: "Advancements",
    locationGroup: n => REGION[n] || "Other advancements",
    groupOrder: ORDER,
    card(t){
      const sd = t.slotData || {}, parts = [];
      if(sd.egg_shards_required) parts.push(`Egg shards ${t.count("Dragon Egg Shard")}/${sd.egg_shards_required}`);
      if(sd.advancement_goal) parts.push(`Advancements ${t.checked.length}/${sd.advancement_goal}`);
      parts.push(`Tools: ${["none","Stone","Iron","Diamond"][Math.min(3, t.count("Progressive Tools"))]}`);
      return parts.join(" · ");
    }
  });
})();
