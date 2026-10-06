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
    respawning: false, ghost: false, heat: 0, stallLeft: 0, drift: 0, driftLevel: 0, driftCharge: 0, boostLeft: 0, driftStraight: 0, onSwap: false, spinLeft: 0, lagLeft: 0, swapLeft: 0, updateLeft: 0,
    nitro: 0, nitroOn: false, solo: false, inSteer: 0, inGas: false, inBrake: false, inNitro: false, ...over,
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

describe('OwnCarPredictor smoothness', () => {
  it('server updates every 2 ticks never make the drawn car step unevenly (no stutter)', async () => {
    const { createCar, createWorld, step } = await import('@escape/shared');
    const GAS: CarInput = { ...NO_INPUT, gas: true };
    const world = createWorld(track, [createCar('car0', STATS, track)]);
    const p = new OwnCarPredictor(track, STATS);
    const o = out();
    const dtMs = cfg.sim.dt * 1000;
    const viewOf = (): OwnCarView => {
      const c = world.cars[0]!;
      return {
        x: c.x, y: c.y, z: c.z, yaw: c.yaw, vx: c.vx, vz: c.vz, vy: c.vy, steer: c.steer, respawning: false, ghost: false,
        heat: c.heat, stallLeft: 0, drift: 0, driftLevel: 0, driftCharge: 0, boostLeft: 0, driftStraight: 0, onSwap: false, spinLeft: 0, lagLeft: 0, swapLeft: 0, updateLeft: 0,
        nitro: 0, nitroOn: false, solo: false, inSteer: 0, inGas: true, inBrake: false, inNitro: false,
      };
    };
    // The server: 60 ticks/s, a state every 2 ticks. The client draws at 60 fps, half a frame off.
    const steps: number[] = [];
    let lastX = NaN;
    let lastZ = NaN;
    for (let frame = 0; frame < 180; frame++) {
      const now = frame * dtMs + dtMs / 2;
      while (world.tick * dtMs <= now - 40) {
        step(world, { car0: GAS }, cfg);
        if (world.tick % 2 === 0) p.onServer('car0', viewOf(), world.tick * dtMs);
      }
      if (!p.predict(now, GAS, 'solo', 40, cfg, o)) continue;
      if (!Number.isNaN(lastX) && frame > 60) steps.push(Math.hypot(o.x - lastX, o.z - lastZ) / ((o.speed * dtMs) / 1000));
      lastX = o.x;
      lastZ = o.z;
    }
    expect(steps.length).toBeGreaterThan(100);
    expect(Math.min(...steps)).toBeGreaterThan(0.85);
    expect(Math.max(...steps)).toBeLessThan(1.15);
  });
});

describe('OwnCarPredictor rebuilds timers from synced state', () => {
  it('a stalled, boosting car is predicted to the same spot the server simulates', async () => {
    const { createCar, createWorld, step } = await import('@escape/shared');
    const GAS: CarInput = { ...NO_INPUT, gas: true };
    const dt = cfg.sim.dt;
    const world = createWorld(track, [createCar('car0', STATS, track)]);
    const c = world.cars[0]!;
    const f = forward(c.yaw);
    c.vx = f.x * 20;
    c.vz = f.z * 20;
    c.heat = 1;
    c.stallUntilTick = 4; // the stall ends during the prediction...
    c.boostTicks = 7; // ...and the drift boost runs out in it too
    const p = new OwnCarPredictor(track, STATS);
    p.onServer('car0', {
      x: c.x, y: c.y, z: c.z, yaw: c.yaw, vx: c.vx, vz: c.vz, vy: c.vy, steer: c.steer, respawning: false, ghost: false,
      heat: 1, stallLeft: 4 * dt, drift: 0, driftLevel: 0, driftCharge: 0, boostLeft: 7 * dt, driftStraight: 0, onSwap: false, spinLeft: 0, lagLeft: 0, swapLeft: 0, updateLeft: 0,
      nitro: 0, nitroOn: false, solo: false, inSteer: 0, inGas: true, inBrake: false, inNitro: false,
    }, 0);
    const o = out();
    expect(p.predict(11 * dt * 1000, GAS, 'solo', 0, cfg, o)).toBe(true); // within predictMaxMs
    for (let i = 0; i < 11; i++) step(world, { car0: GAS }, cfg);
    expect(o.x).toBeCloseTo(c.x, 3);
    expect(o.z).toBeCloseTo(c.z, 3);
  });
});
