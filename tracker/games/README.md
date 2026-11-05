# Adding a game tracker

Every folder in `games/` is one game tracker. The tracker page picks the right one for each
slot automatically, using the game name the Archipelago server reports. Slots whose game has
no folder here get the standard view (items, checks, hints).

Folders whose name starts with `_` are ignored. `_template` is a working starting point.

## Steps

1. Copy `_template` to a new folder, e.g. `games/a-link-to-the-past/`.
2. In `game.json`, set `"game"` to the exact game name, as shown under the player's name on
   the tracker (for example `"A Link to the Past"`). One tracker can cover several games with
   `"games": ["Game A", "Game B"]`.
3. Edit `tracker.js` and `style.css`.
4. Reload the tracker page. No server restart is needed.

Don't edit the bundled `path-of-exile` or `minecraft` folders directly: reinstalling the server
updates them and would overwrite your changes. Copy one to a new folder instead.

## game.json

```json
{ "game": "Exact Game Name", "script": "tracker.js", "style": "style.css" }
```

`script` defaults to `tracker.js`. `style` is optional and can be a list.

## tracker.js

Call `APTracker.register({...})` once:

| Field | Required | What it does |
|---|---|---|
| `game` | yes | Exact game name (or a list). |
| `tabs` | no | `[{ id, label, render(t) }]`. `render` returns an HTML string. Shown before the standard tabs. |
| `checksLabel` | no | Name of the checks tab, e.g. "Checks by act". |
| `locationGroup(name, t)` | no | Returns the section a location belongs to. |
| `groupOrder` | no | Array of section names in order, or a function returning a sort number. |
| `card(t)` | no | One short line (HTML) on the slot's overview card. |
| `slotData` | no | `true` to receive the slot's options from the server as `t.slotData`. |
| `init(api)` | no | Async, runs once before the first draw. `api.json("data/x.json")` loads a file from your folder, `api.url("img/a.png")` gives a file's URL. |

### The `t` object (one slot)

| Field | Meaning |
|---|---|
| `t.name`, `t.game`, `t.slot` | Player name, game name, slot number. |
| `t.isMine` | `true` when the viewer picked this slot under "I'm playing as". |
| `t.goal` | `true` once the slot finished its goal. |
| `t.items` | Received items: `{ name, id, flags, from, location }`. `flags & 1` = progression, `& 2` = useful, `& 4` = trap. |
| `t.count(nameOrRegExp)` | How many of an item were received. |
| `t.has(nameOrRegExp)` | At least one received. |
| `t.itemNames` | Every item name this game has. Use it to show only things that exist. |
| `t.checked`, `t.missing` | Location names done / still open. |
| `t.locations` | Every check of this slot: `{ id, name, done }`. |
| `t.hints` | Known hints for this player's items: `{ item, location, player, found }`. |
| `t.slotData` | The slot's options (needs `slotData: true`). |
| `t.hint(names, label)` | Returns attributes that make an element open the hint dialog for those item names. Use it on anything unlockable: `` `<div${t.hint("Hookshot")}>…</div>` ``. |
| `t.url(path)` | URL of a file in your folder (images etc.). |
| `t.esc(text)` | Escape text before putting it in HTML. |

The page redraws your tab whenever anything changes, so `render` should only build HTML.

## Styling

The page has light and dark themes. Either use the core colour variables (`--bg`, `--surface`,
`--fg`, `--muted`, `--line`, `--accent`, `--accent-soft`, `--gold`) or give your panel its own
fixed look, like the Path of Exile and Minecraft trackers do. Prefix every class with your
game's name so styles don't leak into other games.

## Images

Put images in your folder (e.g. `img/`) and use `t.url("img/sword.png")`. Only use images you
are allowed to share.

## Demo data (optional)

A `demo.json` next to `game.json` puts a made-up player for this game into the tracker demo (`?demo`), so the tracker can be tried without a server. Make it with `tools/make_demo.py --game "Exact Game Name"` from an Archipelago source checkout (see the main README). Without the file, the game is just left out of the demo.
