#!/usr/bin/env python3
"""Exact logic for the tracker: rebuilds a player's world from its slot data, the way Universal Tracker does,
and says which of its locations the items they have received put in logic.

The relay runs this as a separate process (so a slow or broken world never stalls the page) and talks to it
in JSON lines on stdin/stdout:

  in : {"slot": 3, "game": "Stardew Valley", "name": "Abigail", "slot_data": {...}, "items": [item ids]}
  out: {"slot": 3, "logic": [location ids reachable now], "goal": true/false}      or  {"slot": 3, "error": "..."}
       (+ "maybe": [ids reachable only under some of the rolls the seed doesn't record], for worlds rebuilt several times;
        {"slot": 3, "unsupported": "why"} when a seed's settings can't be rebuilt at all)

It needs Archipelago's source next to it (relay/ap: the core modules and the worlds it supports; the egg's
installer fetches the files that match the server's Archipelago version) and a few pure-Python packages
(pyyaml, schema, pathspec, typing_extensions, bsdiff4, orjson). Only games listed in GAMES are rebuilt: their worlds
take every option and their random seed from slot data, so the rebuilt world is the one that was generated.

Worlds that aren't part of Archipelago (EXTERNAL) are downloaded from their own repository the first time a slot
needs them, at the version that generated the seed (read from slot data), into relay/ap/worlds/<folder>. If a
later seed needs a different version, the worker answers {"restart": true} and exits; the relay starts it again.
"""
import hashlib, importlib, json, traceback, logging, os, shutil, subprocess, sys, tarfile, tempfile, time, warnings

HERE = os.path.dirname(os.path.abspath(__file__))
AP = os.environ.get("AP_SOURCE") or os.path.join(HERE, "ap")
GAMES = {"Stardew Valley", "Borderlands 2", "Spyro 2", "Ocarina of Time", "Pokemon Platinum", "Slay the Spire"}
EXTERNAL = {
    "Borderlands 2": {"repo": "EdricY/Bouncy-Loot-God", "path": "worlds/borderlands2", "folder": "borderlands2",
                      "version": lambda sd: str(sd.get("version") or "")},
    "Spyro 2": {"repo": "Uroogla/S2AP", "path": "apworld/spyro2", "folder": "spyro2",
                "version": lambda sd: str(sd.get("apworldVersion") or "")},
    "Pokemon Platinum": {"repo": "ljtpetersen/platinum_archipelago", "path": "", "folder": "pokemon_platinum",
                         "version": lambda sd: str(sd.get("version") or ""), "prepare": lambda d: _platinum_prepare(d)},
    # slot data has no world version, only the mod's protocol version: follow the repo's release branch for it
    "Slay the Spire": {"repo": "cjmang/StS-AP-World", "path": "worlds/spire", "folder": "spire",
                       "version": lambda sd: f"mod{sd.get('mod_version', '')}", "refs": ["refs/heads/sts", "refs/heads/main"]},
}


def _codeload(repo, ref, path, out):
    """Download repo at ref from GitHub and extract its folder `path` ("" for all of it) into out. True if it worked."""
    tmp = tempfile.mkdtemp(prefix="apsrc-")
    try:
        tgz = os.path.join(tmp, "src.tgz")
        r = subprocess.run(["curl", "-fsSL", "--max-time", "120", "-o", tgz, f"https://codeload.github.com/{repo}/tar.gz/{ref}"], capture_output=True)
        if r.returncode != 0:
            return False
        with tarfile.open(tgz) as tf:
            members = []
            for m in tf.getmembers():
                if "/" not in m.name or m.issym() or m.islnk():
                    continue
                rel = m.name.split("/", 1)[1]
                if path and not rel.startswith(path + "/"):
                    continue
                m.name = rel[len(path) + 1:] if path else rel
                if m.name:
                    members.append(m)
            if not members:
                return False
            tf.extractall(out, members=members)
        return True
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _platinum_prepare(d):
    # the world's data tables are generated from its TOML files when the .apworld is built, and it needs the
    # apnds library next to it: do both, as its Makefile does
    ver = open(os.path.join(d, "apnds_version.txt")).read().strip()
    tmp = tempfile.mkdtemp(prefix="apnds-")
    try:
        if not _codeload("ljtpetersen/apnds", f"refs/tags/v{ver}", "", tmp):
            raise RuntimeError(f"couldn't download apnds {ver}")
        shutil.copytree(os.path.join(tmp, "apnds"), os.path.join(d, "apnds"), dirs_exist_ok=True)
        open(os.path.join(d, "apnds", "__init__.py"), "a").close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    r = subprocess.run([sys.executable, "data_gen.py"], cwd=d, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.isfile(os.path.join(d, "data", "__init__.py")):
        raise RuntimeError("Pokemon Platinum data_gen.py failed: " + (r.stderr or r.stdout)[-400:])


def _spyro_options(sd):
    return dict(sd.get("options") or {})


def _spyro_after_early(w, sd):
    # the seed's own gemsanity picks (the world would otherwise pick its own at random)
    names = {v: k for k, v in w.location_name_to_id.items()}
    w.chosen_gem_locations = [names[i] for i in sd.get("gemsanity_ids") or [] if i in names]


def _oot_options(sd, locations=()):
    from worlds.oot import OOTWorld
    from worlds.oot.Location import location_name_to_id
    names = set(OOTWorld.options_dataclass.type_hints)
    opts = {k: v for k, v in sd.items() if k in names}
    if str(opts.get("mq_dungeons_mode")) in ("count", "3") and locations:
        # which dungeons are Master Quest was rolled at generation: read it off the slot's own locations
        by_id = {v: k for k, v in location_name_to_id.items()}
        loc_names = [by_id.get(i, "") for i in locations]
        dungeons = ["Deku Tree", "Dodongos Cavern", "Jabu Jabus Belly", "Forest Temple", "Fire Temple", "Water Temple", "Shadow Temple",
                    "Spirit Temple", "Bottom of the Well", "Ice Cavern", "Gerudo Training Ground", "Ganons Castle"]
        opts["mq_dungeons_mode"] = "specific"
        opts["mq_dungeons_list"] = [d for d in dungeons if any(n.startswith(d + " MQ ") for n in loc_names)]
    trials = opts.get("trials")
    if isinstance(trials, int) and 0 < trials < 6:
        opts["trials"] = 6    # which trials are on was rolled at generation; assume all, so nothing shows ready too early
    return opts


_OOT_BOSSES = ("Queen Gohma", "King Dodongo", "Barinade", "Phantom Ganon", "Volvagia", "Morpha", "Bongo Bongo", "Twinrova", "Links Pocket")
_OOT_MAX_PRICE = {"normal": 295, "affordable": 10, "starting_wallet": 95, "adults_wallet": 200, "giants_wallet": 500, "tycoons_wallet": 995}


def _oot_variant(w, k, step):
    """Rebuild k of several: which boss holds which medallion or stone, and the shop prices, were rolled at generation and
    aren't in slot data. Rotate the nine rewards through the nine bosses (so each reward sits on each boss once) and
    alternate the highest and lowest possible shop prices: what every rebuild agrees on is certain, the rest is "maybe"."""
    if step != "create_items":
        return
    mw = w.multiworld
    rewards = sorted(w.item_name_groups["rewards"])
    for i, boss in enumerate(_OOT_BOSSES):
        loc = mw.get_location(boss, w.player)
        loc.item = None
        loc.locked = False
        loc.place_locked_item(w.create_item(rewards[(i + k) % len(rewards)]))
    top = 10 if str(w.shopsanity_prices) == "affordable" else (_OOT_MAX_PRICE.get(str(w.shopsanity_prices), 995) if k % 2 == 0 else 0)
    for name in list(w.shop_prices):
        w.shop_prices[name] = top


def _oot_unsupported(sd):
    """Settings whose result the world rolls itself and slot data doesn't record."""
    off = lambda v: str(v).lower() in ("off", "false", "0", "none", "", "simple") if v is not None else True
    why = []
    for k, label in (("shuffle_interior_entrances", "interior entrances"), ("shuffle_grotto_entrances", "grotto entrances"),
                     ("shuffle_dungeon_entrances", "dungeon entrances"), ("shuffle_overworld_entrances", "overworld entrances"),
                     ("shuffle_bosses", "boss rooms"), ("owl_drops", "owl drops"), ("warp_songs", "warp songs"), ("spawn_positions", "spawn points")):
        v = sd.get(k)
        if v not in (None, False, 0) and not (isinstance(v, (list, tuple)) and not v) and str(v).lower() not in ("off", "false", "0", "none", "[]", "set()"):
            why.append(label)
    for k, label in (("dungeon_shortcuts", "dungeon shortcuts"), ("key_rings", "key rings")):
        if str(sd.get(k, "")).lower() in ("random_dungeons", "random"):
            why.append(label)
    if why:
        return ("This seed shuffles " + ", ".join(why) + ". The world rolls those itself and the server isn't told the result, "
                "so there's no exact \"ready now\" for it.")
    return None


# Worlds whose Universal Tracker support doesn't restore everything by itself (or that have none): options to apply
# from slot data, and a fix-up after generate_early.
ADAPT = {"Spyro 2": {"options": _spyro_options, "after_early": _spyro_after_early},
         # OoT shuffles which boss holds which medallion or stone, and shop prices, and slot data records neither:
         # rebuild it several times covering those rolls; checks that depend on them come out as "maybe"
         "Ocarina of Time": {"options": _oot_options, "unsupported": _oot_unsupported, "variant": _oot_variant, "samples": 9},
         # reads its options and every roll back out of slot data, but only when told this is a tracker's rebuild
         "Pokemon Platinum": {"fake": True}}

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


def build(game, name, slot_data, locations=(), seed=0):
    wt = AutoWorldRegister.world_types[game]
    mw = MultiWorld(1)
    mw.game = {1: game}
    mw.player_name = {1: name or "Player"}
    mw.set_seed(seed)
    if ADAPT.get(game, {}).get("fake"):
        mw.generation_is_fake = True
    # defaults first, then the world reads its options and its seed back out of slot data
    opt = ADAPT.get(game, {}).get("options")
    given = (opt(slot_data, locations) if opt and opt.__code__.co_argcount > 1 else opt(slot_data)) if opt else {}
    args = Namespace(**{k: {1: v.from_any(given[k] if k in given else v.default)} for k, v in wt.options_dataclass.type_hints.items()})
    probe = MultiWorld(1); probe.game = {1: game}; probe.player_name = dict(mw.player_name); probe.set_seed(seed)
    probe.set_options(args)
    interp = getattr(type(probe.worlds[1]), "interpret_slot_data", None)     # Universal Tracker support is optional
    passthrough = probe.worlds[1].interpret_slot_data(slot_data) if interp else None
    mw.re_gen_passthrough = {game: passthrough} if passthrough is not None else {}
    mw.set_options(args)
    w = mw.worlds[1]
    if interp:
        w.interpret_slot_data(slot_data)
    mw.state = CollectionState(mw)
    for step in STEPS:
        call_all(mw, step)
        if step == "generate_early" and "after_early" in ADAPT.get(game, {}):
            ADAPT[game]["after_early"](w, slot_data)
        if "variant" in ADAPT.get(game, {}):
            ADAPT[game]["variant"](w, seed, step)
    # the server sends starting items like any other, so count them once; events without an id (OoT's Epona, Time
    # Travel...) are never sent, so those stay
    mw.precollected_items[1] = [i for i in mw.precollected_items[1] if i.code is None]
    return mw, w


def fetch_world(game, slot_data):
    """Make sure an external world is installed at the version the seed was made with. Returns True when the
    worker has to restart to load it (a different version is already imported)."""
    ext = EXTERNAL[game]
    want = ext["version"](slot_data)
    dest = os.path.join(AP, "worlds", ext["folder"])
    have = open(os.path.join(dest, ".version")).read().strip() if os.path.isfile(os.path.join(dest, ".version")) else None
    if have == want and game in AutoWorldRegister.world_types:
        return False
    if have != want:
        tmp = tempfile.mkdtemp(prefix="apworld-")
        try:
            got = None
            refs = ext.get("refs") or ([f"refs/tags/v{want}", f"refs/tags/{want}"] if want else []) + ["refs/heads/main", "refs/heads/master"]
            out = os.path.join(tmp, "world")
            for ref in refs:
                if _codeload(ext["repo"], ref, ext["path"], out):
                    got = (ref, out)
                    break
            if not got:
                raise RuntimeError(f"couldn't download the {game} world from {ext['repo']}")
            if "prepare" in ext:
                ext["prepare"](out)
            shutil.rmtree(dest, ignore_errors=True)
            shutil.move(got[1], dest)
            with open(os.path.join(dest, ".version"), "w") as f:
                f.write(want)
            print(f"ap_logic: installed the {game} world {want or '(unversioned)'} from {ext['repo']} ({got[0]})", file=sys.stderr)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    if game in AutoWorldRegister.world_types:     # an older version is loaded in this process
        return True
    importlib.import_module("worlds." + ext["folder"])
    return False


def solve(req):
    slot, game = req["slot"], req["game"]
    if game not in GAMES:
        return {"slot": slot, "error": f"no logic for {game}"}
    if game in EXTERNAL and fetch_world(game, req["slot_data"]):
        return {"slot": slot, "restart": True}
    why = ADAPT.get(game, {}).get("unsupported", lambda sd: None)(req["slot_data"])
    if why:
        return {"slot": slot, "unsupported": why}
    samples = ADAPT.get(game, {}).get("samples", 1)
    key = hashlib.sha1(json.dumps([game, req.get("name"), req["slot_data"], samples], sort_keys=True).encode()).hexdigest()
    if slot not in worlds or worlds[slot][0] != key:
        t = time.time()
        built = [build(game, req.get("name"), req["slot_data"], req.get("locations") or (), seed=k) for k in range(samples)]
        worlds[slot] = (key, built)
        print(f"ap_logic: rebuilt {game} for slot {slot} in {time.time() - t:.1f}s", file=sys.stderr)
    _, built = worlds[slot]
    results, goals = [], []
    for mw, w in built:
        state = CollectionState(mw)
        names = w.item_id_to_name
        for i in req.get("items") or []:
            n = names.get(i)
            if n:
                state.collect(w.create_item(n), prevent_sweep=True)
        state.sweep_for_advancements()
        results.append({l.address for l in mw.get_locations(1) if l.address is not None and l.can_reach(state)})
        goals.append(bool(mw.completion_condition[1](state)))
    # with several rebuilds (worlds that roll things slot data doesn't record), "logic" is what every one of them agrees
    # is reachable and "maybe" what only some of them do
    sure = set.intersection(*results)
    out = {"slot": slot, "logic": sorted(sure), "goal": all(goals)}
    if samples > 1:
        out["maybe"] = sorted(set.union(*results) - sure)
        out["goal_maybe"] = any(goals) and not all(goals)
    return out


def main():
    print(json.dumps({"ready": sorted(g for g in GAMES if g in AutoWorldRegister.world_types or g in EXTERNAL)}), file=_out, flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = {}
        try:
            req = json.loads(line)
            res = solve(req)
        except Exception as e:      # one bad world must not take the others down
            traceback.print_exc(file=sys.stderr)
            res = {"slot": req.get("slot") if isinstance(req, dict) else None, "error": f"{type(e).__name__}: {e}"}
        print(json.dumps(res, separators=(",", ":")), file=_out, flush=True)
        if res.get("restart"):
            sys.exit(0)


if __name__ == "__main__":
    main()
