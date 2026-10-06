import { describe, expect, it } from 'vitest';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import realTuning from '../../../../config/tuning.json';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { createCar } from '../sim/car';
import { buildTrack } from '../track/build';
import { botItem } from './items';

const cfg = parseTuning(realTuning);
const track = buildTrack(parseTrack(testLoopJson, 'test-loop'), cfg.track);
const STATS = { speed: 1, grip: 1, weight: 1 };

/** A car at (x, z) facing +Z (yaw 0) holding `item`. */
function carAt(id: string, x: number, z: number, item = '') {
  const c = createCar(id, STATS, track);
  c.x = x;
  c.z = z;
  c.yaw = 0;
  c.item = item;
  return c;
}

describe('bot item use', () => {
  it('plain bots (skill 0) never use items', () => {
    expect(botItem(carAt('a', 0, 0, 'firewall'), [], cfg, 0).fire).toBe(false);
  });

  it('Firewall and the targeted items go at once', () => {
    for (const item of ['firewall', 'blueScreen', 'lagSpike', 'controlSwap', 'forcedUpdate']) {
      expect(botItem(carAt('a', 0, 0, item), [], cfg, 1).fire).toBe(true);
    }
  });

  it('Ctrl+Z waits for trouble (spin, stall, an item effect)', () => {
    const a = carAt('a', 0, 0, 'ctrlZ');
    expect(botItem(a, [], cfg, 1).fire).toBe(false);
    a.spinTicks = 10;
    expect(botItem(a, [], cfg, 1).fire).toBe(true);
  });

  it('Reply-All fires at a car in its sights ahead, or aims back at one behind', () => {
    const a = carAt('a', 0, 0, 'replyAll');
    expect(botItem(a, [carAt('b', 30, 0)], cfg, 1).fire).toBe(false); // off to the side
    expect(botItem(a, [carAt('b', 0, 30)], cfg, 1)).toEqual({ fire: true, aimBack: false });
    expect(botItem(a, [carAt('b', 0, -30)], cfg, 1)).toEqual({ fire: true, aimBack: true });
    expect(botItem(a, [carAt('b', 0, cfg.bot.itemAimRange + 10)], cfg, 1).fire).toBe(false);
  });

  it('Coffee Spill waits for a car close behind', () => {
    const a = carAt('a', 0, 0, 'coffeeSpill');
    expect(botItem(a, [carAt('b', 0, 20)], cfg, 1).fire).toBe(false);
    expect(botItem(a, [carAt('b', 0, -(cfg.bot.itemDropRange - 2))], cfg, 1).fire).toBe(true);
  });
});
