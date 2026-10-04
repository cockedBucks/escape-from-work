// Client entry. Picks what to show: the P0 hello page, a frozen test scenario, or the live
// race (join the server, drive with the keyboard). Menus and lobby come in later phases.
import '@fontsource/fredoka/600.css';
import './style.css';
import { GAME_TITLE, MSG, type Tuning } from '@escape/shared';
import { DEFAULT_TRACK, loadTrack, loadTuning } from './content';
import { Game } from './game';
import { KeyboardControls } from './input/keyboard';
import { ServerCarSource, joinRace } from './net/connection';
import { pickQuality } from './render/renderer';
import { frozenBotRace, frozenSource, isRaceScenario, type RaceScenario } from './scenarios';
import { installHooks, liveStats, markReady, type GameHooks } from './test-hooks';

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
async function showScenario(hooks: GameHooks, tuning: Tuning, scenario: RaceScenario): Promise<void> {
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
  await markReady(hooks);
}

/** The real thing: join the server's race and drive solo. */
async function showRace(hooks: GameHooks, tuning: Tuning): Promise<void> {
  const container = el('game');
  container.hidden = false;
  setStatus('Connecting…');
  const room = await joinRace(tuning);
  setStatus('');
  room.ping((ms) => {
    liveStats.pingMs = ms;
  });
  // Ping again now and then so the F3 overlay stays current.
  setInterval(() => room.ping((ms) => (liveStats.pingMs = ms)), 2000);

  const source = new ServerCarSource(tuning.net.interpDelayMs);
  room.onStateChange((state) => {
    source.push(performance.now(), state);
    liveStats.tickMs = state.tickMs;
  });

  const game = new Game({
    container,
    tuning,
    track: loadTrack(DEFAULT_TRACK, tuning),
    quality: pickQuality(window.location.search, tuning).preset,
    source,
    view: 'chase',
    focus: () => room.sessionId,
  });
  game.start();
  new KeyboardControls((msg) => room.send(MSG.input, msg));
  room.onLeave(() => setStatus('Disconnected from the game server. Reload to rejoin.', true));
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
