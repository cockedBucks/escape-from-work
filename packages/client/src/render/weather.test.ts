import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LIGHT, SANDSTORM } from './look';
import { Weather } from './weather';

describe('sandstorm weather (P10.2)', () => {
  const storm = { lap: 2, fogNear: 5, fogFar: 60 };

  it('blows in over the fade time, then dies down again', () => {
    const fog = new THREE.Fog(LIGHT.sky, LIGHT.fogNear, LIGHT.fogFar);
    const bg = new THREE.Color(LIGHT.sky);
    const w = new Weather(fog, bg, storm);
    w.update(true, SANDSTORM.fadeSeconds / 2);
    expect(fog.far).toBeLessThan(LIGHT.fogFar);
    expect(fog.far).toBeGreaterThan(storm.fogFar);
    w.update(true, SANDSTORM.fadeSeconds);
    expect([fog.near, fog.far]).toEqual([storm.fogNear, storm.fogFar]);
    expect(bg.getHex()).toBe(SANDSTORM.color);
    w.update(false, SANDSTORM.fadeSeconds * 2);
    expect([fog.near, fog.far]).toEqual([LIGHT.fogNear, LIGHT.fogFar]);
    expect(bg.getHex()).toBe(LIGHT.sky);
  });

  it('does nothing on a track without a sandstorm', () => {
    const fog = new THREE.Fog(LIGHT.sky, LIGHT.fogNear, LIGHT.fogFar);
    new Weather(fog, new THREE.Color(), undefined).update(true, 10);
    expect(fog.far).toBe(LIGHT.fogFar);
  });
});
