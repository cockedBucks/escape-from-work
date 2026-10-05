import type { Tuning } from '../config/tuning';
import { lapProgress, locateOnTrack, zonesAt } from '../track/locate';
import { fall, isAirborne, launch } from './air';
import { placeAtGate } from './car';
import { collideCars } from './carCollisions';
import { drive } from './drive';
import { resetDrift, stepDrift } from './drift';
import { stepHeat } from './heat';
import { stepNitro } from './nitro';
import { dot, forward } from '../util/math';
import { NO_INPUT, type CarInput, type CarState, type SimEvent, type World } from './types';
import { collideWalls } from './walls';

/** Inputs for this tick by car id. A missing car gets no input (coasts). */
export type InputsByCar = Readonly<Record<string, CarInput | undefined>>;

const ticks = (seconds: number, dt: number): number => Math.round(seconds / dt);

/**
 * Advance the world by one fixed tick (`cfg.sim.dt`). Mutates `world` and returns what
 * happened. Deterministic: no clock, no Math.random, cars in id order.
 */
export function step(world: World, inputs: InputsByCar, cfg: Tuning): SimEvent[] {
  const events: SimEvent[] = [];
  const now = world.tick + 1;
  for (const car of world.cars) stepCar(world, car, inputs[car.id] ?? NO_INPUT, cfg, now, events);
  collideCars(world.cars, now, cfg.car, events);
  world.tick = now;
  return events;
}

function startRespawn(car: CarState, now: number, cfg: Tuning, reason: 'button' | 'offTrack', events: SimEvent[]): void {
  car.respawnAtTick = now + ticks(cfg.race.respawnFadeSeconds, cfg.sim.dt);
  events.push({ type: 'respawnStart', car: car.id, reason });
}

function stepCar(world: World, car: CarState, rawInput: CarInput, cfg: Tuning, now: number, events: SimEvent[]): void {
  const { track } = world;
  const dt = cfg.sim.dt;
  let input = rawInput;

  // 1. Respawn: fade out with no control, then reappear on the last gate, ghosted.
  if (car.respawnAtTick >= 0) {
    if (now >= car.respawnAtTick) {
      const gate = track.gates[car.lastGate] ?? track.gates[0];
      if (gate) placeAtGate(car, track, gate);
      car.respawnAtTick = -1;
      car.ghostUntilTick = now + ticks(cfg.race.respawnGhostSeconds, dt);
      resetDrift(car);
      events.push({ type: 'respawn', car: car.id, gate: car.lastGate });
      return;
    }
    input = NO_INPUT;
  } else if (input.respawn) {
    startRespawn(car, now, cfg, 'button', events);
    input = NO_INPUT;
  }

  // 2. Nitro, engine heat (a stalled engine gives no gas), drift (a tap does not brake), then drive
  // (on the ground only), move, fall, hit walls.
  stepNitro(car, input, cfg, now, events);
  input = stepHeat(car, input, Math.hypot(car.vx, car.vz), cfg, now, events);
  input = stepDrift(car, input, dot({ x: car.vx, z: car.vz }, forward(car.yaw)), cfg, events);
  if (!isAirborne(car)) drive(car, input, cfg.car, cfg, dt);
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  const impact = fall(car, cfg.car, dt);
  if (impact > 0) events.push({ type: 'land', car: car.id, impact });
  const hit = collideWalls(car, track, cfg.car);
  if (hit > 0) events.push({ type: 'wallHit', car: car.id, speed: hit });

  // 3. Where are we now: progress, zones, checkpoints.
  const loc = locateOnTrack(track, { x: car.x, z: car.z }, car.segment);
  car.segment = loc.segment;
  car.progress = lapProgress(track, loc.progress);
  car.lateral = loc.lateral;

  const grounded = !isAirborne(car);
  const zones = zonesAt(track, loc);
  car.onSlick = grounded && zones.some((z) => z.type === 'slick');
  const ramp = zones.find((z) => z.type === 'ramp');
  if (ramp && !car.onRamp && grounded && launch(car, ramp.launch, cfg.car)) {
    events.push({ type: 'jump', car: car.id });
  }
  car.onRamp = ramp !== undefined;

  // Gates count only in order, so driving backwards over one does not move the respawn point.
  const sectors = track.gates.length;
  const sector = Math.min(Math.floor(car.progress * sectors), sectors - 1);
  const next = (car.lastGate + 1) % sectors;
  if (sector === next) {
    car.lastGate = next;
    events.push({ type: 'checkpoint', car: car.id, gate: next });
  }

  // Horn: a cosmetic event (sound + bubble on every client; the league counts them later).
  if (rawInput.honk && now >= car.nextHonkTick) {
    car.nextHonkTick = now + ticks(cfg.race.honkCooldownSeconds, dt);
    events.push({ type: 'honk', car: car.id });
  }

  // 4. Fell off / ended up outside the walls: respawn by itself.
  if (car.respawnAtTick < 0 && grounded && Math.abs(loc.lateral) > loc.halfWidth + cfg.race.offTrackRespawnDistance) {
    startRespawn(car, now, cfg, 'offTrack', events);
  }
}
