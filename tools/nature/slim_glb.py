# Slim a near-LOD GLB for the web (what gltf-transform did for the first trees): positions as 16-bit integers
# (KHR_mesh_quantization, the mesh in a child node that scales them back), normals as bytes, AO colours as bytes,
# UVs as 16-bit when they stay in 0..1; tangents and normal maps dropped (the leaves' normals are bent by the
# runtime), images nothing uses any more removed. Geometry comes out about half the size.
#   python slim_glb.py <in.glb> <out.glb>
import json, struct, sys
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
raw = open(src, 'rb').read()
jl = struct.unpack('<I', raw[12:16])[0]
J = json.loads(raw[20:20 + jl])
B = raw[28 + jl:28 + jl + struct.unpack('<I', raw[20 + jl:24 + jl])[0]]

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

def read(ai):
    a = J['accessors'][ai]; v = J['bufferViews'][a['bufferView']]; t = CT[a['componentType']]; n = NC[a['type']]
    es = np.dtype(t).itemsize * n; stride = v.get('byteStride') or es; off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    out = np.empty((a['count'], n), t)
    for i in range(a['count']): out[i] = np.frombuffer(B, t, n, off + i * stride)
    if a.get('normalized'):
        out = out.astype(np.float32) / {np.int8: 127, np.uint8: 255, np.int16: 32767, np.uint16: 65535}[t]
        if t in (np.int8, np.int16): out = np.maximum(out, -1)
    return out

def read_fast(ai):  # tightly packed (no stride) is the usual case
    a = J['accessors'][ai]; v = J['bufferViews'][a['bufferView']]; t = CT[a['componentType']]; n = NC[a['type']]
    es = np.dtype(t).itemsize * n
    if v.get('byteStride') and v['byteStride'] != es: return read(ai)
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    out = np.frombuffer(B, t, a['count'] * n, off).reshape(-1, n)
    if a.get('normalized'):
        out = out.astype(np.float32) / {np.int8: 127, np.uint8: 255, np.int16: 32767, np.uint16: 65535}[t]
        if t in (np.int8, np.int16): out = np.maximum(out, -1)
    return out

new_bin = bytearray(); views, accs = [], []
def put(arr, stride=None, target=None):
    while len(new_bin) % 4: new_bin.append(0)
    v = {'buffer': 0, 'byteOffset': len(new_bin), 'byteLength': arr.nbytes}
    if stride: v['byteStride'] = stride
    if target: v['target'] = target
    new_bin.extend(arr.tobytes()); views.append(v); return len(views) - 1
def acc(view, ctype, typ, count, normalized=False, mn=None, mx=None):
    a = {'bufferView': view, 'componentType': ctype, 'type': typ, 'count': count}
    if normalized: a['normalized'] = True
    if mn is not None: a['min'] = [float(x) for x in mn]; a['max'] = [float(x) for x in mx]
    accs.append(a); return len(accs) - 1

# images first (kept as they are, dropped later if unused)
img_view = {}
for ii, im in enumerate(J.get('images', [])):
    if 'bufferView' in im:
        v = J['bufferViews'][im['bufferView']]; data = np.frombuffer(B, np.uint8, v['byteLength'], v.get('byteOffset', 0)).copy()
        img_view[ii] = data

# meshes: one dequantize transform per mesh (uniform scale, so normals aren't skewed)
mesh_xf = {}
for mi, m in enumerate(J['meshes']):
    P = np.concatenate([read_fast(p['attributes']['POSITION']) for p in m['primitives']]).astype(np.float64)
    lo, hi = P.min(0), P.max(0); c = (lo + hi) / 2; s = float(max((hi - lo).max() / 2, 1e-6))
    mesh_xf[mi] = (c, s)
    for p in m['primitives']:
        at = p['attributes']; na = {}
        q = np.round((read_fast(at['POSITION']).astype(np.float64) - c) / s * 32767).clip(-32767, 32767).astype(np.int16)
        q4 = np.zeros((len(q), 4), np.int16); q4[:, :3] = q
        na['POSITION'] = acc(put(q4, 8, 34962), 5122, 'VEC3', len(q), True, q.min(0), q.max(0))
        if 'NORMAL' in at:
            n = read_fast(at['NORMAL']).astype(np.float32); n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-8)
            n4 = np.zeros((len(n), 4), np.int8); n4[:, :3] = np.round(n * 127).clip(-127, 127)
            na['NORMAL'] = acc(put(n4, 4, 34962), 5120, 'VEC3', len(n), True)
        if 'TEXCOORD_0' in at:
            uv = read_fast(at['TEXCOORD_0']).astype(np.float32)
            if uv.min() >= 0 and uv.max() <= 1: na['TEXCOORD_0'] = acc(put(np.round(uv * 65535).astype(np.uint16), 4, 34962), 5123, 'VEC2', len(uv), True)
            else: na['TEXCOORD_0'] = acc(put(np.ascontiguousarray(uv), None, 34962), 5126, 'VEC2', len(uv))
        if 'COLOR_0' in at:
            col = read_fast(at['COLOR_0']).astype(np.float32); c4 = np.full((len(col), 4), 255, np.uint8); c4[:, :col.shape[1]] = np.round(col.clip(0, 1) * 255)
            na['COLOR_0'] = acc(put(c4, None, 34962), 5121, 'VEC4', len(col), True)
        if 'indices' in p:
            ix = read_fast(p['indices']).reshape(-1); ix = ix.astype(np.uint16 if ix.max() < 65535 else np.uint32)
            p['indices'] = acc(put(ix, None, 34963), 5123 if ix.dtype == np.uint16 else 5125, 'SCALAR', len(ix))
        p['attributes'] = na

# materials: no normal maps (no tangents either)
for mt in J.get('materials', []): mt.pop('normalTexture', None)
# textures and images still referenced (the material slots Blender writes)
def tex_refs(mt):
    pbr = mt.get('pbrMetallicRoughness', {})
    return [r for r in [pbr.get('baseColorTexture'), pbr.get('metallicRoughnessTexture'), mt.get('occlusionTexture'), mt.get('emissiveTexture')] if r]
refs = [r for mt in J.get('materials', []) for r in tex_refs(mt)]
used_tex = sorted({r['index'] for r in refs})
tex_map = {o: n for n, o in enumerate(used_tex)}; textures = [dict(J['textures'][o]) for o in used_tex]
for r in refs: r['index'] = tex_map[r['index']]
used_img = sorted({t['source'] for t in textures if 'source' in t})
img_map = {o: n for n, o in enumerate(used_img)}
images = []
for o in used_img:
    im = dict(J['images'][o])
    if o in img_view: im['bufferView'] = put(img_view[o])
    images.append(im)
for t in textures:
    if 'source' in t: t['source'] = img_map[t['source']]
J['textures'] = textures; J['images'] = images

# nodes: the mesh moves into a child node carrying the dequantize transform
nodes = J['nodes']
for ni in range(len(nodes)):
    nd = nodes[ni]
    if 'mesh' not in nd: continue
    c, s = mesh_xf[nd['mesh']]
    child = {'mesh': nd.pop('mesh'), 'translation': [float(x) for x in c], 'scale': [s, s, s]}
    nodes.append(child); nd.setdefault('children', []).append(len(nodes) - 1)

J['accessors'] = accs; J['bufferViews'] = views
J['buffers'] = [{'byteLength': len(new_bin)}]
for k in ('extensionsUsed', 'extensionsRequired'):
    J[k] = sorted(set(J.get(k, [])) | {'KHR_mesh_quantization'})
while len(new_bin) % 4: new_bin.append(0)
js = json.dumps(J, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(new_bin)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(new_bin), 0x004E4942) + bytes(new_bin)
open(dst, 'wb').write(out)
print(src.split('/')[-1], len(raw) // 1024, '->', len(out) // 1024, 'KB')
