# Archipelago Live Tracker

A live web tracker for an [Archipelago](https://archipelago.gg) multiworld, hosted by the same Pterodactyl server as the Archipelago server itself. Everyone opens one page and sees every player's progress update live: checks, items, hints and goals. Players can click anything they haven't unlocked yet to ask the server for a hint.

Games with their own tracker get a custom view. Every other game gets the generic one.

| Game | Folder |
| --- | --- |
| Path of Exile | `tracker/games/path-of-exile` |
| Path of Exile 2 | `tracker/games/path-of-exile-2` |
| Minecraft | `tracker/games/minecraft` |
| Baldur's Gate 3 | `tracker/games/baldurs-gate-3` |
| Satisfactory | `tracker/games/satisfactory` |
| StarCraft II | `tracker/games/starcraft-2` |
| Animal Crossing | `tracker/games/animal-crossing` |
| Stardew Valley | `tracker/games/stardew-valley` (exact logic from Archipelago, see below) |
| Elden Ring | `tracker/games/elden-ring` |
| Old School RuneScape | `tracker/games/old-school-runescape` |
| Pokémon Platinum | `tracker/games/pokemon-platinum` |
| Resident Evil 4 Remake | `tracker/games/resident-evil-4-remake` |
| Wynncraft | `tracker/games/wynncraft` |

## Setting up the server

1. In the Pterodactyl admin area, import `egg/egg-archipelago-multiworld-tracker.json` (Nests → Import Egg), or update your existing egg with it.
2. Give the server a second port (Network → Allocations) and put it in the **Tracker Port** variable.
3. Check that **Tracker Files** contains this repo (`IhleMa/archipelago-trackers`). The install downloads the tracker and every game tracker from here.
4. Reinstall the server, upload a seed to `seeds/` and start it.
5. Open `http://<server address>:<tracker port>`.

Reinstalling pulls the newest version from this repo. Game folders are merged, not replaced, so files you added on the server stay, like the Old School RuneScape map image or game trackers of your own.

If GitHub can't be reached during install, the egg falls back to a built-in copy of the core tracker, where every game uses the generic view until the next successful install or update.

## Updating while people are playing

Type `tracker update` in the server console. It downloads the newest tracker from **Tracker Files** and restarts only the tracker relay. The Archipelago server and everyone's games keep running, and open tracker pages reload by themselves. The chat shows each slot's tracker leave and rejoin once.

Everything else you type in the console goes to the Archipelago server as before, including the panel's stop command. A reinstall is still needed for changes to the egg itself (the start script or install script), and the first time to get this command.

## How it connects

The server runs a small relay (`relay/relay.py`, standard-library Python; the install downloads a portable Python for it). The relay logs in once per player as a read-only tracker and shares that live data with every open page. So the Archipelago chat shows one "tracking" message per player when the server starts, no matter how many people open or reload the tracker.

- **Server password:** the relay knows the room's password and asks viewers for it before showing anything. The admin password is never passed to it.
- **Hints:** hint requests go through the relay and are spent from that player's own points. Only `!hint` and `!hint_location` can be sent this way.
- **Unlock history:** the relay records when each item arrived and when each player's game connects and leaves, in `relay/relay-history.json`. Every slot gets a History tab, and when a player has been away from their game, it shows what came in meanwhile at the top. The board shows "new while away" on their card. Join and leave only count for the game client itself, not trackers or text clients. Items that arrived while the relay wasn't running are listed without a time.
- **Progress over time:** below the slots, a chart shows each player's share of checks over the session (last 6 h, last 24 h or all), with a table of checks in the last hour and checks per hour while their game was connected. The relay keeps this in the same history file.
- **Exact logic:** for games whose world can rebuild itself from slot data (so far Stardew Valley), the relay runs Archipelago's own world code next to it (`relay/ap_logic.py`) and tells every page which checks are in logic right now. `bin/setup-logic.sh` sets this up: it fetches the Archipelago source matching the server's version (only the core modules and those worlds, about 7 MB) into `relay/ap`, and installs five small Python packages into the relay's Python. The relay runs it by itself the first time it starts without it, and `tracker update` and the install run it too. If it can't be set up, those trackers still work, just without the "ready now" marks. Its log is `relay-logic.log`.
- **Without the relay:** if Python isn't there, busybox serves the page and each page connects to the server itself, as before. You can force that per page with `?direct`.

## Demo mode

Add `?demo` to the tracker address (`http://<server address>:<tracker port>/?demo`) to see every game tracker without an Archipelago server or a seed. Every installed game tracker that has a `demo.json` in its folder adds one made-up player, and their items are shuffled across everyone's checks, so it plays like a real multiworld: everyone starts part way through, new checks and items keep arriving every few seconds, and hints are answered the way the server would. Nothing is sent to the server, and other people's view of the real tracker isn't affected.

A game tracker without a `demo.json` is simply left out (the demo says so). To make one, run `tools/make_demo.py --game "Exact Game Name"` from an Archipelago source checkout with that world installed. It generates a one-player seed with default options by itself and writes the file into the tracker's folder. `--yaml` uses your own options instead, and passing an existing seed file writes demo files for every game in it.

## Adding a game tracker

Copy `tracker/games/_template`, rename it and set the game name in `game.json`. Then:

- **To share it:** push the folder to this repo and reinstall the server.
- **To use it on one server only:** upload the folder to `tracker/games/` on that server. It shows up after a page reload, with no restart.

`tracker/games/README.md` documents the plugin API.

## Rebuilding the egg

```
python3 tools/build_egg.py IhleMa/archipelago-trackers
```

This writes `egg/egg-archipelago-multiworld-tracker.json` from `tools/egg-base.json`. Pterodactyl limits an egg's install script to 64 KB, which is why the game trackers are downloaded instead of embedded.

## Credits

Some game data was generated from the Archipelago worlds' own source files. Each game folder's `data/NOTICE.txt` names the source and its licence where one applies. The Old School RuneScape map image belongs to Jagex and isn't part of this repo. Upload it to `tracker/games/old-school-runescape/img/` on your own server (see the NOTICE file there). Without it, the tracker draws a simple map instead.
