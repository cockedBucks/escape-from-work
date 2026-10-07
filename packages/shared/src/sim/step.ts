import type { Tuning } from '../config/tuning';
import { lapProgress, locateOnTrack, zonesAt } from '../track/locate';
import { fall, isAirborne, launch } from './air';
import { placeAtGate } from './car';
import { collideCars } from './carCollisions';
import { drive } from './drive';
import { cancelDrift, resetDrift, stepDrift } from './drift';
import { stepHeat } from './heat';
import { stepNitro } from './nitro';
import { stepBoxes } from '../items/chaos';
import { stepPuddles } from '../items/coffeeSpill';
import { forgetHistory, recordHistory } from '../items/ctrlZ';
import { applyControlEffects } from '../items/controlEffects';
import { useItems } from '../items/index';
import { stepEnvelopes } from '../items/replyAll';
import { TAU, dot, forward, wrapAngle } from '../util/math';
import { NO_INPUT, type CarInput, type CarState, type SimEvent, type World } from './types';
import { stepSlipstream } from './slipstream';
import { landTrick, stepTrick } from './trick';
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
  if (world.chaos) useItems(world, world.chaos, inputs, cfg, now, events);
  for (const car of world.cars) {
    const raw = inputs[car.id] ?? NO_INPUT;
    stepCar(world, car, world.chaos ? applyControlEffects(world.chaos, car, raw, cfg) : raw, cfg, now, events);
  }
  stepSlipstream(world.cars, cfg, now, events);
  collideCars(world.cars, now, cfg.car, events);
  if (world.chaos) {
    stepEnvelopes(world, world.chaos, cfg, now, events);
    stepPuddles(world, world.chaos, cfg, now, events);
    stepBoxes(world, world.chaos, cfg.sim.dt, now, events);
    recordHistory(world, world.chaos, cfg, now);
  }
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
      if (world.chaos) forgetHistory(world.chaos, car.id);
      events.push({ type: 'respawn', car: car.id, gate: car.lastGate });
      return;
    }
    input = NO_INPUT;
  } else if (input.respawn) {
    startRespawn(car, now, cfg, 'button', events);
    input = NO_INPUT;
  }

  // Item effects: a Firewall runs down; spinning out = no control, the car twirls and slows.
  if (car.shieldTicks > 0) car.shieldTicks--;
  if (car.blueScreenTicks > 0) car.blueScreenTicks--;
  const spinning = car.spinTicks > 0;
  if (spinning) {
    car.spinTicks--;
    input = NO_INPUT;
    const spin = world.chaos?.cfg.spin;
    if (spin) {
      car.yaw = wrapAngle(car.yaw + TAU * spin.turnsPerSec * dt);
      const keep = Math.exp(-spin.slowPerSec * dt);
      car.vx *= keep;
      car.vz *= keep;
    }
  }

  // Spun out or fading to a respawn: a drift ends with no boost (letting go of the key would reward it).
  if (spinning || car.respawnAtTick >= 0) cancelDrift(car, cfg, events);

  // 2. Nitro, engine heat (a stalled engine gives no gas), drift (Space held), then drive
  // (on the ground only), move, fall, hit walls.
  stepNitro(car, input, cfg, now, events);
  input = stepHeat(car, input, Math.hypot(car.vx, car.vz), cfg, now, events);
  input = stepDrift(car, input, dot({ x: car.vx, z: car.vz }, forward(car.yaw)), track, cfg, events);
  stepTrick(car, cfg, events);
  const flying = isAirborne(car);
  if (!flying && !spinning) drive(car, input, cfg.car, cfg, dt);
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  const impact = fall(car, cfg.car, dt);
  if (flying && !isAirborne(car)) landTrick(car, cfg, events);
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
  // Cooling fans: a sideways shove along the road's right (+) or left (-) while on the ground.
  const push = grounded ? zones.find((z) => z.type === 'push') : undefined;
  if (push) {
    const k = (push.toward === 'right' ? 1 : -1) * push.strength * dt;
    car.vx += -loc.dir.z * k;
    car.vz += loc.dir.x * k;
  }

  // Gates count only in order, so driving backwards over one does not move the respawn point.
  const sectors = track.gates.length;
  const sector = Math.min(Math.floor(car.progress * sectors), sectors - 1);
  const next = (car.lastGate + 1) % sectors;
  if (sector === next) {
    car.lastGate = next;
    if (next === 0) car.lap++;
    events.push({ type: 'checkpoint', car: car.id, gate: next });
  }

  // Swap lane: entering it (once per lap, from its `minLap`) swaps the seats (the server
  // does that on the event) and fully cools the engine. Inside it the car is slower (drive).
  const swap = zones.find((z) => z.type === 'swap');
  if (swap && !car.onSwap && car.lap >= swap.minLap && car.swappedLap !== car.lap) {
    car.swappedLap = car.lap;
    car.heat = 0;
    car.stallUntilTick = -1;
    events.push({ type: 'swap', car: car.id });
  }
  car.onSwap = swap !== undefined;

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
