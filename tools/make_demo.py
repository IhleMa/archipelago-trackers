"""Make the demo data for game trackers: tracker/games/<folder>/demo.json.

The demo (open the tracker with ?demo) adds one made-up player for every installed game tracker that has a
demo.json, and shuffles all their items across everyone's checks. So a game only needs its own file, and
no shared seed is needed.

Run this from an Archipelago source checkout that has the game's world installed (custom_worlds/ or worlds/):

    cd path/to/Archipelago
    python /path/to/this/repo/tools/make_demo.py --game "Pokemon Platinum"            # generates a one-player seed with default options
    python /path/to/this/repo/tools/make_demo.py --game "Pokemon Platinum" --yaml my.yaml   # or with your own options
    python /path/to/this/repo/tools/make_demo.py output/AP_12345.zip                  # every game in an existing seed

Each file holds the game's data package (only the checks in the seed), its slot data (large entries are
dropped unless a tracker.js mentions them), its checks in the order a playthrough reaches them, and the
items that belong to it. The file goes into the game tracker folder whose game.json names that game.
"""
import argparse, glob, json, os, subprocess, sys, tempfile, zipfile

LOGIC_GAMES = {"Stardew Valley", "Borderlands 2", "Spyro 2", "Ocarina of Time", "Pokemon Platinum", "Slay the Spire"}     # games the relay solves exactly (relay/ap_logic.py): the demo fakes it from spheres
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.getcwd())
os.environ.setdefault("SKIP_REQUIREMENTS_UPDATE", "1")
import MultiServer                               # noqa: E402  (needs the Archipelago checkout as the working directory)
from worlds.AutoWorld import AutoWorldRegister   # noqa: E402


def load(path):
    if path.endswith(".zip"):
        with zipfile.ZipFile(path) as z:
            name = next(n for n in z.namelist() if n.endswith(".archipelago"))
            return MultiServer.Context.decompress(z.read(name))
    return MultiServer.Context.decompress(open(path, "rb").read())


def plain(o):
    if hasattr(o, "__dataclass_fields__"): return {k: plain(getattr(o, k)) for k in o.__dataclass_fields__}
    if isinstance(o, dict): return {str(k): plain(v) for k, v in o.items()}
    if isinstance(o, (list, tuple, set, frozenset)): return [plain(x) for x in o]
    if isinstance(o, (str, int, float, bool)) or o is None: return o
    return str(o)


def folders():
    out = {}
    for f in glob.glob(os.path.join(REPO, "tracker/games/*/game.json")):
        meta = json.load(open(f, encoding="utf-8"))
        for g in [meta.get("game")] + list(meta.get("games") or []):
            if g: out[g] = os.path.basename(os.path.dirname(f))
    return out


def write_demos(d, only=None):
    where, tracker_js = folders(), "".join(open(f, encoding="utf-8").read() for f in glob.glob(os.path.join(REPO, "tracker/games/*/tracker.js")))
    order = {}
    for sp in d.get("spheres") or []:
        for s, locs in sp.items():
            order.setdefault(s, []).extend(sorted(locs))
    pool = {}
    for s, locs in d["locations"].items():
        for l, (item, recv, flags) in locs.items():
            pool.setdefault(recv, []).append([item, flags])
    wrote = 0
    for s, info in d["slot_info"].items():
        if info.type != 1 or (only and info.game != only):
            continue
        folder = where.get(info.game)
        if not folder:
            print(f"  {info.game}: no game tracker folder names this game in its game.json, skipped")
            continue
        seen = set(order.get(s, []))
        locs = order.get(s, []) + sorted(l for l in d["locations"][s] if l not in seen)
        spheres = [len(sp.get(s, ())) for sp in d.get("spheres") or []]
        if len(locs) > sum(spheres):
            spheres.append(len(locs) - sum(spheres))
        dp = AutoWorldRegister.world_types[info.game].get_data_package_data()
        sd = {k: v for k, v in plain(d["slot_data"].get(s, {})).items() if len(json.dumps(v)) <= 20000 or k in tracker_js}
        out = {"game": info.game, "name": info.name, "slot_data": sd, "pre": list(d["precollected_items"].get(s, [])),
               "locations": locs, "pool": pool.get(s, []),
               **({"spheres": [n for n in spheres if n]} if info.game in LOGIC_GAMES else {}),
               "datapackage": {"item_name_to_id": dp["item_name_to_id"],
                               "location_name_to_id": {n: i for n, i in dp["location_name_to_id"].items() if i in d["locations"][s]}}}
        dest = os.path.join(REPO, "tracker/games", folder, "demo.json")
        txt = json.dumps(out, separators=(",", ":"))
        with open(dest, "w", encoding="utf-8") as f:
            f.write(txt)
        print(f"  {folder}/demo.json: {info.name} playing {info.game}, {len(locs)} checks, {len(txt) // 1024} KB")
        wrote += 1
    return wrote


def generate(game, yaml_path, name):
    tmp = tempfile.mkdtemp(prefix="demo-")
    players, out = os.path.join(tmp, "players"), os.path.join(tmp, "out")
    os.makedirs(players)
    if yaml_path:
        with open(yaml_path, encoding="utf-8") as f, open(os.path.join(players, "player.yaml"), "w", encoding="utf-8") as g:
            g.write(f.read())
    else:
        with open(os.path.join(players, "player.yaml"), "w", encoding="utf-8") as f:
            f.write(f"name: {name}\ngame: {json.dumps(game)}\n{json.dumps(game)}: {{}}\n")
    print(f"Generating a one-player {game} seed with {'your options' if yaml_path else 'default options'}…")
    r = subprocess.run([sys.executable, "Generate.py", "--player_files_path", players, "--outputpath", out],
                       stdin=subprocess.DEVNULL, capture_output=True, text=True)
    zips = glob.glob(os.path.join(out, "*.zip"))
    if r.returncode or not zips:
        sys.exit("Generation failed:\n" + (r.stdout + r.stderr)[-3000:])
    return zips[0]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("seed", nargs="?", help="an existing seed (.zip or .archipelago): writes a demo file for every game in it")
    ap.add_argument("--game", help="make the demo file for this game (exact name as Archipelago spells it)")
    ap.add_argument("--yaml", help="with --game: use these player options instead of the defaults")
    ap.add_argument("--name", default="Demo", help="with --game: the made-up player's name (default: Demo)")
    a = ap.parse_args()
    if not a.seed and not a.game:
        ap.error("give a seed file or --game")
    path = a.seed or generate(a.game, a.yaml, a.name)
    if not write_demos(load(path), only=a.game if a.seed else None):
        sys.exit("Nothing written.")


main()
