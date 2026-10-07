import { describe, expect, it } from 'vitest';
import { garageHtml, lobbyHtml, trackHtml, type LobbyCar, type LobbyView } from './lobbyScreen';

const car = (id: string, name: string, body: LobbyCar['look']['body'], speed = 1, grip = 1, weight = 1): LobbyCar => ({
  id, name, stats: { speed, grip, weight }, look: { body, wheelScale: 1, parts: [] },
});
const roster = [car('spoiler-alert', 'Spoiler Alert', 'hatchback', 1.08, 0.92, 1), car('cabbie', 'Cabbie', 'sedan')];

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
  it("shows each team's car picture, name and real-life type; only its own players get ◀ ▶ and the garage", () => {
    const html = lobbyHtml(base({ carModels: ['cabbie', 'spoiler-alert'], roster }), limits);
    expect(html).toContain('data-action="car-next" data-slot="0"');
    expect(html).toContain('data-action="garage" data-slot="0"');
    expect(html).not.toContain('data-action="car-next" data-slot="1"');
    expect(html).not.toContain('data-action="garage" data-slot="1"');
    expect(html).toContain('<img class="car-pic" data-pic="cabbie|0"');
    expect(html).toContain('<img class="car-pic" data-pic="spoiler-alert|1"');
    expect(html).toContain('<strong>Cabbie</strong><span class="car-type">Sedan</span>');
    expect(html).toContain('<strong>Spoiler Alert</strong><span class="car-type">Hatchback</span>');
    // No picking once the race is on.
    expect(lobbyHtml(base({ carModels: ['cabbie'], roster, phase: 'countdown' }), limits)).not.toContain('data-action="garage"');
  });

  it('seats are big buttons with an icon, the role, its job, and who sits there (face) or "Sit here"', () => {
    const html = lobbyHtml(base({ players: [{ id: 'me', name: 'Me', slot: 0, seat: 'pilot', connected: true, ready: false, face: 'dina.png' }] }), limits);
    expect(html).toMatch(/class="seat seat-pilot mine" data-slot="0" data-seat="pilot" >.*🕹️.*Pilot.*steers.*src="\/faces\/dina.png".*Me/);
    expect(html).toMatch(/class="seat seat-engineer open" data-slot="0" data-seat="engineer" >.*🔧.*Engineer.*gas · brake · nitro · items.*Sit here/);
    // Solo is blocked for a car with someone else in it; a free car offers "or drive Solo".
    expect(html).toMatch(/class="seat seat-solo open" data-slot="1" data-seat="solo" >.*or drive Solo/);
    const watcher = lobbyHtml(base({ myId: 'x' }), limits);
    expect(watcher).toMatch(/class="seat seat-solo" data-slot="0" data-seat="solo" disabled/);
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
    expect(html).toMatch(/data-slot="2" data-seat="pilot" >.*<span class="seat-who">🤖 bot<\/span>/);
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

describe('garage window (P12.3)', () => {
  const v = base({ carModels: ['spoiler-alert', 'spoiler-alert', 'cabbie'], roster, statRange: { min: 0.92, max: 1.08 } });

  it('shows every roster car in your team color with type, stats and a horn; yours is marked', () => {
    const html = garageHtml(v, 0, limits.maxCars);
    expect(html).toContain('class="garage"');
    expect(html).toContain('Pick a car for Ctrl Freaks');
    for (const c of roster) {
      expect(html).toContain(`data-action="pick-car" data-slot="0" data-car="${c.id}"`);
      expect(html).toContain(`data-pic="${c.id}|0"`);
      expect(html).toContain(`data-action="honk" data-car="${c.id}"`);
    }
    expect(html).toMatch(/class="garage-car current"><button class="garage-pick" data-action="pick-car" data-slot="0" data-car="spoiler-alert"/);
    expect(html).toContain('✓ Your car');
    expect(html.match(/✓ Your car/g)).toHaveLength(1);
  });

  it('stat bars scale over the balance range (lowest still shows a bar)', () => {
    const html = garageHtml(v, 0, limits.maxCars);
    // Spoiler Alert: speed at the top of the range, grip at the bottom; Cabbie in the middle.
    expect(html).toMatch(/Speed<\/span><span class="stat-bar"><i style="width:100%">/);
    expect(html).toMatch(/Grip<\/span><span class="stat-bar"><i style="width:18%">/);
    expect(html).toMatch(/Weight<\/span><span class="stat-bar"><i style="width:59%">/);
  });

  it('shows which other teams drive each car, and escapes names', () => {
    const html = garageHtml(base({ ...v, teams: ['<b>T</b>'] }), 0, limits.maxCars);
    expect(html).toContain('class="garage-dot" style="--team:#1d7fe0">2</span>');
    expect(html).not.toContain('<b>T</b>');
    expect(html).toContain('&lt;b&gt;T&lt;/b&gt;');
  });
});
