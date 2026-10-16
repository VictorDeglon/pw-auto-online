#!/usr/bin/env python3
"""Microsoft Rocketbox avatars (MIT) -> small GLBs for the browser game.

  python3 tools/humans/build_rocketbox.py <Microsoft-Rocketbox checkout> <FBX2glTF binary> [--player Male_Adult_18] [--resume] [--rebuild A,B] [--clips-only]

Needs from the checkout: Assets/Avatars/{Adults,Professions}/*/Export/<name>.fbx, the *color*.tga and *opacity*.tga
textures, and the animation FBXs listed in CLIPS. (A partial clone works: `git clone --filter=blob:none
--no-checkout`, then `git checkout HEAD -- <those paths>`.)

Writes assets/humans/:
  <Name>.glb        skinned mesh (80-bone 3ds Max Biped, "Bip01 ..." names), body/head colour at 512 px
                    (the player at 1024), hair/lash cards from the opacity map as alpha-masked, double-sided
  anim/<clip>.glb   one animation per file, bones only; every avatar shares the skeleton, so any clip plays on any
                    avatar by bone name
  manifest.json     the roster: name, group, sex, kind (civilian / police / ...), file sizes
Children (Assets/Avatars/Children) are left out on purpose: this is a game where pedestrians get run over and blown up.
"""
import json, os, re, struct, subprocess, sys, io, glob
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'humans')
CLIPS = {  # game clip name -> (folder, file stem) per sex
    'idle': ('static', '{s}_idle_neutral_01'), 'talk': ('static', '{s}_gestic_talk_neutral_01'), 'wave': ('static', '{s}_wave_01'),
    'walk': ('xy', '{s}_walk_neutral_01'), 'run': ('xy', '{s}_run_neutral_01'), 'sprint': ('xy', '{s}_run_fast_01'),
    # crowd life and player emotes
    'crouch': ('static', '{s}_crouch_idle'), 'cheer': ('static', '{s}_cheer_01'), 'dance': ('static', '{s}_dancing_cool'),
    'laugh': ('static', '{s}_gestic_laugh_loud'), 'listen': ('static', '{s}_gestic_listen_accept_01'), 'talk2': ('static', '{s}_gestic_talk_excited_01'),
    'look': ('static', '{s}_idle_look_around_01'),
    'injured': ('xy', '{s}_run_injured'), 'stroll': ('xy', '{s}_walk_stroll_01'),
}

def read_glb(path):
    b = open(path, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + jl])
    o = 20 + jl; bl = struct.unpack('<I', b[o:o + 4])[0] if o < len(b) else 0
    return j, bytearray(b[o + 8:o + 8 + bl]) if bl else bytearray()

def write_glb(path, j, bin_):
    while len(bin_) % 4: bin_.append(0)
    j['buffers'] = [{'byteLength': len(bin_)}]
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
    open(path, 'wb').write(out)

def add_image(j, bin_, data, mime):
    while len(bin_) % 4: bin_.append(0)
    j.setdefault('bufferViews', []).append({'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(data)})
    bin_ += data
    return len(j['bufferViews']) - 1

def tex_for(texdir, mat):
    if not os.path.isdir(texdir): return None
    files = os.listdir(texdir); low = {f.lower(): f for f in files}
    want = mat.lower() + '_color.tga'
    if want in low: return os.path.join(texdir, low[want])
    part = 'opacity' if 'opacity' in mat.lower() else 'head' if 'head' in mat.lower() else 'body'
    for f in files:
        fl = f.lower()
        if part in fl and fl.endswith('.tga') and ('color' in fl or part == 'opacity'): return os.path.join(texdir, f) # e.g. sm024_body_color_acu.tga
    return None

def encode(img, size, alpha):
    im = img.convert('RGBA' if alpha else 'RGB')
    if max(im.size) > size: im = im.resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    if alpha: im.save(buf, 'PNG', optimize=True); return buf.getvalue(), 'image/png'
    im.save(buf, 'JPEG', quality=82, optimize=True); return buf.getvalue(), 'image/jpeg'

def convert(fbx2gltf, fbx, out_stem):
    subprocess.run([fbx2gltf, '-b', '--pbr-metallic-roughness', '-o', out_stem, fbx], check=True, capture_output=True)
    return out_stem + '.glb'

def build_avatar(fbx2gltf, src_dir, name, size):
    fbx = os.path.join(src_dir, 'Export', name + '.fbx')
    glb = convert(fbx2gltf, fbx, os.path.join(OUT, name))
    j, bin_ = read_glb(glb)
    texdir = os.path.join(src_dir, 'Textures')
    j['images'] = []; j['textures'] = []; j['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
    for m in j['materials']:
        pbr = m.setdefault('pbrMetallicRoughness', {}); pbr.pop('baseColorTexture', None)
        pbr['metallicFactor'] = 0.0; pbr['roughnessFactor'] = 0.85; pbr['baseColorFactor'] = [1, 1, 1, 1]
        for k in ('normalTexture', 'occlusionTexture', 'emissiveTexture', 'extensions'): m.pop(k, None)
        t = tex_for(texdir, m['name'])
        if not t: continue
        alpha = 'opacity' in m['name'].lower()
        data, mime = encode(Image.open(t), size // 2 if alpha else size, alpha)
        bv = add_image(j, bin_, data, mime)
        j['images'].append({'bufferView': bv, 'mimeType': mime}); j['textures'].append({'sampler': 0, 'source': len(j['images']) - 1})
        pbr['baseColorTexture'] = {'index': len(j['textures']) - 1}
        if alpha: m['alphaMode'] = 'MASK'; m['alphaCutoff'] = 0.5; m['doubleSided'] = True
    j.pop('animations', None) # the avatar files carry a zero-length "Take 001"
    write_glb(glb, j, bin_)
    return os.path.getsize(glb)

def main():
    if len(sys.argv) < 3: print(__doc__); sys.exit(1)
    rb, fbx2gltf = sys.argv[1], sys.argv[2]
    player = sys.argv[sys.argv.index('--player') + 1] if '--player' in sys.argv else 'Male_Adult_18'
    resume = '--resume' in sys.argv  # keep avatars already built (except the player and any --rebuild names)
    rebuild = set(sys.argv[sys.argv.index('--rebuild') + 1].split(',')) if '--rebuild' in sys.argv else set()
    clips_only = '--clips-only' in sys.argv  # convert the animation clips and update the manifest, keep every avatar
    old = {a['name']: a for a in json.load(open(os.path.join(OUT, 'manifest.json')))['avatars']} if resume and os.path.exists(os.path.join(OUT, 'manifest.json')) else {}
    os.makedirs(os.path.join(OUT, 'anim'), exist_ok=True)
    roster, seen = [], set()
    for group in ('Adults', 'Professions'):
        for d in sorted(glob.glob(os.path.join(rb, 'Assets', 'Avatars', group, '*'))):
            name = os.path.basename(d)
            if name in seen or not os.path.exists(os.path.join(d, 'Export', name + '.fbx')): continue
            seen.add(name)
            out = os.path.join(OUT, name + '.glb')
            if (resume or clips_only) and os.path.exists(out) and name != player and name not in rebuild: size = os.path.getsize(out)
            elif clips_only and os.path.exists(out): size = os.path.getsize(out)
            else: size = build_avatar(fbx2gltf, d, name, 1024 if name == player else 512)
            kind = name.split('_')[0].lower() if group == 'Professions' else 'civilian'
            if kind in ('female', 'male'): kind = 'civilian' # Female_Party_* sit in both folders
            sex = 'f' if '_Female_' in '_' + name + '_' or name.startswith('Female') else 'm'
            roster.append({'name': name, 'group': group, 'sex': sex, 'kind': kind, 'bytes': size})
            print(f'{name:28s} {kind:12s} {size / 1e6:5.2f} MB', flush=True)
    for clip, (folder, stem) in CLIPS.items():
        for s in ('m', 'f'):
            f = os.path.join(rb, 'Assets', 'Animations', f'all_animations_max_motextr_{folder}', stem.format(s=s) + '.max.fbx')
            if not os.path.exists(f): print('missing clip', f); continue
            out = convert(fbx2gltf, f, os.path.join(OUT, 'anim', f'{s}_{clip}'))
            print(f'anim {s}_{clip:8s} {os.path.getsize(out) / 1e6:5.2f} MB', flush=True)
    json.dump({'source': 'Microsoft Rocketbox Avatar Library (MIT), github.com/microsoft/Microsoft-Rocketbox', 'player': player,
               'clips': sorted(CLIPS), 'avatars': roster}, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    print('total', sum(r['bytes'] for r in roster) / 1e6, 'MB in', len(roster), 'avatars')

if __name__ == '__main__': main()
