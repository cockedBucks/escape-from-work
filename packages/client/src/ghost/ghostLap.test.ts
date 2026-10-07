import { describe, expect, it } from 'vitest';
import { GhostRecorder, LapWatch, ghostPoseAt, parseGhost, type GhostPose } from './ghostLap';
import { GHOST } from '../render/look';

/** Drive in a straight line along x at 10 m/s, one frame every 16 ms, for `ms`. */
function record(rec: GhostRecorder, start: number, ms: number): void {
  for (let t = start; t <= start + ms; t += 16) rec.add(t, ((t - start) / 1000) * 10, 0, 0, 0);
}

describe('ghost lap (P11.1)', () => {
  it('records a lap, resamples it, and plays it back where the car was', () => {
    const rec = new GhostRecorder();
    rec.start(1000);
    record(rec, 1000, 3000);
    const lap = rec.finish(4000, 'office', 'cabbie');
    expect(lap).not.toBeNull();
    expect(lap!.lapMs).toBe(3000);
    expect(lap!.f.length / 4).toBe(3 * GHOST.hz + 1);
    const out: GhostPose = { x: 0, y: 0, z: 0, yaw: 0 };
    expect(ghostPoseAt(lap!, 1500, out)!.x).toBeCloseTo(15, 0);
    expect(ghostPoseAt(lap!, 3001, out)).toBeNull(); // its lap is over
    expect(rec.recording).toBe(false);
  });

  it('a gap in the frames (hidden tab) spoils the lap', () => {
    const rec = new GhostRecorder();
    rec.start(0);
    record(rec, 0, 1000);
    record(rec, 1000 + GHOST.maxGapMs + 100, 1000);
    expect(rec.finish(3000, 'office', 'cabbie')).toBeNull();
  });

  it('nothing recorded without a lap start', () => {
    const rec = new GhostRecorder();
    record(rec, 0, 1000);
    expect(rec.finish(1000, 'office', 'cabbie')).toBeNull();
  });

  it('turning through ±π takes the short way', () => {
    const rec = new GhostRecorder();
    rec.start(0);
    rec.add(0, 0, 0, 0, Math.PI - 0.1);
    rec.add(100, 0, 0, 0, -Math.PI + 0.1);
    const lap = rec.finish(100, 'office', 'cabbie')!;
    const mid = ghostPoseAt(lap, 50, { x: 0, y: 0, z: 0, yaw: 0 })!;
    expect(Math.abs(Math.abs(mid.yaw) - Math.PI)).toBeLessThan(0.06);
  });

  it('stored ghosts are checked', () => {
    const good = JSON.stringify({ track: 'office', car: 'cabbie', lapMs: 40000, hz: 20, f: [0, 0, 0, 0] });
    expect(parseGhost(good, 'office')?.lapMs).toBe(40000);
    expect(parseGhost(good, 'server-room')).toBeNull();
    expect(parseGhost('{"track":"office"}', 'office')).toBeNull();
    expect(parseGhost('not json', 'office')).toBeNull();
    expect(parseGhost(null, 'office')).toBeNull();
  });

  it('lap starts and ends come from the race state', () => {
    const w = new LapWatch();
    expect(w.update('countdown', 0, false)).toEqual({ ended: false, started: false, stopped: false });
    expect(w.update('racing', 0, false)).toEqual({ ended: false, started: true, stopped: false });
    expect(w.update('racing', 0, false).started).toBe(false);
    expect(w.update('racing', 1, false)).toEqual({ ended: true, started: true, stopped: false });
    expect(w.update('racing', 3, true)).toEqual({ ended: true, started: false, stopped: false });
    expect(w.update('results', 3, true)).toEqual({ ended: false, started: false, stopped: true });
  });

  it('a page loaded mid-race waits for the next lap start', () => {
    const w = new LapWatch();
    expect(w.update('racing', 1, false).started).toBe(false);
    expect(w.update('racing', 2, false)).toEqual({ ended: true, started: true, stopped: false });
  });
});
