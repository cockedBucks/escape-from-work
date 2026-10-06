import { describe, expect, it } from 'vitest';
import realItems from '../../../../config/items.json';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import realTuning from '../../../../config/tuning.json';
import { botInput } from '../bot/driver';
import { newBotMemory } from '../bot/engineer';
import { parseItems } from '../config/items';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { createCarOnGrid, createWorld } from '../sim/car';
import { hashWorld } from '../sim/hash';
import { step } from '../sim/step';
import type { CarInput, SimEvent } from '../sim/types';
import { buildTrack } from '../track/build';
import { createChaos } from './chaos';

const cfg = parseTuning(realTuning);
const items = parseItems(realItems);
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);

/** Four skilled bots, chaos on, until all have done `laps` laps (or time runs out). */
function chaosRace(laps: number, seed: number) {
  const cars = [0, 1, 2, 3].map((i) => createCarOnGrid(`car${i}`, { speed: 1, grip: 1, weight: 1 }, track, i, cfg.race));
  const world = createWorld(track, cars);
  world.chaos = createChaos(track, items, seed);
  const memory = new Map(world.cars.map((c) => [c.id, newBotMemory(2)]));
  const counts: Record<string, number> = {};
  const maxTicks = Math.round(240 / cfg.sim.dt);
  while (world.tick < maxTicks && world.cars.some((c) => c.lap <= laps)) {
    const inputs: Record<string, CarInput> = {};
    for (const c of world.cars) inputs[c.id] = botInput(c, track, cfg, memory.get(c.id)!, world.cars);
    for (const e of step(world, inputs, cfg) as SimEvent[]) counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  return { world, counts };
}

describe('a chaos race with skilled bots', () => {
  const { world, counts } = chaosRace(2, 5);

  it('every car finishes 2 laps; nothing breaks (no NaN, no car lost)', () => {
    expect(world.cars.every((c) => c.lap > 2)).toBe(true);
    expect(world.cars.every((c) => Number.isFinite(c.x) && Number.isFinite(c.z))).toBe(true);
  });

  it('bots pick up and use items, and items hit cars', () => {
    expect(counts['itemBox'] ?? 0).toBeGreaterThan(4);
    expect(counts['itemUse'] ?? 0).toBeGreaterThan(2);
    expect(counts['itemHit'] ?? 0).toBeGreaterThan(0);
  });

  it('is deterministic: the same seed gives the same race', () => {
    expect(hashWorld(chaosRace(2, 5).world)).toBe(hashWorld(world));
  });
});
