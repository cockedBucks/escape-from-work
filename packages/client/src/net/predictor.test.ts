import { describe, expect, it } from 'vitest';
import { NO_INPUT, forward, type CarInput } from '@escape/shared';
import { loadTrack, loadTuning } from '../content';
import { OwnCarPredictor, type OwnCarView } from './predictor';

const STATS = { speed: 1, grip: 1, weight: 1 };
import type { CarSnap } from './snapshots';

const cfg = loadTuning();
const track = loadTrack('test-loop', cfg);
const gate = track.gates[0]!;

/** Your car on the straight, moving along it at `speed`. */
function view(speed: number, over: Partial<OwnCarView> = {}): OwnCarView {
  const f = forward(gate.yaw);
  return {
    x: gate.pos.x, y: 0, z: gate.pos.z, yaw: gate.yaw, vx: f.x * speed, vz: f.z * speed, vy: 0, steer: 0,
    respawning: false, ghost: false, heat: 0, stallLeft: 0, drift: 0, driftLevel: 0, driftCharge: 0, boostLeft: 0,
    nitro: 0, nitroOn: false, inSteer: 0, inGas: false, inBrake: false, inNitro: false, ...over,
  };
}
const out = (): CarSnap => ({ x: 0, y: 0, z: 0, yaw: 0, speed: 0, steer: 0, respawning: false, ghost: false, stalled: false, drift: 0, driftLevel: 0, boosting: false, nitroOn: false });
const GAS: CarInput = { ...NO_INPUT, gas: true };

describe('OwnCarPredictor', () => {
  it('runs the car ahead by the time since the update plus the lead', () => {
    const p = new OwnCarPredictor(track, STATS);
    p.onServer('car0', view(20), 1000);
    const o = out();
    expect(p.predict(1000, NO_INPUT, 'solo', 100, cfg, o)).toBe(true);
    // ~0.1 s at ~20 m/s along the straight
    expect(Math.hypot(o.x - gate.pos.x, o.z - gate.pos.z)).toBeGreaterThan(1.5);
    expect(Math.hypot(o.x - gate.pos.x, o.z - gate.pos.z)).toBeLessThan(2.5);
  });

  it('your own keys act at once: holding gas predicts further than coasting', () => {
    const a = new OwnCarPredictor(track, STATS);
    const b = new OwnCarPredictor(track, STATS);
    a.onServer('car0', view(10), 0);
    b.onServer('car0', view(10), 0);
    const oa = out();
    const ob = out();
    a.predict(0, GAS, 'solo', 150, cfg, oa);
    b.predict(0, NO_INPUT, 'solo', 150, cfg, ob);
    expect(Math.hypot(oa.x - gate.pos.x, oa.z - gate.pos.z)).toBeGreaterThan(Math.hypot(ob.x - gate.pos.x, ob.z - gate.pos.z));
  });

  it('a Pilot predicts with their own steer but the Engineer\'s pedals from the server', () => {
    const p = new OwnCarPredictor(track, STATS);
    p.onServer('car0', view(10, { inGas: false }), 0);
    const pilotPressingGas = out();
    p.predict(0, { ...GAS, steer: 1 }, 'pilot', 150, cfg, pilotPressingGas);
    const q = new OwnCarPredictor(track, STATS);
    q.onServer('car0', view(10, { inGas: false }), 0);
    const coasting = out();
    q.predict(0, { ...NO_INPUT, steer: 1 }, 'pilot', 150, cfg, coasting);
    expect(pilotPressingGas.x).toBeCloseTo(coasting.x, 6); // pilot gas ignored
    expect(pilotPressingGas.steer).toBeGreaterThan(0); // pilot steer used
  });

  it('never runs further ahead than predictMaxMs; 0 turns prediction off', () => {
    const p = new OwnCarPredictor(track, STATS);
    p.onServer('car0', view(20), 0);
    const far = out();
    p.predict(10_000, NO_INPUT, 'solo', 0, cfg, far);
    expect(Math.hypot(far.x - gate.pos.x, far.z - gate.pos.z)).toBeLessThan(20 * (cfg.net.predictMaxMs / 1000) + 0.5);
    const off = { ...cfg, net: { ...cfg.net, predictMaxMs: 0 } };
    expect(p.predict(0, NO_INPUT, 'solo', 0, off, out())).toBe(false);
  });

  it('a correction from the server fades in instead of jumping', () => {
    const p = new OwnCarPredictor(track, STATS);
    p.onServer('car0', view(0), 0);
    const o = out();
    p.predict(0, NO_INPUT, 'solo', 0, cfg, o);
    const before = o.x;
    // The server says the car is actually 3 m further on.
    const f = forward(gate.yaw);
    p.onServer('car0', view(0, { x: gate.pos.x + f.x * 3, z: gate.pos.z + f.z * 3 }), 16);
    p.predict(16, NO_INPUT, 'solo', 0, cfg, o);
    // No jump: the first frame moves only a small part of the 3 m (the fade has begun).
    expect(Math.abs(o.x - before)).toBeLessThan(0.6);
    for (let t = 32; t < 2000; t += 16) p.predict(t, NO_INPUT, 'solo', 0, cfg, o);
    expect(o.x).toBeCloseTo(gate.pos.x + f.x * 3, 1); // settled on the server's answer
  });

  it('does not predict while watching or respawning', () => {
    const p = new OwnCarPredictor(track, STATS);
    p.onServer('car0', view(10), 0);
    expect(p.predict(0, NO_INPUT, null, 50, cfg, out())).toBe(false);
    p.onServer('car0', view(10, { respawning: true }), 10);
    expect(p.predict(10, NO_INPUT, 'solo', 50, cfg, out())).toBe(false);
  });
});
