import { describe, expect, it } from 'vitest';
import { lobbyHtml, type LobbyView } from './lobbyScreen';

const limits = { maxCars: 4, minLaps: 1, maxLaps: 10 };
const base = (over: Partial<LobbyView> = {}): LobbyView => ({
  players: [
    { id: 'me', name: 'Me', slot: 0, seat: 'pilot', connected: true, ready: false },
    { id: 'b', name: 'Bea <script>', slot: 0, seat: 'engineer', connected: true, ready: true },
    { id: 'c', name: 'Cy', slot: 1, seat: 'solo', connected: false, ready: false },
  ],
  myId: 'me',
  host: 'me',
  phase: 'lobby',
  laps: 3,
  teams: ['Ctrl Freaks', '404 Not Found', 'C', 'D'],
  bots: false,
  ...over,
});

describe('lobbyHtml', () => {
  it('shows host controls only to the host', () => {
    expect(lobbyHtml(base(), limits)).toContain('START RACE');
    const guest = lobbyHtml(base({ myId: 'b' }), limits);
    expect(guest).not.toContain('START RACE');
    expect(guest).toContain('waiting for <strong>Me</strong>');
  });

  it('escapes player names and marks ready / away players', () => {
    const html = lobbyHtml(base(), limits);
    expect(html).toContain('✓ Bea &lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Cy (away)');
  });

  it('lets you rename your own team (and the host any team)', () => {
    const guest = lobbyHtml(base({ myId: 'b', host: 'c' }), limits);
    expect(guest).toContain('<input class="team-name" data-slot="0"');
    expect(guest).not.toContain('<input class="team-name" data-slot="1"');
  });

  it('says REMATCH after a race and disables laps at the limits', () => {
    expect(lobbyHtml(base({ phase: 'results' }), limits)).toContain('REMATCH');
    expect(lobbyHtml(base({ laps: 1 }), limits)).toMatch(/data-action="laps-down" disabled/);
    expect(lobbyHtml(base({ laps: 10 }), limits)).toMatch(/data-action="laps-up" disabled/);
  });

  it('is identical for identical input (so redraws can be skipped)', () => {
    expect(lobbyHtml(base(), limits)).toBe(lobbyHtml(base(), limits));
  });
});
