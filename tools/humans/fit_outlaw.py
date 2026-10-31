# Fits a rigged character from Sketchfab for the game's people (Blender, no window):
#   blender -b --factory-startup --python tools/humans/fit_outlaw.py -- <in.glb> <out.glb> '<opts json>' <report.json> [preview.png]
# opts: height (metres, default 1.78), tris (default 18000), tex (largest texture side, default 1024)
#
# The game animates everyone with the Rocketbox clips (assets/humans/anim, an 80-bone 3ds Max Biped). A downloaded
# character has a rig of its own (Mixamo, Unreal, Rigify, Character Creator, ...). Here its main bones are renamed to
# the Biped's names (pelvis, spine, neck, head, clavicles, arms, hands, legs, feet, toes), so everything in the game that
# finds a bone by name (weapons in the right hand, hands up, the ragdoll poses) works on it unchanged; src/humans.js then
# re-aims the Rocketbox clips onto its own rest pose at load (retarget). Fingers, face and extra bones keep their names.
# The model comes out at its real height in metres, standing on y = 0, facing +z, with WebP textures and no animations
# of its own. The report lists the bone map, so a bad match shows up before the game does.
import bpy, sys, json, re
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, DST, OPT, REP = argv[0], argv[1], json.loads(argv[2]), argv[3]
PREV = argv[4] if len(argv) > 4 else None
warn = []

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
for o in list(bpy.data.objects):
    if o.type in ('CAMERA', 'LIGHT', 'LIGHT_PROBE', 'SPEAKER'): bpy.data.objects.remove(o)

def meshes(): return [o for o in bpy.data.objects if o.type == 'MESH']
def select(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)
def wverts(o):
    m = o.matrix_world; return [m @ v.co for v in o.data.vertices]
def bbox(objs):
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for p in wverts(o):
            for k in range(3): lo[k] = min(lo[k], p[k]); hi[k] = max(hi[k], p[k])
    return lo, hi
def tris(objs): return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)

# ---------------------------------------------------------------- the rig: the armature that deforms the most vertices
arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
if not arms: raise SystemExit('no armature: not a rigged character')
def deforms(a): return sum(len(m.data.vertices) for m in meshes() if any(md.type == 'ARMATURE' and md.object == a for md in m.modifiers))
arm = max(arms, key=deforms)
for o in meshes(): # props and weapons that the rig doesn't move: gone (the game gives people their own guns)
    if not any(md.type == 'ARMATURE' and md.object == arm for md in o.modifiers) and o.parent_type != 'BONE':
        warn.append(f'dropped unrigged mesh {o.name}'); bpy.data.objects.remove(o)
for a in arms:
    if a is not arm: bpy.data.objects.remove(a)
bpy.ops.object.select_all(action='DESELECT')
for act in list(bpy.data.actions): bpy.data.actions.remove(act)
if arm.animation_data: arm.animation_data_clear()
arm.data.pose_position = 'REST'

# ---------------------------------------------------------------- which bone is which
def norm(n):
    n = n.split(':')[-1]  # mixamorig:LeftArm
    n = re.sub(r'_\d+$', '', n)  # Sketchfab numbers every node: hip_02, spine_01_03
    n = re.sub(r'^(DEF|ORG|MCH)[-_.]', '', n)
    n = re.sub(r'^(CC_Base_|Bip0?0?1[ _]?|rp_[a-z0-9]+_|Armature_?|Character1_|c_|j_|b_|bone_?)', '', n, flags=re.I)
    return n.lower()
def side(n, head):
    s = norm(n)
    if re.search(r'(^|[ _.\-])l([ _.\-]|$)|left|_l$|\.l$|^l(?=[A-Z])', n) or re.search(r'(^|[ _.\-])l([ _.\-]|$)|left', s): return 'L'
    if re.search(r'(^|[ _.\-])r([ _.\-]|$)|right|_r$|\.r$|^r(?=[A-Z])', n) or re.search(r'(^|[ _.\-])r([ _.\-]|$)|right', s): return 'R'
    return None
ROLE = [ # (role, regex on the normalized name), first match wins
    ('toe', r'toe(?!.*end)|ball'), ('foot', r'foot|ankle'),
    ('thigh', r'thigh|up_?leg|upper_?leg'),
    ('calf', r'calf|shin|knee|lower_?leg|(^|[_ .])leg($|[_ .])|^(left|right)?leg$|leg_?(l|r)?$'),
    ('hand', r'hand(?!.*(index|thumb|middle|ring|pinky|finger))|wrist'),
    ('forearm', r'fore_?arm|lower_?arm|elbow'),
    ('upperarm', r'upper_?arm|(^|[_ .])arm($|[_ .])|^(left|right)?arm$|arm_?(l|r)?$'),
    ('clavicle', r'clavicle|shoulder|collar'),
    ('head', r'^head$|head(?!.*(end|top|nub))'), ('neck', r'neck'),
    ('pelvis', r'^hips?$|^hip$|pelvis|^root_?hips'),
    ('spine', r'spine|chest|torso|abdomen|back'),
]
BIP = { 'pelvis': 'Bip01 Pelvis', 'neck': 'Bip01 Neck', 'head': 'Bip01 Head' }
SIDED = { 'clavicle': 'Clavicle', 'upperarm': 'UpperArm', 'forearm': 'Forearm', 'hand': 'Hand', 'thigh': 'Thigh', 'calf': 'Calf', 'foot': 'Foot', 'toe': 'Toe0' }
bones = arm.data.bones
def finger(n): return re.search(r'index|thumb|middle|ring|pinky|finger|digit|metacarp', norm(n))
found = {}  # role key -> bone name
for b in bones:
    n = norm(b.name)
    if finger(b.name) or re.search(r'end$|_end|nub|tip|twist|roll|ik|pole|target|ctrl|helper|jiggle|breast|eye|jaw|tongue|teeth|brow|lip|cheek|hair|cloth|cape|coat|skirt', n): continue
    for role, rx in ROLE:
        if re.search(rx, n):
            if role in SIDED:
                sd = side(b.name, b.head_local)
                if not sd: # no side in the name: by where it sits (the character faces -y in Blender, its left is +x)
                    sd = 'L' if b.head_local.x > 0.01 else 'R' if b.head_local.x < -0.01 else None
                if sd: found.setdefault(f'{sd}_{role}', b.name)
            elif role == 'spine': found.setdefault('spines', []).append(b.name)
            else: found.setdefault(role, b.name)
            break
# the spine: the bones between the pelvis and the neck, in order, onto Spine, Spine1, Spine2
if 'pelvis' not in found:  # the topmost bone with two leg chains under it
    for b in bones:
        if b.parent is None or len(b.children) >= 3: found['pelvis'] = b.name; break
chain = []
if 'neck' in found or 'head' in found:
    top = bones[found.get('neck') or found['head']]
    p = top.parent
    while p and p.name != found.get('pelvis'):
        chain.append(p.name); p = p.parent
    chain.reverse()
spine_names = ['Bip01 Spine', 'Bip01 Spine1', 'Bip01 Spine2']
spmap = {}
if chain:
    if len(chain) <= 3: picks = chain
    else: picks = [chain[0], chain[len(chain) // 2], chain[-1]]
    for i, n in enumerate(picks): spmap[n] = spine_names[i]
rename = {}
for k, v in found.items():
    if k == 'spines': continue
    if k in BIP: rename[v] = BIP[k]
    else:
        sd, role = k.split('_', 1); rename[v] = f'Bip01 {sd} {SIDED[role]}'
rename.update(spmap)
need = ['Bip01 Pelvis', 'Bip01 Head', 'Bip01 L UpperArm', 'Bip01 R UpperArm', 'Bip01 L Forearm', 'Bip01 R Forearm', 'Bip01 L Hand', 'Bip01 R Hand', 'Bip01 L Thigh', 'Bip01 R Thigh', 'Bip01 L Calf', 'Bip01 R Calf', 'Bip01 L Foot', 'Bip01 R Foot']
missing = [n for n in need if n not in rename.values()]
if missing: warn.append('missing bones: ' + ', '.join(missing))
# names already taken by other bones (a rig that happens to use Biped names) move aside first
for b in bones:
    if b.name in rename.values() and b.name not in rename: b.name = b.name + '_x'
old_to_new = {}
for old, new in rename.items():
    b = bones.get(old)
    if b: b.name = new; old_to_new[old] = new
for o in meshes(): # vertex groups follow the bones' new names
    for vg in o.vertex_groups:
        if vg.name in old_to_new: vg.name = old_to_new[vg.name]

# ---------------------------------------------------------------- size, facing, decimate, textures
ms = meshes()
lo, hi = bbox(ms); hgt = hi[2] - lo[2]
want = OPT.get('height', 1.78)
s = want / hgt if hgt > 0 else 1
# facing: the toes point forward; Blender's glTF exporter turns -y into the game's +z
ft = arm.data.bones.get('Bip01 L Foot'); toe = arm.data.bones.get('Bip01 L Toe0')
mw = arm.matrix_world
if ft and toe:
    d = (mw @ toe.head_local) - (mw @ ft.head_local)
    face = Vector((d.x, d.y, 0)).normalized()
else: face = Vector((0, -1, 0))
import math
ang = math.atan2(face.x, -face.y)  # rotation about z that turns `face` into -y
root = bpy.data.objects.new('root', None); scene.collection.objects.link(root)
for o in [o for o in bpy.data.objects if o.parent is None and o is not root]: o.parent = root
c = (lo + hi) / 2
root.rotation_euler = (0, 0, -ang)
root.scale = (s, s, s)
bpy.context.view_layer.update()
lo2, hi2 = bbox(meshes()); c2 = (lo2 + hi2) / 2
root.location = (-c2[0], -c2[1], -lo2[2])
bpy.context.view_layer.update()
total = tris(ms); r = max(0.05, min(1, OPT.get('tris', 18000) / max(1, total)))
for o in ms:
    if r < 1 and len(o.data.polygons) > 200 and not o.data.shape_keys:
        m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = r
        select([o]); bpy.ops.object.modifier_move_to_index(modifier=m.name, index=0)
        bpy.ops.object.modifier_apply(modifier=m.name)
for im in bpy.data.images:
    if not im.size[0] or not im.users: continue
    w, h = im.size; k = OPT.get('tex', 1024) / max(w, h)
    if k < 1:
        try: im.scale(max(4, int(w * k)), max(4, int(h * k)))
        except Exception as e: warn.append(f'texture {im.name}: {e}')
for mat in bpy.data.materials: # no see-through skin: alpha blend becomes a cut-out
    if mat.blend_method == 'BLEND': mat.blend_method = 'CLIP'

bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_image_format='WEBP', export_image_quality=82, export_apply=False,
    export_animations=False, export_cameras=False, export_lights=False, export_extras=False, export_yup=True, export_skins=True)
lo3, hi3 = bbox(meshes())
rep = { 'H': round((hi3[2] - lo3[2]), 3), 'tris': tris(meshes()), 'map': old_to_new, 'warn': warn, 'bones': len(arm.data.bones) }
json.dump(rep, open(REP, 'w'), indent=1)
if PREV:
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
    target = Vector((0, 0, want * 0.55)); cam.location = target + Vector((0.35, -1, 0.15)).normalized() * want * 2.2
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 50
    scene.render.engine = 'BLENDER_WORKBENCH'; scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'TEXTURE'
    scene.render.resolution_x, scene.render.resolution_y = 240, 320; scene.render.filepath = PREV; bpy.ops.render.render(write_still=True)
print('FIT_OK', json.dumps({ k: rep[k] for k in ('H', 'tris', 'bones') }), 'missing:', missing)
