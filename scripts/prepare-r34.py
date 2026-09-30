"""Lossless runtime rig for the user-supplied R34 GLB (requires numpy/Pillow).

Usage: python scripts/prepare-r34.py /path/to/original.glb
The input is never changed. No decimation, welding, or texture resampling.
Static primitives are batched by material within each independently moving part.
Only unreferenced UV sets and empty export hierarchy nodes are omitted.
"""
from collections import defaultdict
from pathlib import Path
import copy
import hashlib
import io
import json
import struct
import sys

import numpy as np
from PIL import Image

SOURCE = Path(sys.argv[1])
OUT = Path(__file__).resolve().parents[1] / 'public/models/r34'
EXPECTED_SHA = '2fd291ab05364064d1dbcad0ae3aed96a2418625ef445cf00b44389c281db467'
raw = SOURCE.read_bytes()
assert hashlib.sha256(raw).hexdigest() == EXPECTED_SHA, 'This adapter is for the inspected original R34.'
assert struct.unpack_from('<III', raw) == (0x46546c67, 2, len(raw))
json_size = struct.unpack_from('<I', raw, 12)[0]
src = json.loads(raw[20:20+json_size])
binary = raw[28+json_size:]
nodes = src['nodes']
parent = {child: i for i, node in enumerate(nodes) for child in node.get('children', [])}
worlds = {}
DTYPES = {5121: '<u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
WIDTHS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def array(index):
    a = src['accessors'][index]
    view = src['bufferViews'][a['bufferView']]
    dtype, width = np.dtype(DTYPES[a['componentType']]), WIDTHS[a['type']]
    return np.ndarray((a['count'], width), dtype=dtype, buffer=binary,
                      offset=view.get('byteOffset', 0)+a.get('byteOffset', 0),
                      strides=(view.get('byteStride', dtype.itemsize*width), dtype.itemsize)).copy()


def world(index):
    if index in worlds:
        return worlds[index]
    node = nodes[index]
    if 'matrix' in node:
        m = np.array(node['matrix']).reshape((4, 4), order='F')
    else:
        x, y, z, w = node.get('rotation', [0, 0, 0, 1])
        m = np.eye(4)
        m[:3, :3] = np.array([
            [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
            [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
            [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]]) @ np.diag(node.get('scale', [1, 1, 1]))
        m[:3, 3] = node.get('translation', [0, 0, 0])
    worlds[index] = (world(parent[index]) if index in parent else np.eye(4)) @ m
    return worlds[index]


def descendants(index):
    yield index
    for child in nodes[index].get('children', []):
        yield from descendants(child)


def points(index):
    for child in descendants(index):
        if 'mesh' in nodes[child]:
            for primitive in src['meshes'][nodes[child]['mesh']]['primitives']:
                p = array(primitive['attributes']['POSITION'])
                yield p @ world(child)[:3, :3].T + world(child)[:3, 3]


# Source +Z faces forward. The runtime uses +Y up and -Z forward.
# The original's arbitrary root scaling is normalized using a 2.665 m wheelbase.
wheel_nodes = [1015, 1933, 2850, 3494]
caliper_nodes = [80, 161, 242, 323]
pivots = np.array([world(i)[:3, 3] for i in wheel_nodes])
scale = 2.665 / (pivots[0, 2]-pivots[2, 2])
axis_change = np.diag([-1., 1., -1.])
source_floor = min(p[:, 1].min() for i in wheel_nodes for p in points(i))
center = np.array([0., source_floor, (pivots[0, 2]+pivots[2, 2])/2])
wheel_positions = (pivots-center) @ axis_change.T * scale
mount_rotations = []
wheel_radii = []
for i, index in enumerate(wheel_nodes):
    axle = axis_change @ world(index)[:3, 0]
    axle /= np.linalg.norm(axle)
    if axle[0] < 0:
        axle *= -1
    camber = np.arctan2(axle[1], axle[0])
    c, s = np.cos(camber), np.sin(camber)
    mount_rotations.append(np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]]))
    local = np.concatenate([(p-pivots[i]) @ axis_change.T * scale @ mount_rotations[i] for p in points(index)])
    # Radial extent around the actual axle, not an AABB corner approximation.
    wheel_radii.append(float(np.max(np.linalg.norm(local[:, 1:3], axis=1))))

roles = {}
for i in range(4):
    for index in descendants(wheel_nodes[i]):
        roles[index] = ('Wheel'+str(i), i)
    for index in descendants(caliper_nodes[i]):
        roles[index] = ('Caliper'+str(i), i)

materials = copy.deepcopy(src['materials'])
textures, texture_map = [], {}
for i, texture in enumerate(src['textures']):
    if texture not in textures:
        textures.append(copy.deepcopy(texture))
    texture_map[i] = textures.index(texture)


def remap_textures(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key.endswith('Texture') and isinstance(item, dict):
                item['index'] = texture_map[item['index']]
            else:
                remap_textures(item)
    elif isinstance(value, list):
        for item in value:
            remap_textures(item)


remap_textures(materials)

# The supplied export has saturated green/blue factors on untextured wheel
# submaterials (including the tire). All use the original wheel atlas UVs.
# Restore that embedded atlas from the correctly textured wheel submaterial;
# never recolour the body or replace the original wheel geometry.
wheel_material_repairs = []
wheel_atlas = copy.deepcopy(materials[6]['pbrMetallicRoughness']['baseColorTexture'])
for material_index in range(3, 14):
    pbr = materials[material_index]['pbrMetallicRoughness']
    if 'baseColorTexture' not in pbr:
        wheel_material_repairs.append({'material': material_index, 'name': materials[material_index]['name'],
                                       'originalBaseColorFactor': pbr.get('baseColorFactor')})
        pbr['baseColorTexture'] = copy.deepcopy(wheel_atlas)
        pbr['baseColorFactor'] = [1, 1, 1, 1]


def lamp_material(source, name, color=None, textured=True):
    material = copy.deepcopy(materials[source])
    material['name'] = name
    material['emissiveFactor'] = color or [1, 1, 1]
    material.setdefault('extensions', {}).pop('KHR_materials_transmission', None)
    material['extensions'].pop('KHR_materials_emissive_strength', None)
    if not textured:
        material.pop('emissiveTexture', None)
    materials.append(material)
    return len(materials)-1


head = lamp_material(27, 'LightHead')
tail = lamp_material(27, 'LightTail', [1, .02, .008])
stop = lamp_material(27, 'LightStop', [1, .02, .008])
reverse = lamp_material(27, 'LightReverse', [.8, .88, 1], False)
reverse_lens = lamp_material(34, 'LightReverseLens', [.8, .88, 1], False)
materials[reverse_lens]['pbrMetallicRoughness']['baseColorFactor'] = [.8, .86, .92, .5]
tail_lens = lamp_material(35, 'LightTailLens', [1, .012, .003], False)
stop_lens = lamp_material(35, 'LightStopLens', [1, .012, .003], False)
materials[27]['name'] = 'LampDetail'
materials[27]['emissiveFactor'] = [0, 0, 0]
materials[28]['name'] = 'LightHeadReflector'
materials[29]['name'] = 'LightHeadBulb'
# Thin colored lamp covers do not need a full-scene transmission pass.
# Geometry, transparency and surface roughness are retained.
materials[35].get('extensions', {}).pop('KHR_materials_transmission', None)


def used_uvs(value):
    result = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if key.endswith('Texture') and isinstance(item, dict):
                result.add('TEXCOORD_'+str(item.get('texCoord', 0)))
            else:
                result |= used_uvs(item)
    return result


# Exact surfaces from the original, partitioned in source scene coordinates.
# The 18-triangle clear bumper bulb + its 98-triangle cover are the reverse light.
# Four rear circles are tail/brake; the 20/108-triangle center strip is stop-only.
def material_selections(material, positions, indices):
    if material not in (27, 34, 35):
        return [(material, indices)]
    centroid = (positions[indices].mean(axis=1)/scale) @ axis_change + center
    x, y, z = centroid.T
    selection = np.full(len(indices), material)
    if material == 27:
        selection[(z > .155) & (y > .043)] = head
        selection[(z < -.16) & (y > .055)] = tail
        selection[(z < -.16) & (y > .075) & (np.abs(x) < .008)] = stop
        selection[(z < -.175) & (y > .041) & (y < .049) & (x > .013) & (x < .029)] = reverse
    if material == 34:
        selection[(z < -.175) & (y > .041) & (y < .049) & (x > .013) & (x < .029)] = reverse_lens
    if material == 35:
        selection[(z < -.16) & (y > .055)] = tail_lens
        selection[(z < -.16) & (y > .075) & (np.abs(x) < .008)] = stop_lens
    return [(int(m), indices[selection == m]) for m in np.unique(selection)]


batches = defaultdict(list)
source_triangles = 0
for index, node in enumerate(nodes):
    if 'mesh' not in node:
        continue
    part, wheel = roles.get(index, ('Body', None))
    transform = world(index)
    normal_matrix = np.linalg.inv(transform[:3, :3]).T
    for primitive in src['meshes'][node['mesh']]['primitives']:
        assert primitive.get('mode', 4) == 4
        attrs = {key: array(a).astype(np.float64) for key, a in primitive['attributes'].items()}
        attrs['POSITION'] = ((attrs['POSITION'] @ transform[:3, :3].T + transform[:3, 3])-center) @ axis_change.T * scale
        attrs['NORMAL'] = attrs['NORMAL'] @ normal_matrix.T @ axis_change.T
        attrs['NORMAL'] /= np.maximum(1e-20, np.linalg.norm(attrs['NORMAL'], axis=1))[:, None]
        indices = array(primitive['indices']).reshape(-1, 3).astype(np.uint32)
        if np.linalg.det(transform[:3, :3]) < 0:
            indices = indices[:, [0, 2, 1]]
        source_triangles += len(indices)
        if wheel is not None:
            attrs['POSITION'] = (attrs['POSITION']-wheel_positions[wheel]) @ mount_rotations[wheel]
            attrs['NORMAL'] = attrs['NORMAL'] @ mount_rotations[wheel]
        for material, faces in material_selections(primitive['material'], attrs['POSITION'], indices):
            if not len(faces):
                continue
            selected, reindexed = np.unique(faces, return_inverse=True)
            retained = {'POSITION', 'NORMAL'} | used_uvs(materials[material])
            data = {key: values[selected].astype('<f4') for key, values in attrs.items() if key in retained}
            assert retained <= data.keys(), 'A referenced texture coordinate is missing.'
            batches[(part, material, tuple(sorted(data)))].append((data, reindexed.reshape(-1, 3).astype('<u4')))

output = {'asset': {'version': '2.0', 'generator': 'Aftermile lossless R34 rig adapter'},
          'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
          'materials': materials, 'textures': textures, 'samplers': copy.deepcopy(src.get('samplers', [])),
          'images': [], 'buffers': [], 'bufferViews': [], 'accessors': [],
          'extensionsUsed': src.get('extensionsUsed', [])}
buffer = bytearray()


def view(data, target=None):
    while len(buffer) % 4:
        buffer.append(0)
    info = {'buffer': 0, 'byteOffset': len(buffer), 'byteLength': len(data)}
    if target:
        info['target'] = target
    output['bufferViews'].append(info)
    buffer.extend(data)
    return len(output['bufferViews'])-1


def accessor(values, indices=False):
    values = values.reshape(-1, 1) if indices else values
    info = {'bufferView': view(values.tobytes(), 34963 if indices else 34962),
            'componentType': 5125 if indices else 5126, 'count': len(values),
            'type': 'SCALAR' if indices else 'VEC'+str(values.shape[1])}
    if not indices:
        info['min'], info['max'] = values.min(axis=0).tolist(), values.max(axis=0).tolist()
    output['accessors'].append(info)
    return len(output['accessors'])-1


def node(name, parent_index=None, **extra):
    index = len(output['nodes'])
    output['nodes'].append({'name': name, 'children': [], **extra})
    (output['scenes'][0]['nodes'] if parent_index is None else output['nodes'][parent_index]['children']).append(index)
    return index


part_nodes = {'Body': node('Body')}
for i in range(4):
    angle = np.arctan2(mount_rotations[i][1, 0], mount_rotations[i][0, 0])
    # Correct the original's 2.8 mm front/rear contact-height mismatch without
    # changing any wheel vertex or its axle pivot.
    contact = min(p[:, 1].min() for p in points(wheel_nodes[i]))
    wheel_positions[i, 1] -= (contact-source_floor)*scale
    mount = node('WheelMount'+str(i), translation=wheel_positions[i].tolist(), rotation=[0, 0, float(np.sin(angle/2)), float(np.cos(angle/2))])
    for kind in ['Wheel', 'Caliper']:
        part_nodes[kind+str(i)] = node(kind+str(i), mount)

for (part, material, keys), pieces in sorted(batches.items()):
    merged = {key: np.concatenate([data[key] for data, _ in pieces]) for key in keys}
    indices, offset = [], 0
    for data, faces in pieces:
        indices.append(faces+offset)
        offset += len(data['POSITION'])
    primitive = {'attributes': {key: accessor(merged[key]) for key in keys},
                 'indices': accessor(np.concatenate(indices), True), 'material': material}
    mesh = len(output['meshes'])
    output['meshes'].append({'name': part+' / '+materials[material]['name'], 'primitives': [primitive]})
    node(part+'_'+str(material), part_nodes[part], mesh=mesh)

image_report = []
for image in src['images']:
    v = src['bufferViews'][image['bufferView']]
    data = binary[v.get('byteOffset', 0):v.get('byteOffset', 0)+v['byteLength']]
    output['images'].append({**image, 'bufferView': view(data)})
    decoded = Image.open(io.BytesIO(data))
    image_report.append({'name': image.get('name'), 'width': decoded.width, 'height': decoded.height,
                         'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})

while len(buffer) % 4:
    buffer.append(0)
output['buffers'] = [{'byteLength': len(buffer)}]
encoded = json.dumps(output, separators=(',', ':')).encode()
encoded += b' ' * ((-len(encoded)) % 4)
result = struct.pack('<III', 0x46546c67, 2, 28+len(encoded)+len(buffer)) + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded + struct.pack('<II', len(buffer), 0x004e4942) + buffer
OUT.mkdir(parents=True, exist_ok=True)
(OUT/'r34.glb').write_bytes(result)
report = {'sourceFile': SOURCE.name, 'sourceSha256': EXPECTED_SHA, 'sourceBytes': len(raw),
          'sourceNodes': len(nodes), 'sourcePrimitives': sum(len(m['primitives']) for m in src['meshes']),
          'triangles': source_triangles, 'runtimeTriangles': sum(len(f) for pieces in batches.values() for _, f in pieces),
          'runtimeBytes': len(result), 'runtimePrimitives': len(output['meshes']), 'runtimeNodes': len(output['nodes']),
          'scale': scale, 'wheelPositions': wheel_positions.tolist(), 'wheelRadii': wheel_radii,
          'camberDegrees': [float(np.rad2deg(np.arctan2(r[1, 0], r[0, 0]))) for r in mount_rotations],
          'sourceTextureReferences': len(src['textures']), 'runtimeTextureReferences': len(textures),
          'images': image_report, 'materials': len(materials),
          'wheelMaterialRepairs': wheel_material_repairs}
assert report['triangles'] == report['runtimeTriangles'] == 266060
(OUT/'preparation.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({key: value for key, value in report.items() if key != 'images'}, indent=2))
