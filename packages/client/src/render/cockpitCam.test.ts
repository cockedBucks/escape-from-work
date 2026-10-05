import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadTuning } from '../content';
import { toggled } from '../input/cameraPref';
import { CockpitCam, seatSideFor } from './cockpitCam';

const cfg = loadTuning().camera;

function cam(): { cc: CockpitCam; camera: THREE.PerspectiveCamera } {
  const camera = new THREE.PerspectiveCamera();
  return { cc: new CockpitCam(camera), camera };
}

describe('cockpit cam', () => {
  it('Pilot sits left, Engineer right (car facing +Z: left is +X)', () => {
    expect(seatSideFor('pilot')).toBe('left');
    expect(seatSideFor('solo')).toBe('left');
    expect(seatSideFor('engineer')).toBe('right');
    const l = cam();
    l.cc.update(cfg, 0, 0, 0, 0, 'left', 0, false);
    const r = cam();
    r.cc.update(cfg, 0, 0, 0, 0, 'right', 0, false);
    expect(l.camera.position.x).toBeGreaterThan(0);
    expect(r.camera.position.x).toBeLessThan(0);
  });

  it('mouse turns the head within the limits', () => {
    const { cc } = cam();
    cc.mouse(-100_000, -100_000, cfg); // far left and up
    expect(cc.headYaw).toBeCloseTo(cfg.headYawLimit);
    expect(cc.headPitch).toBeCloseTo(cfg.headPitchLimit);
    cc.mouse(200_000, 200_000, cfg);
    expect(cc.headYaw).toBeCloseTo(-cfg.headYawLimit);
    expect(cc.headPitch).toBeCloseTo(-cfg.headPitchLimit);
  });

  it('with the mouse free the head turns back to straight ahead', () => {
    const { cc } = cam();
    cc.mouse(-200, 0, cfg);
    const before = cc.headYaw;
    for (let i = 0; i < 120; i++) cc.update(cfg, 0, 0, 0, 0, 'left', 1 / 60, false);
    expect(Math.abs(cc.headYaw)).toBeLessThan(Math.abs(before) * 0.05);
    cc.mouse(-200, 0, cfg);
    const held = cc.headYaw;
    for (let i = 0; i < 120; i++) cc.update(cfg, 0, 0, 0, 0, 'left', 1 / 60, true);
    expect(cc.headYaw).toBe(held); // captured mouse: the head stays where you put it
  });

  it('a bump bobs the head and it settles again', () => {
    const { cc, camera } = cam();
    cc.update(cfg, 0, 0, 0, 0, 'left', 1 / 60, false);
    const rest = camera.position.y;
    cc.bump(10, cfg);
    let moved = 0;
    for (let i = 0; i < 10; i++) {
      cc.update(cfg, 0, 0, 0, 0, 'left', 1 / 60, false);
      moved = Math.max(moved, Math.abs(camera.position.y - rest));
    }
    expect(moved).toBeGreaterThan(0.01);
    for (let i = 0; i < 300; i++) cc.update(cfg, 0, 0, 0, 0, 'left', 1 / 60, false);
    expect(camera.position.y).toBeCloseTo(rest, 3);
  });

  it('C toggles between chase and cockpit', () => {
    expect(toggled('chase')).toBe('cockpit');
    expect(toggled('cockpit')).toBe('chase');
  });
});
