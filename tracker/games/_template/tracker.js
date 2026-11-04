/* Starter game tracker. Copy this folder to games/<your-game>/, set "game" in game.json to the
   exact name Archipelago uses (shown under each player's name on the tracker), then edit below.
   Full reference: games/README.md */
(() => {
  // Items worth showing as "unlockables". Use the exact item names from the game's Archipelago world.
  const KEY_ITEMS = [
    { name: "Hookshot", label: "Hookshot" },
    { name: "Progressive Sword", label: "Sword", max: 4 },
  ];

  APTracker.register({
    game: "Exact Game Name",

    // Optional: ask the server for this slot's options (slot_data), available as t.slotData.
    slotData: false,

    // Optional: load data files from this folder once, before the first draw.
    // async init(api){ const data = await api.json("data/something.json"); },

    // Custom tabs, shown before the standard Items / Checks / Hints tabs.
    tabs: [{
      id: "unlocks",
      label: "Unlocks",
      render(t) {
        const tiles = KEY_ITEMS.map(k => {
          const n = t.count(k.name);
          const text = k.max ? `${k.label} ${n}/${k.max}` : k.label;
          // t.hint(...) makes the element open the hint dialog for that item when clicked
          return `<div class="mygame-tile ${n ? "on" : ""}"${t.hint(k.name, k.label)}>${t.esc(text)}</div>`;
        }).join("");
        return `<div class="mygame"><h3>Unlocks</h3><div class="mygame-grid">${tiles}</div></div>`;
      }
    }],

    // Optional: group checks into sections, e.g. by the part before ":" in the location name.
    checksLabel: "Checks by area",
    locationGroup: name => name.includes(":") ? name.split(":")[0] : "Other",
    // groupOrder: ["Area 1", "Area 2"],

    // Optional: one short line on the slot's card in the overview.
    card: t => `${t.count("Progressive Sword")} swords`
  });
})();
