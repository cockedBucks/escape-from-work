// Client entry. Picks what to show: the P0 hello page, a frozen test scenario, or the live
// race (join the server, drive with the keyboard). Menus and lobby come in later phases.
import '@fontsource/fredoka/600.css';
import './style.css';
import { GAME_TITLE, MSG, carIdForSlot, type LobbyError, type Tuning } from '@escape/shared';
import { DEFAULT_TRACK, loadTrack, loadTuning } from './content';
import { Game } from './game';
import { KeyboardControls } from './input/keyboard';
import { ServerCarSource, joinOrReconnect, joinRace } from './net/connection';
import { pickQuality } from './render/renderer';
import { frozenBotRace, frozenSource, isRaceScenario, type RaceScenario } from './scenarios';
import { installHooks, liveStats, markReady, type GameHooks } from './test-hooks';
import { JoinScreen, type JoinPlayer } from './ui/joinScreen';
import { RoleBadge } from './ui/roleBadge';

/** How often the live race re-measures ping for the F3 overlay (ms). */
const PING_EVERY_MS = 2000;

function el(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing #${id} in index.html`);
  return found;
}

const statusEl = el('status');
function setStatus(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
  statusEl.hidden = text === '';
}

document.title = GAME_TITLE;
el('title').textContent = GAME_TITLE;

/** P0 page: title + live player count (scenario `hello`). */
async function showHello(hooks: GameHooks, tuning: Tuning): Promise<void> {
  el('hello').hidden = false;
  const room = await joinRace(tuning);
  setStatus('Connected');
  room.ping((ms) => {
    liveStats.pingMs = ms;
  });
  let readyPending = false;
  room.onStateChange((state) => {
    const n = state.players.size;
    el('player-count').textContent = String(n);
    el('player-label').textContent = n === 1 ? 'player' : 'players';
    if (!readyPending) {
      readyPending = true;
      void markReady(hooks);
    }
  });
  room.onLeave(() => setStatus('Disconnected from the game server. Reload to rejoin.', true));
}

/** A frozen local bot race, for screenshots (`chase`, `track-overview`). */
async function showScenario(hooks: GameHooks, tuning: Tuning, scenario: RaceScenario, overlay?: () => void): Promise<void> {
  const trackId = new URLSearchParams(window.location.search).get('track') ?? DEFAULT_TRACK;
  const track = loadTrack(trackId, tuning);
  const world = frozenBotRace(track, tuning, scenario);
  const container = el('game');
  container.hidden = false;
  const game = new Game({
    container,
    tuning,
    track,
    quality: pickQuality(window.location.search, tuning).preset,
    source: frozenSource(world),
    view: scenario === 'track-overview' ? 'overview' : 'chase',
    focus: () => 'bot1',
  });
  game.renderFrame(performance.now(), true);
  game.start();
  setStatus('');
  overlay?.();
  await markReady(hooks);
}

/** Join screen with made-up players over the track (scenario `join`, for screenshots). */
async function showJoinScenario(hooks: GameHooks, tuning: Tuning): Promise<void> {
  await showScenario(hooks, tuning, 'track-overview', () => {
    const join = new JoinScreen(el('game'), tuning.race.maxCars, { setName: () => {}, setSeat: () => {}, leaveSeat: () => {} });
    join.update(fake, 'me');
  });
}

/** Made-up players for the `join` scenario: a full car, a lone pilot, a solo car, one away. */
const fake: JoinPlayer[] = [
    { id: 'me', name: 'You', slot: -1, seat: '', connected: true },
    { id: 'a', name: 'Dina', slot: 0, seat: 'pilot', connected: true },
    { id: 'b', name: 'Omar', slot: 0, seat: 'engineer', connected: true },
    { id: 'c', name: 'Karim', slot: 1, seat: 'pilot', connected: true },
    { id: 'd', name: 'Sara', slot: 2, seat: 'solo', connected: true },
  { id: 'e', name: 'Youssef', slot: 3, seat: 'engineer', connected: false },
];

/** The real thing: join the server's race, pick a seat, drive. */
async function showRace(hooks: GameHooks, tuning: Tuning): Promise<void> {
  const container = el('game');
  container.hidden = false;
  setStatus('Connecting…');
  const room = await joinOrReconnect(tuning);
  setStatus('');
  // Wi-Fi blip: the SDK reconnects by itself while the server holds our seat.
  room.onDrop(() => setStatus('Connection lost — reconnecting…', true));
  room.onReconnect(() => setStatus(''));
  room.ping((ms) => {
    liveStats.pingMs = ms;
  });
  // Ping again now and then so the F3 overlay stays current.
  const pingTimer = window.setInterval(() => room.ping((ms) => (liveStats.pingMs = ms)), PING_EVERY_MS);

  const source = new ServerCarSource(tuning.net.interpDelayMs);
  // Live tuning: the server sends the current values on join and after every change.
  const tuningListeners: ((t: Tuning) => void)[] = [(t) => (source.interpDelayMs = t.net.interpDelayMs)];
  let latestTuning = tuning;
  room.onMessage(MSG.tuning, (t: Tuning) => {
    latestTuning = t;
    for (const l of tuningListeners) l(t);
  });
  room.onMessage(MSG.reload, () => {
    if (import.meta.env.DEV) window.location.reload();
  });
  const join = new JoinScreen(container, latestTuning.race.maxCars, {
    setName: (name) => room.send(MSG.setName, { name }),
    setSeat: (slot, seat) => room.send(MSG.setSeat, { slot, seat }),
    leaveSeat: () => room.send(MSG.leaveSeat, {}),
  });
  room.onMessage(MSG.lobbyError, (e: LobbyError) => {
    join.show(true);
    join.showError(e.reason);
  });
  const badge = new RoleBadge(container);
  let mySlot = -1;
  room.onStateChange((state) => {
    source.push(performance.now(), state);
    liveStats.tickMs = state.tickMs;
    const players: JoinPlayer[] = [];
    state.players.forEach((p, id) => players.push({ id, name: p.name, slot: p.slot, seat: p.seat, connected: p.connected }));
    const me = state.players.get(room.sessionId);
    mySlot = me?.slot ?? -1;
    badge.set(me?.role ?? '');
    join.update(players, room.sessionId);
  });

  const game = new Game({
    container,
    tuning,
    track: loadTrack(DEFAULT_TRACK, tuning),
    quality: pickQuality(window.location.search, tuning).preset,
    source,
    view: 'chase',
    // Follow your own car; while watching, follow the first car.
    focus: () => (mySlot >= 0 ? carIdForSlot(mySlot) : null),
  });
  game.start();
  game.setTuning(latestTuning);
  tuningListeners.push((t) => game.setTuning(t));
  const keyboard = new KeyboardControls((msg) => room.send(MSG.input, msg), latestTuning.net.inputResendMs);
  if (import.meta.env.DEV) {
    // Dev only: the F2 panel (lil-gui is not in production builds).
    const { TuningPanel } = await import('./ui/tuningPanel');
    const panel = new TuningPanel(latestTuning, (t) => {
      game.setTuning(t);
      source.interpDelayMs = t.net.interpDelayMs;
    });
    tuningListeners.push((t) => panel.serverTuning(t));
  }
  room.onLeave(() => {
    window.clearInterval(pingTimer);
    keyboard.dispose();
    join.dispose();
    badge.dispose();
    setStatus('Disconnected from the game server. Reload to rejoin.', true);
  });
  void markReady(hooks);
}

const hooks = installHooks();
if (hooks.error !== null) {
  setStatus(hooks.error, true);
} else {
  const tuning = loadTuning();
  const run =
    hooks.scenario === 'hello'
      ? showHello(hooks, tuning)
      : hooks.scenario === 'join'
        ? showJoinScenario(hooks, tuning)
        : isRaceScenario(hooks.scenario)
        ? showScenario(hooks, tuning, hooks.scenario)
        : showRace(hooks, tuning);
  run.catch((err: unknown) => {
    console.error(err);
    const msg = String(err instanceof Error ? err.message : err);
    const unreachable = /connect|websocket|network|failed to fetch/i.test(msg);
    setStatus(
      unreachable
        ? `Can't reach the game server at ${window.location.hostname}. Is it running? Reload to retry.`
        : `Something broke: ${msg}`,
      true,
    );
    hooks.error = unreachable ? 'cannot reach the game server' : msg;
  });
}
