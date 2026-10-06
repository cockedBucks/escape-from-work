import { describe, expect, it } from 'vitest';
import realItems from '../../../../config/items.json';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import realTuning from '../../../../config/tuning.json';
import { ITEM_IDS, parseItems, type ItemId } from '../config/items';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { createCar, createWorld } from '../sim/car';
import { hashWorld } from '../sim/hash';
import { step } from '../sim/step';
import { NO_INPUT, type SimEvent, type World } from '../sim/types';
import { buildTrack } from '../track/build';
import { Rng } from '../util/rng';
import { createChaos } from './chaos';
import { bucketOf, racePlaces, rollItem } from './roll';

const cfg = parseTuning(realTuning);
const items = parseItems(realItems);
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);
const STATS = { speed: 1, grip: 1, weight: 1 };
const STRONG: ItemId[] = ['blueScreen', 'lagSpike', 'controlSwap', 'forcedUpdate'];

describe('items config and roll table', () => {
  it('the real items.json is valid and every bucket sums to 100', () => {
    for (const bucket of ['front', 'mid', 'back'] as const) {
      expect(ITEM_IDS.reduce((sum, id) => sum + items.roll[bucket][id], 0)).toBe(100);
    }
  });

  it('a bucket that does not sum to 100 is rejected', () => {
    const bad = JSON.parse(JSON.stringify(realItems)) as typeof realItems;
    bad.roll.mid.replyAll += 1;
    expect(() => parseItems(bad)).toThrow(/sum to 100/);
  });

  it('rubber-banding: the further back, the more of the strong items', () => {
    const strong = (b: 'front' | 'mid' | 'back') => STRONG.reduce((s, id) => s + items.roll[b][id], 0);
    expect(strong('front')).toBeLessThan(strong('mid'));
    expect(strong('mid')).toBeLessThan(strong('back'));
  });

  it('buckets: top 25% front, bottom 25% back; a lone car is mid', () => {
    expect(bucketOf(1, 1)).toBe('mid');
    expect([1, 2].map((p) => bucketOf(p, 2))).toEqual(['front', 'back']);
    expect([1, 2, 3, 4].map((p) => bucketOf(p, 4))).toEqual(['front', 'mid', 'mid', 'back']);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((p) => bucketOf(p, 8))).toEqual(['front', 'front', 'mid', 'mid', 'mid', 'mid', 'back', 'back']);
  });

  it('rolls follow the weights and never give a 0-weight item; same seed = same items', () => {
    const rng = new Rng(7);
    const counts = Object.fromEntries(ITEM_IDS.map((id) => [id, 0])) as Record<ItemId, number>;
    const N = 20_000;
    for (let i = 0; i < N; i++) counts[rollItem(items, 'back', rng)]++;
    for (const id of ITEM_IDS) expect(Math.abs((100 * counts[id]) / N - items.roll.back[id])).toBeLessThan(1.5);
    const front = new Rng(1);
    for (let i = 0; i < 2000; i++) expect(STRONG).not.toContain(rollItem(items, 'front', front));
    const a = new Rng(42);
    const b = new Rng(42);
    expect(Array.from({ length: 50 }, () => rollItem(items, 'mid', a))).toEqual(Array.from({ length: 50 }, () => rollItem(items, 'mid', b)));
  });
});

describe('race places for rolls', () => {
  it('more laps beats more progress; cars still behind the start line count as last', () => {
    const lead = createCar('a', STATS, track);
    lead.lap = 2;
    lead.progress = 0.1;
    lead.lastGate = 0;
    const mid = createCar('b', STATS, track);
    mid.lap = 1;
    mid.progress = 0.8;
    mid.lastGate = 4;
    const grid = createCar('c', STATS, track);
    grid.lap = 1;
    grid.progress = 0.97; // on the grid, behind the line
    grid.lastGate = 0;
    expect(Object.fromEntries(racePlaces([grid, mid, lead]))).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe('item boxes', () => {
  /** A chaos world with one car parked on the first box. */
  function onBox(): World {
    const world = createWorld(track, [createCar('a', STATS, track)]);
    world.chaos = createChaos(track, items, 1);
    const box = world.chaos.boxes[0]!;
    world.cars[0]!.x = box.x;
    world.cars[0]!.z = box.z;
    return world;
  }
  const run = (w: World, n: number): SimEvent[] => {
    const events: SimEvent[] = [];
    for (let i = 0; i < n; i++) events.push(...step(w, { a: NO_INPUT }, cfg));
    return events;
  };

  it('each itemRow zone lays its boxes evenly across the road', () => {
    const chaos = createChaos(track, items, 1);
    const rows = track.def.zones.filter((z) => z.type === 'itemRow');
    expect(chaos.boxes).toHaveLength(rows.reduce((n, z) => n + ('count' in z ? z.count : 0), 0));
  });

  it('driving through a box gives one item and breaks it until it respawns', () => {
    const w = onBox();
    const first = run(w, 1).filter((e) => e.type === 'itemBox');
    expect(first).toHaveLength(1);
    expect(ITEM_IDS).toContain(w.cars[0]!.item);
    expect(first[0]).toMatchObject({ car: 'a', box: 0, item: w.cars[0]!.item });
    // Gone while broken, even though the car sits on it.
    const respawnTicks = Math.round(items.boxes.respawnSeconds / cfg.sim.dt);
    expect(run(w, respawnTicks - 2).some((e) => e.type === 'itemBox')).toBe(false);
    // Back again: the slot is full, so the box breaks but gives nothing new.
    const held = w.cars[0]!.item;
    const again = run(w, 3).filter((e) => e.type === 'itemBox');
    expect(again).toEqual([{ type: 'itemBox', car: 'a', box: 0, item: null }]);
    expect(w.cars[0]!.item).toBe(held);
  });

  it('is deterministic (same seed, same items and hash) and leaves chaos-off worlds untouched', () => {
    const a = onBox();
    const b = onBox();
    run(a, 5);
    run(b, 5);
    expect(a.cars[0]!.item).toBe(b.cars[0]!.item);
    expect(hashWorld(a)).toBe(hashWorld(b));
    const off = createWorld(track, [createCar('a', STATS, track)]);
    const box = createChaos(track, items, 1).boxes[0]!;
    off.cars[0]!.x = box.x;
    off.cars[0]!.z = box.z;
    expect(run(off, 5).some((e) => e.type === 'itemBox')).toBe(false);
    expect(off.cars[0]!.item).toBe('');
  });
});
