import { describe, expect, it } from 'vitest';
import realTuning from '../../../../config/tuning.json';
import { parseTuning } from '../config/tuning';
import {
  chooseHost,
  countdownLeft,
  countdownTicks,
  inputsAllowed,
  lapsProblem,
  newFlow,
  seatChangesAllowed,
  startCountdown,
  startProblem,
  stepFlow,
  toLobby,
} from './flow';

const cfg = parseTuning(realTuning);
const race = cfg.race;
const dt = cfg.sim.dt;

function hosted(host = 'h') {
  const f = newFlow(race);
  f.host = host;
  return f;
}

describe('race flow', () => {
  it('starts in the lobby with the default laps', () => {
    const f = newFlow(race);
    expect(f.phase).toBe('lobby');
    expect(f.laps).toBe(race.defaultLaps);
  });

  it('only the host may start, only between races, only with someone in a car', () => {
    const f = hosted();
    expect(startProblem(f, 'other', 1)).toMatch(/only the host/);
    expect(startProblem(f, 'h', 0)).toMatch(/nobody/);
    expect(startProblem(f, 'h', 1)).toBeNull();
    startCountdown(f, 10);
    expect(startProblem(f, 'h', 1)).toMatch(/already/);
  });

  it('countdown → racing after countdownSeconds, then racing → results when the race is over', () => {
    const f = hosted();
    startCountdown(f, 100);
    const n = countdownTicks(race, dt);
    expect(stepFlow(f, 100 + n - 1, race, dt, false)).toBeNull();
    expect(stepFlow(f, 100 + n, race, dt, false)).toBe('racing');
    expect(f.phaseTick).toBe(100 + n);
    expect(stepFlow(f, 100 + n + 50, race, dt, false)).toBeNull();
    expect(stepFlow(f, 100 + n + 60, race, dt, true)).toBe('results');
    expect(f.phase).toBe('results');
  });

  it('a race over signal outside racing changes nothing', () => {
    const f = hosted();
    expect(stepFlow(f, 5, race, dt, true)).toBeNull();
    expect(f.phase).toBe('lobby');
  });

  it('results → countdown (rematch) or → lobby', () => {
    const f = hosted();
    f.phase = 'results';
    expect(startProblem(f, 'h', 2)).toBeNull();
    startCountdown(f, 1);
    expect(f.phase).toBe('countdown');
    f.phase = 'results';
    toLobby(f, 2);
    expect(f.phase).toBe('lobby');
  });

  it('counts down in seconds', () => {
    const f = hosted();
    expect(countdownLeft(f, 0, race, dt)).toBe(0);
    startCountdown(f, 0);
    expect(countdownLeft(f, 0, race, dt)).toBeCloseTo(race.countdownSeconds, 5);
    expect(countdownLeft(f, countdownTicks(race, dt), race, dt)).toBe(0);
  });

  it('seats lock and controls freeze at the right times', () => {
    expect(seatChangesAllowed('lobby')).toBe(true);
    expect(seatChangesAllowed('results')).toBe(true);
    expect(seatChangesAllowed('countdown')).toBe(false);
    expect(seatChangesAllowed('racing')).toBe(false);
    expect(inputsAllowed('countdown')).toBe(false);
    expect(inputsAllowed('racing')).toBe(true);
    expect(inputsAllowed('lobby')).toBe(true);
  });

  it('laps: host only, between races, within limits', () => {
    const f = hosted();
    expect(lapsProblem(f, 'x', 3, race)).toMatch(/only the host/);
    expect(lapsProblem(f, 'h', race.maxLaps + 1, race)).toMatch(/laps must be/);
    expect(lapsProblem(f, 'h', 2.5, race)).toMatch(/laps must be/);
    expect(lapsProblem(f, 'h', race.minLaps, race)).toBeNull();
    startCountdown(f, 0);
    expect(lapsProblem(f, 'h', 3, race)).toMatch(/not during/);
  });
});

describe('chooseHost', () => {
  const all = () => true;
  it('the first player is host and keeps it', () => {
    expect(chooseHost(['a', 'b'], all, null)).toBe('a');
    expect(chooseHost(['a', 'b'], all, 'b')).toBe('b');
  });

  it('passes to the earliest connected player when the host leaves or drops', () => {
    expect(chooseHost(['b', 'c'], all, 'a')).toBe('b');
    expect(chooseHost(['a', 'b', 'c'], (id) => id !== 'a' && id !== 'b', 'a')).toBe('c');
    expect(chooseHost([], all, 'a')).toBeNull();
  });
});
