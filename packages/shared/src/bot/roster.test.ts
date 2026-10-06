import { describe, expect, it } from 'vitest';
import realCars from '../../../../config/cars.json';
import officeJson from '../../../../config/tracks/office.json';
import serverRoomJson from '../../../../config/tracks/server-room.json';
import smartOasisJson from '../../../../config/tracks/smart-oasis.json';
import testLoopJson from '../../../../config/tracks/test-loop.json';
import realTuning from '../../../../config/tuning.json';
import { parseCars } from '../config/cars';
import { parseTrack } from '../config/track';
import { parseTuning } from '../config/tuning';
import { buildTrack } from '../track/build';
import { runBotRace } from './race';

const cfg = parseTuning(realTuning);
const roster = parseCars(realCars);
/** Every track the roster must be balanced on. */
const TRACKS = [['test-loop', testLoopJson], ['office', officeJson], ['server-room', serverRoomJson], ['smart-oasis', smartOasisJson]] as const;

describe('roster balance (GAME_DESIGN §8)', () => {
  for (const [id, json] of TRACKS) {
    it(`on ${id}: every car's 3-lap bot time is within lapSpread of the roster median`, () => {
      const track = buildTrack(parseTrack(json, id), cfg.track);
      const times = roster.cars.map((car) => {
        const race = runBotRace(track, cfg, { cars: 1, laps: 3, maxSeconds: 300, stats: car.stats });
        expect(race.finished).toBe(true);
        return { id: car.id, t: race.cars[0]!.lapTimes.reduce((a, b) => a + b, 0) };
      });
      const sorted = times.map((x) => x.t).sort((a, b) => a - b);
      const mid = sorted.length / 2;
      const median = sorted.length % 2 ? sorted[Math.floor(mid)]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
      const off = times.filter((x) => Math.abs(x.t - median) / median > roster.lapSpread).map((x) => x.id);
      expect(off).toEqual([]);
    });
  }
});
