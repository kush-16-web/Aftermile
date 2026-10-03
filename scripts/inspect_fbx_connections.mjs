import fs from 'fs';
import path from 'path';

const fbxPath = 'C:\\Users\\harsh\\.gemini\\antigravity-ide\\brain\\0dacc5d9-913f-41de-98e5-2ce961ce7f3b\\scratch\\bmw_source_clean\\source\\FINAL_MODEL_GT325.fbx';

const content = fs.readFileSync(fbxPath, 'utf8');

console.log('--- SEARCHING FOR TEXTURE / FILE NODES IN FBX ---');
const textureRegex = /Texture:\s*"([^"]*)",\s*"([^"]*)"\s*\{([\s\S]*?)\}/g;
let match;
const textures = [];

while ((match = textureRegex.exec(content)) !== null) {
  const texName = match[1];
  const texType = match[2];
  const block = match[3];
  
  const fileMatch = block.match(/FileName:\s*"([^"]*)"/);
  const relFileMatch = block.match(/RelativeFilename:\s*"([^"]*)"/);
  
  textures.push({
    name: texName,
    type: texType,
    fileName: fileMatch ? fileMatch[1] : '',
    relFileName: relFileMatch ? relFileMatch[1] : '',
  });
}

console.log(`Found ${textures.length} Texture nodes in FBX:`);
textures.forEach(t => {
  console.log(`- "${t.name}" -> file: "${t.fileName}" (rel: "${t.relFileName}")`);
});

console.log('\n--- SEARCHING FOR MATERIAL NODES IN FBX ---');
const matRegex = /Material:\s*"([^"]*)",\s*"([^"]*)"\s*\{([\s\S]*?)\}/g;
const materials = [];

while ((match = matRegex.exec(content)) !== null) {
  const matName = match[1];
  const matType = match[2];
  const block = match[3];

  const diffuseMatch = block.match(/P:\s*"DiffuseColor",\s*"Color",\s*"[^"]*",\s*"A\+",\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/) ||
                       block.match(/P:\s*"Diffuse",\s*"Vector3D",\s*"Vector",\s*"",\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/);
  const specularMatch = block.match(/P:\s*"SpecularColor",\s*"Color",\s*"[^"]*",\s*"A\+",\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/);
  const opacityMatch = block.match(/P:\s*"Opacity",\s*"double",\s*"[^"]*",\s*"A\+",\s*([0-9.]+)/) ||
                       block.match(/P:\s*"TransparencyFactor",\s*"Number",\s*"",\s*"A",\s*([0-9.]+)/);
  const shininessMatch = block.match(/P:\s*"Shininess",\s*"double",\s*"[^"]*",\s*"A\+",\s*([0-9.]+)/);

  materials.push({
    name: matName,
    type: matType,
    diffuse: diffuseMatch ? [parseFloat(diffuseMatch[1]), parseFloat(diffuseMatch[2]), parseFloat(diffuseMatch[3])] : null,
    specular: specularMatch ? [parseFloat(specularMatch[1]), parseFloat(specularMatch[2]), parseFloat(specularMatch[3])] : null,
    opacity: opacityMatch ? parseFloat(opacityMatch[1]) : 1.0,
    shininess: shininessMatch ? parseFloat(shininessMatch[1]) : null,
  });
}

console.log(`Found ${materials.length} Material nodes in FBX:`);
materials.forEach(m => {
  console.log(`- Material "${m.name}"`);
  console.log(`    Diffuse:`, m.diffuse);
  console.log(`    Specular:`, m.specular);
  console.log(`    Opacity:`, m.opacity);
  console.log(`    Shininess:`, m.shininess);
});

console.log('\n--- SEARCHING FOR MATERIAL-TEXTURE CONNECTIONS IN FBX ---');
const connRegex = /C:\s*"OP",\s*"([^"]*)",\s*"([^"]*)"(?:,\s*"([^"]*)")?/g;
const connections = [];

while ((match = connRegex.exec(content)) !== null) {
  connections.push({
    child: match[1],
    parent: match[2],
    prop: match[3] || ''
  });
}

console.log(`Found ${connections.length} Object-Property connections:`);
const matTexConn = connections.filter(c => 
  (c.child.includes('Texture') || c.parent.includes('Material')) &&
  !c.child.includes('Model') && !c.parent.includes('Model')
);
matTexConn.forEach(c => {
  console.log(`  ${c.child}  --->  ${c.parent} (${c.prop})`);
});
