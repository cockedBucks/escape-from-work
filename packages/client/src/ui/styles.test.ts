import { describe, expect, it } from 'vitest';
import css from '../style.css?raw';
import { garageHtml, lobbyHtml, type LobbyView } from './lobbyScreen';

// Guard: an unstyled UI piece can break the whole screen (unstyled face photos once pushed the
// lobby seats off-screen). Every class the lobby HTML uses must exist in the stylesheet.
describe('stylesheet covers the lobby', () => {
  it.each(['race', 'battle'])('has a rule for every class in the lobby HTML (%s)', (mode) => {
    const look = { body: 'sedan' as const, wheelScale: 1, parts: [] };
    const stats = { speed: 1, grip: 1, weight: 1 };
    const view: LobbyView = {
      mode,
      players: [{ id: 'me', name: 'Me', slot: 0, seat: 'pilot', connected: true, ready: true, face: 'a.png' }],
      myId: 'me', host: 'me', phase: 'lobby', laps: 3, teams: ['T'], bots: true, botSlots: [1],
      faces: [{ file: 'a.png', name: 'a' }],
      carModels: ['a', 'a'],
      roster: [{ id: 'a', name: 'A', stats, look }, { id: 'b', name: 'B', stats, look }],
    };
    // The lobby with the garage window open (as the page draws it).
    const html = lobbyHtml(view, { maxCars: 2, minLaps: 1, maxLaps: 10 }) + garageHtml(view, 0, 2);
    expect(css.length).toBeGreaterThan(1000); // the real stylesheet, not an empty stub
    const classes = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1]!.split(/\s+/)));
    const missing = [...classes].filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(css));
    expect(missing).toEqual([]);
  });
});
