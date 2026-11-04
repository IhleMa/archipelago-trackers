"""Turn a generated Archipelago seed into the tracker demo (tracker/demo/demo.json).

Generate a multiworld with the players you want in the demo (one per game tracker you want to see),
then run this from an Archipelago source checkout that has the same worlds installed:

    cd path/to/Archipelago
    python /path/to/this/repo/tools/make_demo.py output/AP_12345.zip

It writes tracker/demo/demo.json in this repo. Open the tracker with ?demo to see it.
To keep the file small, only the locations that are in the seed are kept, and large slot_data
entries are dropped unless a game tracker's tracker.js mentions them by name.
"""
import glob, gzip, json, os, sys, zipfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.getcwd())
os.environ.setdefault("SKIP_REQUIREMENTS_UPDATE", "1")
import MultiServer                          # noqa: E402  (needs the Archipelago checkout on the path)
from worlds.AutoWorld import AutoWorldRegister  # noqa: E402


def load(path):
    if path.endswith(".zip"):
        with zipfile.ZipFile(path) as z:
            name = next(n for n in z.namelist() if n.endswith(".archipelago"))
            return MultiServer.Context.decompress(z.read(name))
    return MultiServer.Context.decompress(open(path, "rb").read())


def plain(o):
    if isinstance(o, dict): return {str(k): plain(v) for k, v in o.items()}
    if isinstance(o, (list, tuple, set, frozenset)): return [plain(x) for x in o]
    if isinstance(o, (str, int, float, bool)) or o is None: return o
    return str(o)


def main():
    if len(sys.argv) < 2: sys.exit(__doc__)
    d = load(sys.argv[1])
    used_names = "".join(open(f, encoding="utf-8").read() for f in glob.glob(os.path.join(REPO, "tracker/games/*/tracker.js")))
    slots, used_locs = {}, {}
    for s, info in d["slot_info"].items():
        if info.type != 1: continue          # skip item link groups and spectators
        sd = plain(d["slot_data"].get(s, {}))
        sd = {k: v for k, v in sd.items() if len(json.dumps(v)) <= 20000 or k in used_names}
        locs = [[l, v[0], v[1], v[2]] for l, v in sorted(d["locations"][s].items())]
        used_locs.setdefault(info.game, set()).update(l[0] for l in locs)
        slots[str(s)] = {"name": info.name, "game": info.game, "slot_data": sd, "locs": locs,
                         "pre": list(d["precollected_items"].get(s, []))}
    dp = {}
    for g in sorted(set(used_locs) | {"Archipelago"}):
        p = AutoWorldRegister.world_types[g].get_data_package_data()
        keep = used_locs.get(g)
        dp[g] = {"item_name_to_id": p["item_name_to_id"],
                 "location_name_to_id": {n: i for n, i in p["location_name_to_id"].items() if keep is None or i in keep}}
    spheres = [{str(s): sorted(l) for s, l in sp.items() if l and str(s) in slots} for sp in d.get("spheres") or []]
    out = {"seed": d["seed_name"], "hint_cost": d["server_options"].get("hint_cost", 10),
           "datapackage": dp, "slots": slots, "spheres": spheres}
    txt = json.dumps(out, separators=(",", ":"))
    dest = os.path.join(REPO, "tracker/demo/demo.json")
    with open(dest, "w", encoding="utf-8") as f: f.write(txt)
    print(f"wrote {dest}: {len(slots)} players, {len(txt) // 1024} KB ({len(gzip.compress(txt.encode())) // 1024} KB gzipped)")
    for s in slots.values(): print(f"  {s['name']}: {s['game']}, {len(s['locs'])} checks")


main()
