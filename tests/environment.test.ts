import test from 'node:test';
import assert from 'node:assert/strict';
import { ENVIRONMENTS, ENVIRONMENT_TIMES, atmosphere, exposedEnvironment, skyKeyframe, starVisibility } from '../src/weather/Environment.ts';
import { Weather, PRESETS, modeFromCode } from '../src/weather/Weather.ts';

test('three exposed environments retain the underlying live condition mapping',()=>{
  assert.deepEqual([...ENVIRONMENTS],['live','autumn','snow']);
  assert.equal(exposedEnvironment('storm'),'autumn');
  assert.equal(modeFromCode(95),'storm');assert.equal(modeFromCode(73),'snow');
  assert.deepEqual(Object.keys(ENVIRONMENT_TIMES),['morning','noon','evening','night']);
});
test('Live stars fade continuously through dusk and dawn, with cloud suppression',()=>{
  for(let h=7;h<17.8;h+=.1)assert.equal(starVisibility(h,'live','noon',.08),0);
  let previous=0;
  for(let h=17.9;h<20;h+=.01){const stars=starVisibility(h,'live','noon',.08);assert.ok(stars>=previous);assert.ok(stars-previous<.025);previous=stars;}
  assert.ok(starVisibility(23,'live','night',.08)>.9);
  assert.ok(starVisibility(23,'live','night',.98)<.01);
  assert.ok(starVisibility(5.3,'live','morning',.08)>starVisibility(6,'live','morning',.08));
});
test('curated Autumn evening keeps restrained upper stars; Snowfall hides heavy-cloud stars',()=>{
  assert.equal(starVisibility(8.5,'autumn','morning',.2),0);
  assert.equal(starVisibility(12,'autumn','noon',.2),0);
  const evening=starVisibility(17.65,'autumn','evening',.2);
  assert.ok(evening>.1&&evening<.2);
  assert.ok(starVisibility(23,'autumn','night',.2)>evening*4);
  assert.ok(starVisibility(23,'snow','night',.87,.25,1)<.01);
});
test('sky interpolation has no palette jumps, and sunset/night lighting is lower than noon',()=>{
  for(let hour=0;hour<24;hour+=.03){
    const {a,b,blend}=skyKeyframe(hour);assert.ok(a.h<=hour&&b.h>hour);assert.ok(blend>=0&&blend<=1);
  }
  const noon=atmosphere(12,PRESETS.autumn),sunset=atmosphere(17.65,PRESETS.autumn),night=atmosphere(23,PRESETS.autumn);
  assert.ok(sunset.sunIntensity<noon.sunIntensity*.4);
  assert.ok(night.ambientIntensity<sunset.ambientIntensity);
  assert.ok(night.sunIntensity<.1);
  assert.ok(atmosphere(12,PRESETS.snow).fogDensity>noon.fogDensity);
});
test('failed live fetch keeps Live mode and transparently reports simulated conditions',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('offline');};
  try{
    const weather=new Weather();weather.set('live');
    await assert.rejects(weather.fetchCity({name:'Test',latitude:0,longitude:0}));
    assert.equal(weather.mode,'live');assert.equal(weather.pending,false);
    assert.match(weather.status,/unavailable.*simulation active/);
  }finally{globalThis.fetch=original;}
});
