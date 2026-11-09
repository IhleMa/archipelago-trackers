/* Pokemon Platinum tracker (ljtpetersen/platinum_archipelago, game "Pokemon Platinum").
   Trainer card with the badge case, HMs with their badge and whether you can use them, the Pokétch,
   key items, fly destinations and Sinnoh places with checks done per place.
   What's in logic comes from Archipelago itself: the relay rebuilds the player's world from slot data (relay/ap_logic.py),
   so "ready now" is exact. The Ready tab lists every check you can do with what you have, place by place.
   Data: data/platinum.json, generated from the world's data_gen TOML files (MIT licence, James Petersen). */
(() => {
  let D = null;
  const BADGE_COLOR = { "Coal Badge":["#7a4a2a","#c07a3a"], "Forest Badge":["#2f7a3a","#7ccf6a"], "Cobble Badge":["#5a6a7a","#a9b9c9"], "Fen Badge":["#2a5aa8","#79b2ff"],
    "Relic Badge":["#8a6a1a","#e6c24a"], "Mine Badge":["#6a6a72","#d6d6de"], "Icicle Badge":["#3a8aa8","#bdf2ff"], "Beacon Badge":["#b8860b","#ffe066"] };
  const BADGE_SHAPE = { // simple original emblems, one per badge
    "Coal Badge":"M12 3l7 5-3 9H8L5 8z", "Forest Badge":"M12 2l7 11h-4l3 6H6l3-6H5z", "Cobble Badge":"M12 3a9 9 0 1 0 .01 0zM12 8a4 4 0 1 1-.01 0z",
    "Fen Badge":"M12 2c4 6 7 9 7 13a7 7 0 0 1-14 0c0-4 3-7 7-13z", "Relic Badge":"M4 20h16L12 3z", "Mine Badge":"M6 4h12l3 6-9 11L3 10z",
    "Icicle Badge":"M12 2v20M3 7l18 10M21 7L3 17", "Beacon Badge":"M12 2l2.5 6.5L21 9l-5 4.5L17.5 21 12 17l-5.5 4L8 13.5 3 9l6.5-.5z" };
  const HM_KEY = { "HM01 Cut":"cut", "HM02 Fly":"fly", "HM03 Surf":"surf", "HM04 Strength":"strength", "HM05 Defog":"defog", "HM06 Rock Smash":"rock_smash",
    "HM07 Waterfall":"waterfall", "HM08 Rock Climb":"rock_climb", "TM70 Flash":"flash" };
  const placeOf = n => D.prefix[n.split(" - ")[0]] || "Other";
  const checkName = n => { const i = n.indexOf(" - "); return i < 0 ? n : n.slice(i + 3); };
  const areaOrder = p => { let i = 0; for(const [, places] of D.areas){ const j = places.indexOf(p); if(j >= 0) return i + j; i += 100; } return 9999; };

  /* what's in logic, per place */
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
  const noLogic = t => t.logicNote ? t.esc(t.logicNote) : `"Ready now" needs exact logic on the server: run <code>tracker update</code> in the console.`;

  function panel(t){
    const e = t.esc, sd = t.slotData || {}, m = model(t);
    const needBag = sd.bag === 1 && t.itemNames.includes("Bag"), hasBag = !needBag || t.has("Bag");
    const removed = new Set((sd.remove_badge_requirements || []).map(x => String(x).toLowerCase()));
    const badgeNeeded = hm => !(removed.has("all") || removed.has(hm));

    // trainer card
    const badges = D.badges.map(b => { const on = t.has(b), [dark, light] = BADGE_COLOR[b] || ["#555", "#aaa"];
      return `<div class="pp-badge${on ? " on" : ""}"${t.hint(b)} title="${e(b)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${BADGE_SHAPE[b] || "M12 3a9 9 0 1 0 .01 0z"}" fill="${on ? light : "none"}" stroke="${on ? dark : "#8b8170"}" stroke-width="1.6" stroke-linejoin="round"/></svg><span>${e(b.replace(" Badge", ""))}</span></div>`; }).join("");
    const nBadges = D.badges.filter(b => t.has(b)).length;
    const total = t.checked.length + t.missing.length;

    // HMs: the world's rule is HM + its badge + (Bag, or the HM Reader for most moves) + a Pokémon that can use it
    const reader = t.itemNames.includes("HM Reader") && t.has("HM Reader");
    const BAG_ALWAYS = new Set(["fly", "defog", "flash"]); // the HM Reader doesn't replace the Bag for these
    const hms = D.hms.filter(n => t.itemNames.includes(n)).map(n => {
      const key = HM_KEY[n], badge = key !== "flash" ? D.hmBadge[key] : null, needB = badge && badgeNeeded(key);
      const bagOk = hasBag || (!BAG_ALWAYS.has(key) && reader);
      const haveHM = t.has(n), haveB = !needB || t.has(badge), usable = haveHM && haveB && bagOk;
      const missing = [!haveHM && n, needB && !t.has(badge) && badge, !bagOk && "Bag"].filter(Boolean);
      return `<div class="pp-hm${usable ? " on" : haveHM ? " half" : ""}"${missing.length ? t.hint(missing, n) : ""}>
        <span class="pp-disc"></span><div><b>${e(n.replace(/^(HM|TM)\d+ /, ""))}<em>${e(n.split(" ")[0])}</em></b>
        <small>${usable ? "Ready to use" : missing.map(m => m === n ? "need the " + (n.startsWith("TM") ? "TM" : "HM") : "need " + m).join(" · ")}</small></div></div>`; }).join("");

    // Pokétch: the "Poketch" item turns it on; apps are separate items. Parcel + Coupons 1-3 open the Jubilife Pokétch checks.
    const watchItem = t.itemNames.includes("Poketch"), watchOn = !watchItem || t.has("Poketch");
    const apps = D.poketch.filter(n => n !== "Poketch" && t.itemNames.includes(n)).map(n => `<div class="pp-app${t.has(n) ? " on" : ""}"${t.hint(n)}>${e(n.replace("POKeMON", "POKéMON"))}</div>`).join("");
    const coupons = ["Parcel", "Coupon 1", "Coupon 2", "Coupon 3"].filter(n => t.itemNames.includes(n));

    // key items and other unlocks
    const specials = Object.values(D.special).filter(n => t.itemNames.includes(n));
    const dex = t.count("Upgradable Pokedex");
    const keyList = [...D.keyItems.filter(n => !/^(Parcel|Coupon \d)$/.test(n)), "HM Reader", ...specials.filter(n => n !== "Upgradable Pokedex")].filter((n, i, a) => t.itemNames.includes(n) && a.indexOf(n) === i);
    const keys = keyList.map(n => `<div class="pp-key${t.has(n) ? " on" : ""}"${t.hint(n)}><span>${e(n)}</span></div>`).join("");
    const carts = D.cartridges.filter(n => t.itemNames.includes(n)).map(n => `<div class="pp-key${t.has(n) ? " on" : ""}"${t.hint(n)}><span>${e(n.replace(/ Cartridge$/, ""))}</span></div>`).join("");
    const fly = sd.randomize_fly_items ? D.fly.filter(n => t.itemNames.includes(n)).map(n => `<div class="pp-key${t.has(n) ? " on" : ""}"${t.hint(n)}><span>${e(n.replace(/ Fly Region$/, ""))}</span></div>`).join("") : "";

    // Sinnoh
    const sinnoh = D.areas.map(([area, places]) => { const tiles = places.filter(p => m.per.get(p)).map(p => { const v = m.per.get(p), d = v.done, n = v.total, town = D.towns.includes(p), r = v.ready.length;
        return `<div class="pp-place${town ? " town" : ""}${d === n ? " done" : ""}${r ? " go" : m.haveLogic && d < n ? " shut" : ""}" title="${e(p)}: ${d} of ${n} done${r ? `, ${r} ready now` : m.haveLogic && d < n ? ", nothing reachable yet" : ""}"><span>${e(p)}</span><div class="pp-bar"><i style="width:${Math.round(d / n * 100)}%"></i></div><small>${r ? `<em>${r} ready</em>` : `${d}/${n}`}</small></div>`; }).join("");
      return tiles ? `<div class="pp-area"><h4>${e(area)}</h4><div class="pp-places">${tiles}</div></div>` : ""; }).join("");

    const sec = (title, body, note = "") => body ? `<section class="pp-sec"><div class="pp-shead"><h3>${title}</h3>${note ? `<span class="pp-dim">${note}</span>` : ""}</div>${body}</section>` : "";
    return `<div class="pp">
      <div class="pp-card"><div class="pp-cardtop"><span>TRAINER CARD</span><span>Sinnoh</span></div>
        <div class="pp-cardbody"><div class="pp-info"><span class="pp-k">Name</span><b class="pp-name">${e(t.name)}</b>
          <div class="pp-stats">${m.haveLogic ? `<div class="pp-ready"><span class="pp-k">Ready now</span><b>${m.ready}</b></div>` : ""}<div><span class="pp-k">Badges</span><b>${nBadges}/8</b></div><div><span class="pp-k">Checks</span><b>${t.checked.length}/${total}</b></div>
          ${t.itemNames.includes("Upgradable Pokedex") ? `<div${t.hint("Upgradable Pokedex", "Pokédex")}><span class="pp-k">Pokédex</span><b>${dex === 0 ? "None" : dex >= 3 ? "National" : "Lv " + dex}</b></div>` : ""}
          ${sd.regional_dex_goal ? `<div><span class="pp-k">Dex goal</span><b>${sd.regional_dex_goal} seen</b></div>` : ""}</div>
          <span class="pp-goal">${t.goal ? "Hall of Fame entered!" : `Goal: defeat Champion Cynthia${t.logicGoal ? " · you can do it now!" : ""}`}</span>
          ${m.haveLogic ? "" : `<span class="pp-goal pp-nologic">${noLogic(t)}</span>`}</div>
          <div class="pp-case">${badges}</div></div></div>
      ${sec("HMs", hms && `<div class="pp-hms">${hms}</div>`, (removed.has("all") ? "Badge requirements removed" : "Each HM needs its badge" + (needBag ? " and the Bag" : "")) + " (plus a Pokémon that can learn it)" + (t.isMine ? " · click one you can't use yet for a hint" : ""))}
      ${sec("Pokétch", apps && `<div class="pp-poketch${watchOn ? "" : " off"}"><div class="pp-watch"${watchOn ? "" : t.hint("Poketch")}><span class="pp-btn"></span><div class="pp-lcd">${apps}</div><span class="pp-btn"></span></div>
        ${watchOn ? "" : `<span class="pp-lcdnote">You don't have the Pokétch yet, so these apps can't be used. Click the watch for a hint.</span>`}
        ${coupons.length ? `<div class="pp-coupons"><span class="pp-k">Jubilife Pokétch campaign</span>${coupons.map(n => `<span class="pp-chip${t.has(n) ? " on" : ""}"${t.hint(n)}>${e(n)}</span>`).join("")}</div>` : ""}</div>`, watchItem ? (watchOn ? "Pokétch on your wrist" : "Pokétch missing") : "")}
      ${sec("Key items", keys && `<div class="pp-keys">${keys}</div>`)}
      ${sec("Fly destinations", fly && `<div class="pp-keys">${fly}</div>`)}
      ${sec("GBA cartridges", carts && `<div class="pp-keys">${carts}</div>`, "Change which Pokémon appear")}
      ${sec("Sinnoh", sinnoh, m.haveLogic ? "Checks done per place · glowing: something you can do now · towns in bold" : "Checks done per place · towns in bold")}
    </div>`;
  }

  /* the Ready tab: every check you can do right now, place by place along the map */
  function readyTab(t){
    const e = t.esc, m = model(t);
    if(!m.haveLogic) return `<div class="pp"><section class="pp-sec"><div class="pp-shead"><h3>Ready now</h3></div><p class="pp-dim">${noLogic(t)}</p></section></div>`;
    const places = [...m.per].filter(([, v]) => v.ready.length).sort((a, b) => areaOrder(a[0]) - areaOrder(b[0]));
    const blocked = [...m.per].filter(([, v]) => v.left && !v.ready.length).sort((a, b) => areaOrder(a[0]) - areaOrder(b[0]));
    const areaOf = p => (D.areas.find(([, l]) => l.includes(p)) || ["Elsewhere"])[0];
    let html = `<div class="pp"><div class="pp-readyhead${t.goal ? " won" : t.logicGoal ? " goal" : ""}"><div class="pp-ball" aria-hidden="true"></div>
      <div><b>${t.goal ? "Champion!" : m.ready ? `${m.ready} check${m.ready === 1 ? "" : "s"} you can do right now` : m.left ? "Nothing reachable right now" : "Every check done"}</b>
      <span>${t.goal ? "You entered the Hall of Fame." : t.logicGoal ? "And the Champion is in reach: you have everything for the Pokémon League." : m.ready ? `${m.left} checks left in all · ready ones in ${places.length} place${places.length === 1 ? "" : "s"} · worked out by Archipelago from the items you have` : m.left ? "Wait for more items from the other players, or ask for a hint." : ""}</span></div></div>`;
    let lastArea = null;
    for(const [p, v] of places){
      const a = areaOf(p);
      if(a !== lastArea){ if(lastArea !== null) html += `</div></section>`; html += `<section class="pp-sec"><div class="pp-shead"><h3>${e(a)}</h3></div><div class="pp-rplaces">`; lastArea = a; }
      html += `<article class="pp-rplace${D.towns.includes(p) ? " town" : ""}"><header><span>${e(p)}</span><small>${v.ready.length} ready · ${v.done}/${v.total} done</small></header>
        <ul>${v.ready.slice(0, v.ready.length > 8 ? 6 : 8).map(n => `<li>${e(checkName(n))}</li>`).join("")}</ul>${v.ready.length > 8 ? `<details><summary>Show ${v.ready.length - 6} more</summary><ul>${v.ready.slice(6).map(n => `<li>${e(checkName(n))}</li>`).join("")}</ul></details>` : ""}</article>`;
    }
    if(lastArea !== null) html += `</div></section>`;
    if(blocked.length) html += `<section class="pp-sec"><div class="pp-shead"><h3>Not reachable yet</h3><span class="pp-dim">Checks left here need something you don't have yet</span></div>
      <div class="pp-blocked">${blocked.map(([p, v]) => `<span>${e(p)} <small>${v.left}</small></span>`).join("")}</div></section>`;
    return html + `</div>`;
  }

  APTracker.register({
    game: "Pokemon Platinum",
    slotData: true,
    async init(api){ D = await api.json("data/platinum.json"); },
    tabs: [{ id:"trainer", label:"Trainer", render:panel }, { id:"pp-ready", label:"Ready now", render:readyTab }],
    checksLabel: "Checks by place",
    locationGroup: n => placeOf(n),
    groupOrder: g => { let i = 0; for(const [, places] of D.areas){ const j = places.indexOf(g); if(j >= 0) return i + j; i += 100; } return 9999; },
    card(t){ const b = D.badges.filter(x => t.has(x)).length, m = model(t); return `${m.haveLogic ? `${m.ready} ready now · ` : ""}${b}/8 badges · ${D.hms.filter(h => t.has(h)).length} HMs`; }
  });
})();
