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
  botSlots: [],
  ...over,
});

describe('lobbyHtml', () => {
  it('the host can switch chaos mode (on by default)', () => {
    expect(lobbyHtml(base(), limits)).toContain('data-action="chaos" class="on"');
    expect(lobbyHtml(base({ chaos: false }), limits)).toContain('💥 Chaos: off');
    expect(lobbyHtml(base({ myId: 'b' }), limits)).not.toContain('data-action="chaos"');
  });

  it('shows a how-to-play card per role with its keys, yours highlighted', () => {
    const html = lobbyHtml(base(), limits);
    for (const role of ['pilot', 'engineer', 'solo']) expect(html).toContain(`data-role="${role}"`);
    expect(html).toContain('class="howto-card mine" data-role="pilot"');
    expect(html).toContain('<kbd>Shift</kbd> nitro');
    expect(html).toContain('SWAP lane');
    const watcher = lobbyHtml(base({ myId: 'nobody' }), limits);
    expect(watcher).not.toContain('howto-card mine');
  });

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

describe('lobbyHtml bots', () => {
  it('shows bot cars as "🤖 bot" and lets you take them over', () => {
    const html = lobbyHtml(base({ botSlots: [2] }), limits);
    expect(html).toMatch(/data-slot="2" data-seat="pilot" >\s*<span class="seat-role">Pilot<\/span><span class="seat-who">🤖 bot/);
  });
});

describe('lobbyHtml faces', () => {
  it('shows a face picker when the host has faces and marks yours', () => {
    const html = lobbyHtml(base({ faces: [{ file: 'dina.png', name: 'dina' }], players: [{ id: 'me', name: 'Me', slot: 0, seat: 'pilot', connected: true, ready: false, face: 'dina.png' }] }), limits);
    expect(html).toContain('class="face-picker"');
    expect(html).toMatch(/class="face mine" data-action="face" data-face="dina.png"/);
    expect(html).toContain('src="/faces/dina.png"');
  });

  it('no picker without faces; file names cannot inject HTML', () => {
    expect(lobbyHtml(base(), limits)).not.toContain('face-picker');
    const html = lobbyHtml(base({ faces: [{ file: 'a"b.png', name: '<b>x</b>' }] }), limits);
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('data-face="a&quot;b.png"');
  });
});
