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
