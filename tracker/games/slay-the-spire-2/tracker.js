/* Slay the Spire II tracker (dlueben1/Slay-the-Spire-2-Archipelago, game "Slay the Spire II").
   A star chart of the Spire for every character in the seed, drawn in gold on night blue: each of the three acts climbs
   from the hallway fights past the merchant, the elites and the late rooms to the boss, with the act's Ancient waiting
   at its start. Cleared rooms get a gold seal, rooms with checks you can do right now burn like embers. A second tab
   lays out each character's unlocks: card rewards, relics, Ancients, starter upgrades, campfire, shop, gold, potions.
   What's in logic comes from Archipelago itself: the relay rebuilds the player's world from slot data (relay/ap_logic.py),
   so "ready now" is exact. Data: data/sts2.json (which part of an act each check belongs to, read from the world's
   regions). Icons are drawn for this tracker. */
(() => {
  const esc = APTracker.esc;
  // animations restart whenever the page re-renders (every new check or item): start each at the phase the clock says
  // it's in, so a re-render carries on smoothly instead of jumping back to the first frame
  const NOW = () => (Date.now() / 1000 % 86400).toFixed(2);
  let D = null;

  /* ---------- icons (original, 24×24) ---------- */
  const P = {
    monster:"M12 3c-5 0-8 3.5-8 8 0 3 1.4 5 3 6v4h3v-2h4v2h3v-4c1.6-1 3-3 3-6 0-4.5-3-8-8-8zM9 10.2a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zm6 0a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4z",
    elite:"M3.5 2.5l3.6 5.6C5.5 9.4 4.5 11.2 4.5 13.3c0 4.3 3.4 8.2 7.5 8.2s7.5-3.9 7.5-8.2c0-2.1-1-3.9-2.6-5.2l3.6-5.6-5.3 3.4c-1-.5-2.1-.8-3.2-.8s-2.2.3-3.2.8zM9 12.2l2 1.6-2.6.9zm6 0l.6 2.5-2.6-.9z",
    merchant:"M9 2.5h6l-1.6 3.3c3.6 1.4 6.1 5 6.1 9 0 4.2-3.5 6.7-7.5 6.7s-7.5-2.5-7.5-6.7c0-4 2.5-7.6 6.1-9zM11 10v1.3c-1.3.3-2 1.1-2 2.1 0 2.4 4 1.6 4 2.9 0 .5-.5.8-1.1.8-.7 0-1.3-.3-1.8-.8l-1 1.2c.5.5 1.2.9 1.9 1V20h1.6v-1.5c1.4-.3 2.2-1.2 2.2-2.2 0-2.5-4-1.8-4-2.9 0-.4.4-.7 1-.7.6 0 1.1.2 1.5.6l1-1.2c-.5-.5-1.1-.8-1.7-.9V10z",
    treasure:"M3 10.5A5.5 5.5 0 0 1 8.5 5h7a5.5 5.5 0 0 1 5.5 5.5v1H3zM3 13h18v8H3zm7.5-1v4h3v-4z",
    boss:"M2.5 7.5l4.5 3.3L12 4l5 6.8 4.5-3.3-2.2 11.5H4.7zM5 20.3h14V22H5z",
    heart:"M12 21.5s-8.5-5.6-8.5-11.4A4.7 4.7 0 0 1 12 7.3a4.7 4.7 0 0 1 8.5 2.8c0 5.8-8.5 11.4-8.5 11.4z",
    card:"M7 2.5h10A1.5 1.5 0 0 1 18.5 4v16a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V4A1.5 1.5 0 0 1 7 2.5zm1.5 3v6h7v-6z",
    rare:"M7 2.5h10A1.5 1.5 0 0 1 18.5 4v16a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V4A1.5 1.5 0 0 1 7 2.5zM12 6l1.5 3 3.2.4-2.3 2.2.6 3.2L12 13.3l-3 1.5.6-3.2-2.3-2.2 3.2-.4z",
    relic:"M12 2.5l7.5 4.3v10.4L12 21.5l-7.5-4.3V6.8zm0 4.2l-3.8 2.2v4.2l3.8 2.2 3.8-2.2V8.9z",
    bossrelic:"M12 1.5l3 5 5.5-1.5-1.5 5.5 5 3-5 3 1.5 5.5-5.5-1.5-3 5-3-5-5.5 1.5 1.5-5.5-5-3 5-3-1.5-5.5 5.5 1.5zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
    potion:"M9.5 2.5h5V4h-.8v3.3c3.2 1 5.3 3.7 5.3 7.2a7 7 0 0 1-14 0c0-3.5 2.1-6.2 5.3-7.2V4h-.8z",
    gold:"M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zm0 4a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z",
    key:"M7.5 6a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2.7a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM11.5 9.5h10V13h-2v3h-3v-3h-5z",
    floor:"M2.5 21.5v-4.5h4.5v-4.5h4.5V8h4.5V3.5h5.5v18z",
    fire:"M12 1.5c1.2 3.2 4.3 4.6 4.3 8.4a4.3 4.3 0 0 1-8.6 0c0-2 1-3.3 2.1-4.2 0 2 .9 3.1 2 3.1 0-2.3-1.1-4.2.2-7.3zM3.5 17.5l17 3.2V23l-17-3.2zm17 0v2.3L3.5 23v-2.3z",
    smith:"M3 5.5h11.5l3 3H21v3h-5.2L13.5 14v3h3.5v3.5H5.5V17H9v-3L3 9z",
    remove:"M7 2.5h10A1.5 1.5 0 0 1 18.5 4v16a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V4A1.5 1.5 0 0 1 7 2.5zm1.6 6.3l2.2 2.2-2.2 2.2 1.2 1.2 2.2-2.2 2.2 2.2 1.2-1.2-2.2-2.2 2.2-2.2-1.2-1.2L12 9.8 9.8 7.6z",
    start:"M5 2.5h2v19H5zM8.5 3.5H20l-3.2 4.3L20 12H8.5z",
    ascend:"M12 2.5l8 8h-5v11H9v-11H4z",
    ancient:"M12 1.5l1.6 3.6 3.9-1.2-1.2 3.9 3.6 1.6-3.6 1.6 1.2 3.9-3.9-1.2L12 17.3l-1.6-3.6-3.9 1.2 1.2-3.9-3.6-1.6 3.6-1.6-1.2-3.9 3.9 1.2zM12 7a2.6 2.6 0 1 0 0 5.2A2.6 2.6 0 0 0 12 7zM5 19.5h14V22H5z",
    lock:"M7 10V7.5a5 5 0 0 1 10 0V10h1.5v11.5h-13V10zm2.5 0h5V7.5a2.5 2.5 0 0 0-5 0z"
  };
  const icon = (k, size, cls) => `<svg class="ss2-i${cls ? " " + cls : ""}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${P[k] || P.card}" fill-rule="evenodd"/></svg>`;

  /* ---------- characters ---------- */
  const LOOK = { Ironclad:["Ironclad", "#d0453a"], Silent:["Silent", "#5fae4f"], Defect:["Defect", "#3d8ad8"], Regent:["Regent", "#e0a62c"], Necrobinder:["Necrobinder", "#9a62d8"] };
  const characters = t => ((t.slotData || {}).characters || []).map(c => {
    const look = LOOK[c.name] || [c.option_name || c.name, "#8a9ab8"];
    return { ...c, prefix:c.name, label:look[0], color:look[1], letter:(look[0] || "?")[0] };
  });

  /* ---------- where a check sits ---------- */
  const KIND = [[/^Reached Floor/, "floor"], [/^Rare Card Reward/, "rare"], [/^Card Reward/, "card"], [/^Boss Relic/, "bossrelic"], [/^Relic/, "relic"],
    [/^Ancient/, "ancient"], [/^Shop Slot/, "merchant"], [/Gold/, "gold"], [/^Potion/, "potion"], [/Campfire/, "fire"], [/Key$/, "key"], [/^Press Start/, "start"]];
  const KIND_LABEL = { floor:"Floors", rare:"Rare card rewards", card:"Card rewards", bossrelic:"Boss relics", relic:"Relics", merchant:"Shop slots", gold:"Gold",
    potion:"Potions", fire:"Campfires", key:"Keys", start:"Press Start", ancient:"Ancients" };
  const kindOf = base => (KIND.find(([re]) => re.test(base)) || [0, "card"])[1];
  function sectionOf(base){
    if(D.loc[base]) return D.loc[base];
    const n = +((base.match(/(\d+)$/) || [])[1] || 0);
    if(/^Reached Floor/.test(base)) return n <= 6 ? "Early Act 1" : n <= 11 ? "Mid Act 1" : n <= 16 ? "Late Act 1" : n <= 17 ? "Act 1 Boss Arena" : n <= 22 ? "Early Act 2"
      : n <= 27 ? "Mid Act 2" : n <= 32 ? "Late Act 2" : n <= 33 ? "Act 2 Boss Arena" : n <= 38 ? "Early Act 3" : n <= 43 ? "Mid Act 3" : n <= 47 ? "Late Act 3" : "Act 3 Boss Arena";
    if(/^Combat Gold/.test(base)) return "Late Act 3";
    const act = (base.match(/Act (\d)/) || [])[1];
    if(act) return `Early Act ${act}`;
    return "Early Act 1";
  }
  const ROOM = { Early:["monster", "Hallway fights"], Shop:["merchant", "Merchant"], Mid:["elite", "Elites"], Late:["treasure", "Treasure & late fights"], Boss:["boss", "Boss"], Act4:["heart", "The Heart"] };
  const roomOf = sec => sec === "Act 4" ? "Act4" : /Shop/.test(sec) ? "Shop" : /Boss/.test(sec) ? "Boss" : sec.split(" ")[0];

  // ascension is a list of named modifiers; the "Disable …" items (Ascension Downs) switch them off one by one
  const ASC = { swarmingelites:"Swarming Elites", wearytraveler:"Weary Traveler", poverty:"Poverty", tightbelt:"Tight Belt", ascendersbane:"Ascender's Bane",
    inflation:"Inflation", scarcity:"Scarcity", toughenemies:"Tough Enemies", deadlyenemies:"Deadly Enemies", doubleboss:"Double Boss" };
  const ascensionList = (c, t) => (Array.isArray(c.ascension) ? c.ascension : []).map(k => { const label = ASC[String(k).toLowerCase()] || String(k);
    return { label, item:`${c.prefix} Disable ${label}`, off:t.has(`${c.prefix} Disable ${label}`) }; });
  const ascensionsOf = (c, t) => ascensionList(c, t).filter(a => !a.off).map(a => a.label);
  const cache = new Map();
  function model(t){
    const key = t.slot + "|" + t.checked.length + "|" + t.items.length + "|" + (t.inLogic ? t.inLogic.size : -1);
    if(cache.has(key)) return cache.get(key);
    const logic = t.inLogic, chars = characters(t);
    const byChar = chars.map(c => {
      const secs = new Map();
      let floor = 0, floors = 0, ready = 0, done = 0, total = 0;
      for(const l of t.locations){
        if(!l.name.startsWith(c.prefix + " ")) continue;
        const base = l.name.slice(c.prefix.length + 1), sec = sectionOf(base), kind = kindOf(base), r = !l.done && !!logic && logic.has(l.id);
        const s = secs.get(sec) || { name:sec, total:0, done:0, ready:0, kinds:new Map() };
        s.total++; total++; if(l.done){ s.done++; done++; } if(r){ s.ready++; ready++; }
        const k = s.kinds.get(kind) || { n:0, done:0, ready:0 }; k.n++; if(l.done) k.done++; if(r) k.ready++; s.kinds.set(kind, k);
        secs.set(sec, s);
        if(kind === "floor"){ floors++; if(l.done) floor = Math.max(floor, +base.match(/\d+$/)[0]); }
      }
      const unlocked = !c.locked || t.has(c.prefix + " Unlock");
      return { c, secs, floor, floors, ready, done, total, unlocked };
    });
    const m = { chars:byChar, haveLogic:!!logic, ready:byChar.reduce((a, x) => a + x.ready, 0), done:t.locations.filter(l => l.done).length, total:t.locations.length };
    cache.set(key, m); if(cache.size > 20) cache.delete(cache.keys().next().value);
    return m;
  }
  const noLogic = t => t.logicNote ? esc(t.logicNote) : `"Ready now" needs exact logic on the server: run <code>tracker update</code> in the console.`;
  const crest = (c, size) => `<span class="ss2-crest" style="--c:${c.color};width:${size}px;height:${size}px;font-size:${Math.round(size * .46)}px"><i>${esc(c.letter)}</i></span>`;

  function hero(t, m){
    const sd = t.slotData || {}, n = m.chars.length, goalN = sd.num_chars_goal || n;
    return `<header class="ss2-hero${t.goal ? " won" : t.logicGoal ? " go" : ""}">
      <div class="ss2-title"><small>Archipelago · Slay the Spire II</small><h2>${t.goal ? "The Spire is conquered" : "Climb the Spire"}</h2>
        <p>${t.goal ? "Goal complete." : `Goal: win with ${goalN === n ? (n === 1 ? "your character" : `all ${n} characters`) : `${goalN} of your ${n} characters`}.`}
        ${!t.goal && t.logicGoal ? ` <b>You have what you need for it.</b>` : ""}</p>
        ${m.haveLogic ? "" : `<p class="ss2-note">${noLogic(t)}</p>`}</div>
      ${m.haveLogic ? `<div class="ss2-big go"><b>${m.ready}</b><span>ready right now</span></div>` : ""}
      <div class="ss2-big"><b>${m.done}<em>/${m.total}</em></b><span>checks done</span></div></header>`;
  }

  /* ---------- the map ---------- */
  function node(t, x, sec, actNo){
    const s = x.secs.get(sec); if(!s) return "";
    const room = roomOf(sec), [ic, label] = ROOM[room], full = s.done === s.total, logic = !!t.inLogic;
    const state = full ? "done" : !x.unlocked ? "lock" : s.ready ? "go" : logic ? "shut" : "";
    const kinds = [...s.kinds].filter(([, k]) => k.done < k.n).map(([kind, k]) =>
      `<span class="${k.ready ? "go" : ""}" title="${esc(KIND_LABEL[kind])}: ${k.n - k.done} left${k.ready ? `, ${k.ready} ready now` : ""}">${icon(kind, 14)}${k.ready ? k.ready : k.n - k.done}</span>`).join("");
    return `<div class="ss2-node ${state}" title="${esc(`Act ${actNo} · ${label}: ${s.done} of ${s.total} done${s.ready ? `, ${s.ready} ready now` : ""}`)}">
      <span class="ss2-room">${icon(ic, room === "Boss" || room === "Act4" ? 34 : 26)}${full ? `<i class="ss2-ring" aria-hidden="true"></i>` : ""}</span>
      <div class="ss2-nodeinfo"><b>${esc(label)}</b><small>${s.ready ? `<em>${s.ready} ready</em> · ` : ""}${s.done}/${s.total}</small>${full ? "" : `<div class="ss2-kinds">${kinds}</div>`}</div></div>`;
  }
  function charMap(t, x){
    const c = x.c, acts = [1, 2, 3].map(a => [a, [`Early Act ${a}`, `Act ${a} Shop`, `Mid Act ${a}`, `Late Act ${a}`, `Act ${a} Boss Arena`]]);
    const ascNames = ascensionsOf(c, t), asc = ascNames.length;
    const pct = x.floors ? Math.round(x.floor / 48 * 100) : Math.round(x.done / Math.max(1, x.total) * 100);
    return `<section class="ss2-sheet" style="--c:${c.color}">
      <header class="ss2-charhead">${crest(c, 46)}<div><h3>${esc(c.label)}</h3>
        <small>${x.unlocked ? (x.floors ? `Highest floor reached: <b>${x.floor}</b>` : "Unlocked") : `Locked: needs <span${t.hint([c.prefix + " Unlock"], c.label + " Unlock")}>${esc(c.label)} Unlock</span>`}${asc ? ` · <span title="${esc(ascNames.join(", "))}">Ascension ${asc}</span>` : ""}</small></div>
        <div class="ss2-charnums">${t.inLogic ? `<span class="${x.ready ? "go" : ""}"><b>${x.ready}</b> ready</span>` : ""}<span><b>${x.done}</b>/${x.total} done</span></div></header>
      <div class="ss2-climb" aria-hidden="true"><i style="height:${pct}%"></i></div>
      <div class="ss2-acts">${acts.map(([a, secs]) => {
        const here = secs.map(s => x.secs.get(s)).filter(Boolean), title = `Act ${a === 4 ? "4" : ["", "I", "II", "III"][a]}`;
        if(!here.length) return "";
        if(here.every(s => s.done === s.total))   // a cleared act folds into one stamp
          return `<div class="ss2-act cleared${a === 4 ? " four" : ""}"><h4>${title}</h4><div class="ss2-stamp"><span class="ss2-room">${icon(a === 4 ? "heart" : "boss", 26)}<i class="ss2-ring" aria-hidden="true"></i></span><b>Cleared</b><small>${here.reduce((n, s) => n + s.total, 0)} checks</small></div></div>`;
        return `<div class="ss2-act${a === 4 ? " four" : ""}"><h4>${title}</h4><div class="ss2-path">${secs.map(s => node(t, x, s, a)).join("")}</div></div>`; }).join("")}</div>
    </section>`;
  }
  function renderMap(t){
    const m = model(t);
    if(!m.chars.length) return `<div class="ss2" style="--now:${NOW()}"><p class="ss2-note">No character settings in this seed's slot data.</p></div>`;
    return `<div class="ss2" style="--now:${NOW()}">${hero(t, m)}${m.chars.map(x => charMap(t, x)).join("")}
      <p class="ss2-legend"><span>${icon("monster", 16)} rooms climb from the bottom of each act to its boss</span><span class="go">burning: checks you can do right now</span><span class="done">gold seal: all done</span></p></div>`;
  }

  /* ---------- the deck: what each character has ---------- */
  function renderDeck(t){
    const m = model(t), sd = t.slotData || {}, shop = sd.shop_sanity_options || {};
    const shopTotal = (shop.card_slots || 0) + (shop.neutral_slots || 0) + (shop.relic_slots || 0) + (shop.potion_slots || 0);
    let html = `<div class="ss2" style="--now:${NOW()}">${hero(t, m)}<div class="ss2-decks">`;
    for(const x of m.chars){
      const c = x.c, p = c.prefix, n = s => t.count(`${p} ${s}`);
      const has = name => t.itemNames.includes(`${p} ${name}`), bags = n("Combat Gold") + n("Elite Gold") + n("Boss Gold");
      const tile = (ic, label, have, max, item, show = true) => !show ? "" : `<div class="ss2-tile${have ? " on" : ""}${max && have >= max ? " full" : ""}"${have < (max || 1) && item ? t.hint([`${p} ${item}`], `${c.label} ${label}`) : ""}>
        ${icon(ic, 26)}<b>${have}${max ? `<em>/${max}</em>` : ""}</b><span>${esc(label)}</span>${max ? `<i class="ss2-pips">${Array.from({ length:Math.min(max, 13) }, (_, i) => `<u class="${i < have ? "on" : ""}"></u>`).join("")}</i>` : ""}</div>`;
      html += `<section class="ss2-deck" style="--c:${c.color}"><header>${crest(c, 40)}<div><h3>${esc(c.label)}</h3><small>${x.unlocked ? "Unlocked" : "Locked"}${ascensionsOf(c, t).length ? ` · Ascension ${ascensionsOf(c, t).length}` : ""}</small></div>
          ${x.unlocked ? "" : `<span class="ss2-locked"${t.hint([p + " Unlock"], c.label + " Unlock")}>${icon("lock", 16)} needs Unlock</span>`}</header>
        ${ascensionList(c, t).length ? `<div class="ss2-asc"><span>Ascension</span>${ascensionList(c, t).map(a => `<i class="${a.off ? "off" : ""}"${a.off || !t.itemNames.includes(a.item) ? "" : t.hint([a.item], a.item)} title="${esc(a.off ? a.label + ": disabled" : a.label)}">${esc(a.label)}</i>`).join("")}</div>` : ""}
        <div class="ss2-tiles">
          ${tile("card", "Card rewards", n("Card Reward"), 10, "Card Reward")}
          ${tile("rare", "Rare card rewards", n("Rare Card Reward"), 2, "Rare Card Reward")}
          ${tile("relic", "Relics", n("Relic"), 10, "Relic")}
          ${tile("ancient", "Ancients", n("Progressive Ancient"), 3, "Progressive Ancient", has("Progressive Ancient"))}
          ${tile("start", "Starter card", n("Progressive Starter Card"), 2, "Progressive Starter Card", has("Progressive Starter Card") && !!sd.progressive_starter_card)}
          ${tile("bossrelic", "Starter relic", n("Progressive Starter Relic"), 2, "Progressive Starter Relic", has("Progressive Starter Relic") && !!sd.progressive_starter_relic)}
          ${tile("fire", "Rest", n("Progressive Rest"), 3, "Progressive Rest", !!sd.campfire_sanity)}
          ${tile("smith", "Smith", n("Progressive Smith"), 3, "Progressive Smith", !!sd.campfire_sanity)}
          ${tile("merchant", "Shop slots", n("Shop Card Slot") + n("Neutral Shop Card Slot") + n("Shop Relic Slot") + n("Shop Potion Slot"), shopTotal, "Shop Card Slot", !!sd.shop_sanity && shopTotal > 0)}
          ${tile("remove", "Card removes", n("Progressive Shop Remove"), 3, "Progressive Shop Remove", !!sd.shop_sanity && !!shop.card_remove)}
          ${tile("potion", "Potions", n("Potion"), 9, null, !!sd.potion_sanity)}
          ${tile("gold", "Gold pouches", bags, sd.gold_sanity ? 22 : 0, "Boss Gold", !!sd.gold_sanity)}
        </div>
      </section>`;
    }
    return html + `</div></div>`;
  }

  APTracker.register({
    game:"Slay the Spire II",
    slotData:true,
    async init(api){ D = await api.json("data/sts2.json"); },
    tabs:[{ id:"ss2-map", label:"The Spire", render:renderMap }, { id:"ss2-deck", label:"Deck & relics", render:renderDeck }],
    checksLabel:"Checks by character",
    locationGroup:n => { const c = n.split(" ")[0]; return (LOOK[c] || [c])[0]; },
    card(t){
      const m = model(t);
      return `${m.haveLogic ? `${m.ready} ready now · ` : ""}${m.chars.map(x => `${x.c.label}${x.floors ? ` F${x.floor}` : ""}`).join(" · ")}`;
    }
  });
})();
