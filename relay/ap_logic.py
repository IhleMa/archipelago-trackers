#!/usr/bin/env python3
"""Exact logic for the tracker: rebuilds a player's world from its slot data, the way Universal Tracker does,
and says which of its locations the items they have received put in logic.

The relay runs this as a separate process (so a slow or broken world never stalls the page) and talks to it
in JSON lines on stdin/stdout:

  in : {"slot": 3, "game": "Stardew Valley", "name": "Abigail", "slot_data": {...}, "items": [item ids]}
  out: {"slot": 3, "logic": [location ids reachable now], "goal": true/false}      or  {"slot": 3, "error": "..."}

It needs Archipelago's source next to it (relay/ap: the core modules and the worlds it supports; the egg's
installer fetches the files that match the server's Archipelago version) and a few pure-Python packages
(pyyaml, schema, pathspec, typing_extensions, bsdiff4). Only games listed in GAMES are rebuilt: their worlds
take every option and their random seed from slot data, so the rebuilt world is the one that was generated.
"""
import hashlib, json, logging, os, sys, time, warnings

HERE = os.path.dirname(os.path.abspath(__file__))
AP = os.environ.get("AP_SOURCE") or os.path.join(HERE, "ap")
GAMES = {"Stardew Valley"}

warnings.filterwarnings("ignore")
os.environ.setdefault("SKIP_REQUIREMENTS_UPDATE", "1")
logging.disable(logging.WARNING)
sys.path.insert(0, AP)
os.chdir(AP)
_out = sys.stdout
sys.stdout = sys.stderr          # anything the worlds print goes to the log, never into the reply stream

from argparse import Namespace                         # noqa: E402
from BaseClasses import CollectionState, MultiWorld    # noqa: E402
from worlds.AutoWorld import AutoWorldRegister, call_all  # noqa: E402

STEPS = ("generate_early", "create_regions", "create_items", "set_rules", "connect_entrances", "generate_basic")
worlds = {}     # slot -> (key, multiworld, world)


def build(game, name, slot_data):
    wt = AutoWorldRegister.world_types[game]
    mw = MultiWorld(1)
    mw.game = {1: game}
    mw.player_name = {1: name or "Player"}
    mw.set_seed(0)
    # defaults first, then the world reads its options and its seed back out of slot data
    args = Namespace(**{k: {1: v.from_any(v.default)} for k, v in wt.options_dataclass.type_hints.items()})
    probe = MultiWorld(1); probe.game = {1: game}; probe.player_name = dict(mw.player_name); probe.set_seed(0)
    probe.set_options(args)
    seed = probe.worlds[1].interpret_slot_data(slot_data)
    mw.re_gen_passthrough = {game: seed} if seed is not None else {}
    mw.set_options(args)
    w = mw.worlds[1]
    w.interpret_slot_data(slot_data)
    mw.state = CollectionState(mw)
    for step in STEPS:
        call_all(mw, step)
    mw.precollected_items[1] = []      # the server sends starting items like any other, so count them once
    return mw, w


def solve(req):
    slot, game = req["slot"], req["game"]
    if game not in GAMES:
        return {"slot": slot, "error": f"no logic for {game}"}
    key = hashlib.sha1(json.dumps([game, req.get("name"), req["slot_data"]], sort_keys=True).encode()).hexdigest()
    if slot not in worlds or worlds[slot][0] != key:
        t = time.time()
        mw, w = build(game, req.get("name"), req["slot_data"])
        worlds[slot] = (key, mw, w)
        print(f"ap_logic: rebuilt {game} for slot {slot} in {time.time() - t:.1f}s", file=sys.stderr)
    _, mw, w = worlds[slot]
    state = CollectionState(mw)
    names = w.item_id_to_name
    for i in req.get("items") or []:
        n = names.get(i)
        if n:
            state.collect(w.create_item(n), prevent_sweep=True)
    state.sweep_for_advancements()
    logic = [l.address for l in mw.get_locations(1) if l.address is not None and l.can_reach(state)]
    return {"slot": slot, "logic": logic, "goal": bool(mw.completion_condition[1](state))}


def main():
    print(json.dumps({"ready": sorted(g for g in GAMES if g in AutoWorldRegister.world_types)}), file=_out, flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = {}
        try:
            req = json.loads(line)
            res = solve(req)
        except Exception as e:      # one bad world must not take the others down
            res = {"slot": req.get("slot") if isinstance(req, dict) else None, "error": f"{type(e).__name__}: {e}"}
        print(json.dumps(res, separators=(",", ":")), file=_out, flush=True)


if __name__ == "__main__":
    main()
