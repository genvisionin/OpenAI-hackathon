"""Bake OpenStreetMap data around Big Ben into game-ready JSON.
usage: python bake_osm.py osm.json out.json
Coordinates: metres, origin = Elizabeth Tower, +x east, -z north."""
import json, sys, math, base64, random
from shapely.geometry import Polygon, LineString, Point, box, MultiPolygon
from shapely.ops import polygonize, unary_union
from shapely import prepared

src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src))
for extra in sys.argv[3:]:
    d['elements'] += json.load(open(extra))['elements']
LAT0, LON0 = 51.500729, -0.124625
KX = math.cos(math.radians(LAT0)) * 111320.0
KZ = 110540.0
def P(g): return (round((g['lon'] - LON0) * KX, 2), round(-(g['lat'] - LAT0) * KZ, 2))

X0, X1, Z0, Z1 = -700, 700, -600, 600
BOUNDS = box(X0, Z0, X1, Z1)
random.seed(7)

WIDTH = {'trunk': 16, 'primary': 14, 'secondary': 12, 'tertiary': 10, 'residential': 8,
         'unclassified': 8, 'service': 5, 'pedestrian': 7}
GOTHIC = ('Parliament', 'Westminster Hall', 'Abbey', 'Jewel Tower', "St Margaret", 'Westminster School', 'Lords', 'Commons')

buildings, roads, grass, water_polys = [], [], [], []
special = {}
for e in d['elements']:
    t = e.get('tags', {})
    if e['type'] == 'way' and 'geometry' in e:
        pts = [P(g) for g in e['geometry']]
        name = t.get('name', '')
        if 'building' in t and len(pts) >= 4:
            try:
                poly = Polygon(pts).buffer(0)
            except Exception:
                continue
            if poly.is_empty or not poly.intersects(BOUNDS):
                continue
            poly = poly.intersection(BOUNDS)
            if poly.geom_type != 'Polygon' or poly.area < 12:
                continue
            c = poly.centroid
            if name in ('Elizabeth Tower', 'Victoria Tower', 'London Eye'):
                special[name] = [round(c.x, 2), round(c.y, 2)]
                continue
            if t.get('building') in ('air_shaft', 'roof', 'canopy', 'kiosk') and poly.area < 60:
                continue
            h = None
            try:
                h = float(str(t.get('height', '')).replace('m', ''))
            except ValueError:
                pass
            if not h and t.get('building:levels'):
                try: h = float(t['building:levels']) * 3.6 + 1.5
                except ValueError: pass
            if not h:
                h = 12 + random.random() * 14 if poly.area > 200 else 6 + random.random() * 6
            kind = 'gothic' if any(k in name for k in GOTHIC) else random.choice(['stone', 'stone', 'brick', 'georgian', 'cream', 'glass'] if h < 40 else ['glass', 'stone', 'cream'])
            ring = [[round(x, 2), round(z, 2)] for x, z in list(poly.exterior.coords)[:-1]]
            buildings.append({'p': ring, 'h': round(h, 1), 'k': kind, **({'n': name} if name else {})})
        elif 'highway' in t and t['highway'] in WIDTH and len(pts) >= 2:
            ls = LineString(pts)
            if not ls.intersects(BOUNDS): continue
            w = WIDTH[t['highway']]
            try:
                if t.get('lanes'): w = max(w, int(t['lanes']) * 3.4)
            except ValueError: pass
            if t.get('layer', '0').startswith('-'): continue  # underpasses
            roads.append({'p': [list(p) for p in pts], 'w': w, 'hw': t['highway'],
                          'n': t.get('name', ''), 'b': 1 if t.get('bridge') == 'yes' else 0,
                          'o': 1 if t.get('oneway') == 'yes' else 0})
        elif (t.get('leisure') == 'park' or t.get('landuse') == 'grass') and len(pts) >= 4:
            poly = Polygon(pts).buffer(0)
            if poly.intersects(BOUNDS) and poly.area > 50:
                poly = poly.intersection(BOUNDS)
                for g in (poly.geoms if hasattr(poly, 'geoms') else [poly]):
                    if g.geom_type == 'Polygon':
                        grass.append([[round(x, 2), round(z, 2)] for x, z in list(g.exterior.coords)[:-1]])
    elif e['type'] == 'relation' and 'building' in t:
        outer = [LineString([P(g) for g in m['geometry']]) for m in e['members'] if m.get('role') == 'outer' and 'geometry' in m]
        inner = [LineString([P(g) for g in m['geometry']]) for m in e['members'] if m.get('role') == 'inner' and 'geometry' in m]
        polys = list(polygonize(unary_union(outer))) if outer else []
        holes = unary_union(list(polygonize(unary_union(inner)))) if inner else None
        name = t.get('name', '')
        lv = t.get('building:levels'); ht = t.get('height')
        try: h = float(ht) if ht else (float(lv) * 3.6 + 1.5 if lv else 18)
        except ValueError: h = 18
        if name == 'Palace of Westminster': h = 30
        for poly in polys:
            if holes is not None: poly = poly.difference(holes)
            poly = poly.intersection(BOUNDS)
            for g in (poly.geoms if hasattr(poly, 'geoms') else [poly]):
                if g.geom_type != 'Polygon' or g.area < 12: continue
                kind = 'gothic' if (name == 'Palace of Westminster' or any(k in name for k in GOTHIC)) else random.choice(['stone', 'cream', 'georgian'])
                ring = [[round(x, 2), round(z, 2)] for x, z in list(g.exterior.coords)[:-1]]
                hl = [[[round(x, 2), round(z, 2)] for x, z in list(i.coords)[:-1]] for i in g.interiors]
                buildings.append({'p': ring, 'h': round(h, 1), 'k': kind, **({'n': name} if name else {}), **({'holes': hl} if hl else {})})
    elif e['type'] == 'relation' and t.get('natural') == 'water' and t.get('water') == 'river':
        lines = [LineString([P(g) for g in m['geometry']]) for m in e['members'] if m.get('role') == 'outer' and 'geometry' in m]
        for poly in polygonize(unary_union(lines)):
            water_polys.append(poly)

river = unary_union(water_polys).intersection(BOUNDS.buffer(200))
river = river.simplify(1.0)
river_rings = []
for g in (river.geoms if hasattr(river, 'geoms') else [river]):
    if g.area > 500:
        river_rings.append([[round(x, 2), round(z, 2)] for x, z in list(g.exterior.coords)[:-1]])

def R(c): return [[round(x, 2), round(z, 2)] for x, z in list(c)[:-1]]
land = BOUNDS.difference(river)
land_polys = [{'p': R(g.exterior.coords), 'holes': [R(i.coords) for i in g.interiors]} for g in (land.geoms if hasattr(land, 'geoms') else [land]) if g.area > 100]
rc = river.intersection(BOUNDS)
river_clip = [R(g.exterior.coords) for g in (rc.geoms if hasattr(rc, 'geoms') else [rc]) if g.area > 500]

# Collision / terrain mask: 0 land, 1 water, 2 building, 3 bridge deck
CELL = 2.0
W, H = int((X1 - X0) / CELL), int((Z1 - Z0) / CELL)
mask = bytearray(W * H)
bridges = unary_union([LineString(r['p']).buffer(r['w'] / 2 + 2.5, cap_style=2) for r in roads if r['b']])
riv_p, br_p = prepared.prep(river), prepared.prep(bridges)
bpolys = unary_union([Polygon(b['p'], b.get('holes', [])).buffer(0) for b in buildings])
bld_p = prepared.prep(bpolys)
for j in range(H):
    z = Z0 + (j + 0.5) * CELL
    for i in range(W):
        x = X0 + (i + 0.5) * CELL
        pt = Point(x, z)
        v = 0
        if riv_p.contains(pt): v = 3 if br_p.contains(pt) else 1
        elif bld_p.contains(pt): v = 2
        mask[j * W + i] = v
# extra landmark blockers (hand-modelled)
def block_rect(cx, cz, hw, hd, v=2):
    for j in range(int((cz - hd - Z0) / CELL), int((cz + hd - Z0) / CELL) + 1):
        for i in range(int((cx - hw - X0) / CELL), int((cx + hw - X0) / CELL) + 1):
            if 0 <= i < W and 0 <= j < H: mask[j * W + i] = v
for k in ('Elizabeth Tower', 'Victoria Tower'):
    if k in special: block_rect(*special[k], 7, 7)

data = {'origin': [LAT0, LON0], 'bounds': [X0, X1, Z0, Z1], 'special': special,
        'buildings': buildings, 'roads': roads, 'grass': grass, 'river': river_clip, 'land': land_polys,
        'mask': {'cell': CELL, 'w': W, 'h': H, 'x0': X0, 'z0': Z0, 'data': base64.b64encode(bytes(mask)).decode()}}
json.dump(data, open(out, 'w'), separators=(',', ':'))
print('buildings', len(buildings), 'roads', len(roads), 'grass', len(grass), 'river rings', len(river_rings), 'special', special)
