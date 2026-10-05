import { describe, expect, it } from 'vitest';
import css from '../style.css?raw';
import { lobbyHtml } from './lobbyScreen';

// Guard: an unstyled UI piece can break the whole screen (unstyled face photos once pushed the
// lobby seats off-screen). Every class the lobby HTML uses must exist in the stylesheet.
describe('stylesheet covers the lobby', () => {
  it('has a rule for every class in the lobby HTML', () => {
    const html = lobbyHtml(
      {
        players: [{ id: 'me', name: 'Me', slot: 0, seat: 'pilot', connected: true, ready: true, face: 'a.png' }],
        myId: 'me', host: 'me', phase: 'lobby', laps: 3, teams: ['T'], bots: true, botSlots: [1],
        faces: [{ file: 'a.png', name: 'a' }],
      },
      { maxCars: 2, minLaps: 1, maxLaps: 10 },
    );
    expect(css.length).toBeGreaterThan(1000); // the real stylesheet, not an empty stub
    const classes = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1]!.split(/\s+/)));
    const missing = [...classes].filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(css));
    expect(missing).toEqual([]);
  });
});
