import { cornerAhead } from '../bot/engineer';
import { aimAngle } from '../bot/route';
import type { Tuning } from '../config/tuning';
import type { Track } from '../track/build';
import { locateOnTrack } from '../track/locate';
import { clamp } from '../util/math';
import { isAirborne } from './air';
import type { CarInput, CarState, SimEvent } from './types';

/** Forget any drift and boost (respawn). The nitro meter stays. */
export function resetDrift(car: CarState): void {
  car.driftDir = 0;
  car.driftCharge = 0;
  car.driftLevel = 0;
  car.boostTicks = 0;
}

function endDrift(car: CarState, reward: boolean, cfg: Tuning, events: SimEvent[]): void {
  const level = car.driftLevel;
  if (reward && level > 0) {
    const d = cfg.drift;
    car.boostTicks = Math.round(d.boostSeconds[level - 1]! / cfg.sim.dt);
    car.nitro = Math.min(1, car.nitro + d.nitroPerLevel[level - 1]!);
    events.push({ type: 'boost', car: car.id, level });
  }
  car.driftDir = 0;
  car.driftCharge = 0;
  car.driftLevel = 0;
}

/** End a drift with no boost (spun out by an item, respawning). */
export function cancelDrift(car: CarState, cfg: Tuning, events: SimEvent[]): void {
  if (car.driftDir !== 0) endDrift(car, false, cfg, events);
}

/** The shortcut the car is on right now (as a bot route), so the assist follows it, not the main road. */
function routeOf(car: CarState, track: Track): number[] {
  if (track.branches.length === 0) return [];
  const road = locateOnTrack(track, { x: car.x, z: car.z }, car.segment).road;
  return road > 0 ? [road - 1] : [];
}

/**
 * Which way to drift (-1 left, +1 right, 0 = not yet): the side the player steers, else the
 * side the wheel is already turned, else the bend ahead (so a player who only holds Space
 * still drifts into the corner: the human's "you do not have to turn").
 */
function pickDirection(car: CarState, input: CarInput, track: Track, cfg: Tuning): number {
  const d = cfg.drift;
  if (Math.abs(input.steer) > d.steerPick) return Math.sign(input.steer);
  if (Math.abs(car.steer) > d.steerPick) return Math.sign(car.steer);
  const bend = cornerAhead(car, track, d.autoLookAhead, routeOf(car, track));
  // Curvature + turns left; drifting left is -1.
  return Math.abs(bend) >= d.autoMinCurvature ? -Math.sign(bend) : 0;
}

/**
 * Kart drift for one tick (P13.2, GAME_DESIGN §5), before driving. Hold the drift key (Space)
 * at speed: the car hops into a drift toward your steering or the bend ahead, and charges a
 * mini-turbo in three levels while the key stays down. Steering only makes it tighter (into the
 * drift) or wider (out); with no steering key held it follows the road by itself (`drift.assist`).
 * Letting go of the key ends it: boost + nitro for the level reached. Too slow ends it with nothing.
 * `vF` = forward speed. Returns the input to drive with.
 */
export function stepDrift(car: CarState, input: CarInput, vF: number, track: Track, cfg: Tuning, events: SimEvent[]): CarInput {
  const d = cfg.drift;
  const dt = cfg.sim.dt;
  const top = cfg.car.topSpeed * car.stats.speed;
  if (car.boostTicks > 0) car.boostTicks--;
  const held = input.drift === true;
  car.driftKeyTicks = held ? car.driftKeyTicks + 1 : 0;

  if (car.driftDir === 0) {
    // Not drifting: the held key waits (armed) until the car is fast, on the ground, and has a side.
    if (!held || isAirborne(car) || vF < d.minSpeedRatio * top) return input;
    const dir = pickDirection(car, input, track, cfg);
    if (dir === 0) return input;
    car.driftDir = dir;
    car.driftCharge = 0;
    car.driftLevel = 0;
    events.push({ type: 'driftStart', car: car.id, dir });
  } else if (!held) {
    endDrift(car, true, cfg, events);
    return input;
  } else if (vF < d.exitSpeedRatio * top) {
    endDrift(car, false, cfg, events);
    return input;
  }

  car.driftCharge += dt;
  let level = 0;
  while (level < d.levelSeconds.length && car.driftCharge >= d.levelSeconds[level]!) level++;
  if (level > car.driftLevel) {
    car.driftLevel = level;
    events.push({ type: 'driftLevel', car: car.id, level });
  }
  if (!d.assist || Math.abs(input.steer) > d.steerPick) return input;
  // No steering key: aim along the road like a bot does (tighter or wider inside the drift).
  const steer = clamp(-aimAngle(car, track, cfg.bot, routeOf(car, track)) * cfg.bot.steerGain, -1, 1);
  return { ...input, steer };
}
