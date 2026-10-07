import { describe, expect, it } from 'vitest';
import type { GameListing } from '@escape/shared';
import { loadTrack, loadTuning } from '../content';
import { hostFormHtml, type HostOptions } from './hostScreen';
import { gameListHtml } from './joinScreen';
import { trackMapSvg } from './trackMap';

const opts: HostOptions = {
  tracks: [{ id: 'office', name: 'The Office', map: '<svg></svg>' }, { id: 'break-room', name: 'The Break Room', map: '<svg></svg>' }],
  minLaps: 1, maxLaps: 10, defaultLaps: 3, defaultName: 'Office race',
};
const race = { name: 'Lunch Cup', track: 'office', mode: 'race' as const, laps: 3, bots: true, chaos: true };

describe('host window (P12.1)', () => {
  it('shows the chosen track, laps and switches; a battle has no laps or chaos switch', () => {
    const html = hostFormHtml(opts, race, false);
    expect(html).toContain('class="track-card on" data-track="office"');
    expect(html).toContain('data-action="laps-up"');
    expect(html).toContain('data-key="chaos"');
    const battle = hostFormHtml(opts, { ...race, mode: 'battle' }, false);
    expect(battle).not.toContain('data-action="laps-up"');
    expect(battle).not.toContain('data-key="chaos"');
  });

  it('no name or busy: CREATE is off; the name is escaped', () => {
    expect(hostFormHtml(opts, { ...race, name: '  ' }, false)).toMatch(/data-action="create" disabled/);
    expect(hostFormHtml(opts, race, true)).toMatch(/data-action="create" disabled/);
    expect(hostFormHtml(opts, { ...race, name: '<b>x' }, false)).toContain('value="&lt;b&gt;x"');
  });
});

const game = (over: Partial<GameListing>): GameListing => ({
  id: 'g', name: 'Lunch Cup', host: 'Dina', track: 'office', mode: 'race', phase: 'lobby', players: 2, maxPlayers: 24, isDefault: false, ...over,
});
const deps = { trackName: (id: string) => `T:${id}`, trackMap: () => '<svg></svg>' };

describe('join list (P12.1)', () => {
  it('names the always-open game, escapes typed names, shows status and players', () => {
    const html = gameListHtml([game({ isDefault: true, name: '' }), game({ id: 'h', name: '<i>hax', host: '<b>' , phase: 'racing', mode: 'battle' })], deps, null, true);
    expect(html).toContain('Office game (always open)');
    expect(html).toContain('&lt;i&gt;hax');
    expect(html).not.toContain('<i>hax');
    expect(html).toContain('racing now');
    expect(html).toContain('Battle');
    expect(html).toContain('2/24');
  });

  it('a full game cannot be joined; one join at a time', () => {
    expect(gameListHtml([game({ players: 24 })], deps, null, false)).toMatch(/data-join="g" disabled/);
    const joining = gameListHtml([game({}), game({ id: 'h' })], deps, 'g', false);
    expect(joining).toContain('Joining');
    expect(joining).toMatch(/data-join="h" disabled/);
  });

  it('empty or unreachable', () => {
    expect(gameListHtml([], deps, null, true)).toContain('Host a game instead');
    expect(gameListHtml([], deps, null, false)).not.toContain('data-action="host"');
    expect(gameListHtml(null, deps, null, true)).toContain('Cannot reach');
  });
});

describe('track mini map (P12.1)', () => {
  it('is an SVG outline with the start marked, built once per track', () => {
    const track = loadTrack('office', loadTuning());
    const svg = trackMapSvg(track);
    expect(svg).toMatch(/^<svg class="track-map" viewBox="0 0 100 64"/);
    expect(svg).toMatch(/<path d="M[\d. ]+L/);
    expect(svg).toContain('track-map-start');
    expect(trackMapSvg(track)).toBe(svg);
  });
});
