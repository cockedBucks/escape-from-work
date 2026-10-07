import { describe, expect, it } from 'vitest';
import { lobbyHtml, trackHtml, type LobbyView } from './lobbyScreen';

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
  it("shows each team's car; only its own players get the ◀ ▶ picker", () => {
    const roster = [{ id: 'spoiler-alert', name: 'Spoiler Alert' }, { id: 'cabbie', name: 'Cabbie' }];
    const html = lobbyHtml(base({ carModels: ['cabbie', 'spoiler-alert'], roster }), limits);
    expect(html).toContain('data-action="car-next" data-slot="0"');
    expect(html).not.toContain('data-action="car-next" data-slot="1"');
    expect(html).toContain('<span>Cabbie</span>');
    expect(html).toContain('<span>Spoiler Alert</span>');
  });

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

describe('track line (P10.0)', () => {
  const tracks = [{ id: 'office', name: 'The Office' }, { id: 'server-room', name: 'Server <Room>' }];
  it('the host gets a drop-down (current track selected); everyone else just sees the name', () => {
    const mine = trackHtml(base({ track: 'office', tracks }));
    expect(mine).toContain('<select data-action="track"');
    expect(mine).toContain('<option value="office" selected>The Office</option>');
    expect(mine).toContain('<option value="server-room">Server &lt;Room&gt;</option>');
    const other = trackHtml(base({ track: 'server-room', tracks, host: 'b' }));
    expect(other).not.toContain('select');
    expect(other).toContain('Server &lt;Room&gt;');
  });

  it('no drop-down when there is only one track; nothing before the state arrives', () => {
    expect(trackHtml(base({ track: 'office', tracks: tracks.slice(0, 1) }))).not.toContain('select');
    expect(trackHtml(base({}))).toBe('');
  });
});

describe('lobby battle switch (P11.6)', () => {
  it('the host switches Race ↔ Battle; a battle shows its rules instead of laps and no chaos switch', () => {
    const race = lobbyHtml(base(), limits);
    expect(race).toContain('data-action="mode"');
    expect(race).toContain('data-action="laps-up"');
    const battle = lobbyHtml(base({ mode: 'battle', battle: { lives: 3, minutes: 2.5 } }), limits);
    expect(battle).toContain('Battle');
    expect(battle).toContain('×3');
    expect(battle).not.toContain('data-action="laps-up"');
    expect(battle).not.toContain('data-action="chaos"');
    const guest = lobbyHtml(base({ mode: 'battle', host: 'b' }), limits);
    expect(guest).toContain('Battle · waiting for');
    expect(guest).not.toContain('data-action="mode"');
  });
});
