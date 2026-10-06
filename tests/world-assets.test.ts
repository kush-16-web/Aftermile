import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const assets=[
  ['tree_detailed.glb',31412],
  ['tree_pineTallB_detailed.glb',12632],
  ['rock_largeC.glb',7004],
  ['plant_bushDetailed.glb',10172],
  ['grass_leafs.glb',4608],
] as const;

test('bundled world assets are small GLBs with a shipped CC0 manifest',()=>{
  const manifest=readFileSync(join(root,'WORLD_ASSETS.md'),'utf8');
  const license=readFileSync(join(root,'public/world/kenney/License.txt'),'utf8');
  assert.match(manifest,/Creative Commons Zero \(CC0 1\.0\)/);
  assert.match(license,/Creative Commons Zero, CC0/);
  let total=0;
  for(const [name,bytes] of assets){
    const path=join(root,'public/world/kenney',name);
    assert.equal(statSync(path).size,bytes,name+' remains normalized and pinned');
    assert.deepEqual(readFileSync(path).subarray(0,4),Buffer.from('glTF'),'GLB header '+name);
    total+=bytes;
  }
  assert.equal(total,65828);
  assert.ok(total<100000,'runtime detail stays below the 100 KB checkpoint budget');
});

test('real mature tree and foliage assets are verified GLB binaries with License.txt',()=>{
  const manifest=readFileSync(join(root,'WORLD_ASSETS.md'),'utf8');
  const license=readFileSync(join(root,'public/world/assets/License.txt'),'utf8');
  assert.match(manifest,/tree_oak_mature\.glb/);
  assert.match(manifest,/grass_field_cluster\.glb/);
  assert.match(license,/POLY HAVEN ASSETS/);
  assert.match(license,/EZ-TREE/);
  
  const newAssets=[
    'tree_oak_mature.glb',
    'tree_ash_mature.glb',
    'tree_roadside.glb',
    'tree_pine_tall.glb',
    'shrub_dense.glb',
    'plant_weed.glb',
    'grass_field_cluster.glb',
    'grass_tuft_near.glb',
    'rock_boulder.glb'
  ];

  for(const name of newAssets){
    const p=join(root,'public/world/assets',name);
    const sz=statSync(p).size;
    assert.ok(sz>10000,`${name} has non-trivial geometry data (${sz} bytes)`);
    assert.deepEqual(readFileSync(p).subarray(0,4),Buffer.from('glTF'),`valid GLB header for ${name}`);
  }
});

