import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PlayerVehicleModel } from '../src/vehicle/PlayerVehicleModel.ts';
import { createVehicleConfig } from '../src/vehicle/VehicleConfig.ts';
import { VehiclePhysics, emptyControls } from '../src/vehicle/VehiclePhysics.ts';
import { CameraController } from '../src/vehicle/CameraController.ts';
import { Road } from '../src/road/Road.ts';

// Node has no DOM image decoder. A 1x1 bitmap stub preserves the actual GLB
// hierarchy/material names while keeping this test independent of WebGL.
globalThis.self ??= globalThis as any;
globalThis.createImageBitmap ??= (async()=>({width:1,height:1,close(){}})) as any;
globalThis.ProgressEvent ??= class extends Event {} as any;

test('the actual R34 GLB loads into the four-wheel player rig with ground contact, lights and bounded cost',async()=>{
  const config=createVehicleConfig();
  const bytes=readFileSync(new URL('../public/models/r34/r34.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const model=new PlayerVehicleModel(config);model.attach(gltf.scene);
  const physics=new VehiclePhysics(new Road());const pose=physics.pose();
  pose.height=0;pose.surfacePitch=pose.surfaceRoll=0;pose.wheelHeights=[0,0,0,0];
  model.animate(pose,0,0,0);model.group.updateMatrixWorld(true);
  assert.equal(model.ready,true);assert.equal(model.wheels.length,4);
  assert.equal(model.lights.headMaterials.length,3);assert.equal(model.lights.tailMaterials.length,2);
  assert.equal(model.lights.brakeMaterials.length,2);assert.equal(model.lights.reverseMaterials.length,2);
  const size=new Box3().setFromObject(model.group).getSize(new Vector3());
  assert.ok(size.z>4.5&&size.z<4.8&&size.y>1.25&&size.y<1.5&&size.x<2.2);
  let triangles=0,draws=0;
  model.group.traverse(o=>{if(o instanceof Mesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;draws++;for(const n of o.geometry.attributes.position.array)assert.ok(Number.isFinite(n));}});
  assert.equal(triangles,266060);assert.ok(draws<=80);
  for(let i=0;i<4;i++){
    const wheel=model.wheels[i],box=new Box3().setFromObject(wheel);assert.ok(Math.abs(box.min.y)<.015,`wheel ${i} contact ${box.min.y}`);
  }
  pose.steering=.2;pose.wheelSpin=-1;pose.wheelSpins.fill(-1);model.animate(pose,15,1,1);
  assert.ok(model.steer[1].rotation.y<model.steer[0].rotation.y&&model.steer[0].rotation.y<0,'inside front wheel gets more steering');
  assert.equal(model.steer[2].rotation.y,0);assert.equal(model.wheels[0].rotation.x,-1);
  assert.ok(model.lights.brakeMaterials.every(m=>m.emissiveIntensity>2));assert.ok(model.lights.spots[0].intensity>0);
  model.lights.update(0,0,-2,config);assert.ok(model.lights.reverseMaterials.every(m=>m.emissiveIntensity>0));
  model.lights.mode='off';model.lights.update(1,0,0,config);assert.equal(model.lights.spots[0].intensity,0);
  model.dispose();
});

test('chase camera stays outside the car, above the road, and stable through origin shifts',()=>{
  globalThis.window={addEventListener(){}} as any;
  const camera=new PerspectiveCamera(60,1,.08,5000),config=createVehicleConfig();
  const cameras=new CameraController(camera,{addEventListener(){}} as any,config),car=new VehiclePhysics(new Road());
  car.speed=100/3.6;let origin=0;
  for(let i=0;i<60*20;i++){
    car.update(1/60,{...emptyControls(),right:i<30,left:i>=30&&i<60},0,0,false,false);
    if(i===600){origin=3200;cameras.shiftOrigin(3200);}
    cameras.update(1/60,i/60,car,car.pose(),origin,false,60,.6,false);
    const p=car.road.point(car.s,car.offset),position=new Vector3(p.x,car.height,p.z+origin);
    assert.ok(camera.position.distanceTo(position)>4&&camera.position.distanceTo(position)<16);
    assert.ok(camera.position.toArray().every(Number.isFinite));
  }
  assert.ok(camera.fov<64.1&&camera.fov>=60);
});
