// Client entry. Picks what to show: the P0 hello page, a frozen test scenario, or the live
// race (join the server, drive with the keyboard). Menus and lobby come in later phases.
import '@fontsource/fredoka/600.css';
import './style.css';
import { GAME_TITLE, MSG, NO_INPUT, carIdForSlot, createWorld, inputsAllowed, mayUse, type CarDef, type CarInput, type CarLook, type LobbyError, type RacePhase, type Role, type SimEvent, type Tuning } from '@escape/shared';
import { DEFAULT_TRACK, loadCars, loadItems, loadTrack, loadTuning } from './content';
import { Game, type CarSeats, type CarSource, type SeatPerson } from './game';
import { countdownCue } from './audio/cues';
import { EngineSound, squealing } from './audio/engine';
import { COUNTDOWN_SOUNDS, DRIFT_SOUNDS, ENGINE_SOUNDS, HornPlayer, IMPACT_SOUNDS, impactLevel, ITEM_SOUNDS } from './audio/horn';
import { MusicLoop } from './audio/music';
import { VolumePanel } from './ui/volumePanel';
import { CameraToggle } from './input/cameraPref';
import { KeyboardControls } from './input/keyboard';
import { MouseLook } from './input/mouseLook';
import { ServerCarSource, joinOrReconnect, joinRace } from './net/connection';
import { HeadSender } from './net/heads';
import { InputDelayMeter } from './net/latency';
import { OwnCarPredictor } from './net/predictor';
import { seatSideFor } from './render/cockpitCam';
import { setFaceFraming } from './render/faceTexture';
import type { FaceFraming } from './render/facePlacement';
import { pickQuality } from './render/renderer';
import { frozenBotRace, frozenItems, frozenSource, garageWorld, isRaceScenario, propsShowroom, shortcutCamera, type RaceScenario } from './scenarios';
import { focusPose, installHooks, liveStats, markReady, type GameHooks } from './test-hooks';
import { LobbyScreen, type LobbyHandlers, type LobbyPlayer } from './ui/lobbyScreen';
import { GaugePanel, type GaugeValues } from './ui/gauges';
import type { ItemsView, ShotSnap } from './render/itemProps';
import { ItemEffectsOverlay } from './ui/itemEffects';
import { escapeHtml } from './ui/html';
import { itemIcon } from './ui/itemIcons';
import { itemName } from './ui/items';
import { Toasts } from './ui/toasts';
import { swappedRole } from './ui/roleKeys';
import { SwapFlash } from './ui/swapFlash';
import { RaceHud, hudText } from './ui/raceHud';
import { ResultsScreen } from './ui/resultsScreen';
import { Scoreboard, boardRows, type BoardCar } from './ui/scoreboard';
import { Spectator } from './ui/spectator';
import { RoleBadge } from './ui/roleBadge';

/**
 * Seats per car from the synced players: Pilot or Solo on the left, Engineer on the right;
 * a lone player's car gets the rubber duck in the other seat; bot cars get two placeholder heads.
 */
function carSeatsFrom(
  state: {
    players: { forEach(cb: (p: { slot: number; seat: string; face: string; headYaw: number; headPitch: number }, id: string) => void): void };
    cars: { forEach(cb: (c: { bot: boolean }, id: string) => void): void };
  },
  myId: string,
): Map<string, CarSeats> {
  const seats = new Map<string, CarSeats>();
  state.players.forEach((p, id) => {
    if (p.slot < 0 || p.seat === '') return;
    const carId = carIdForSlot(p.slot);
    const car = seats.get(carId) ?? { left: null, right: null };
    const person: SeatPerson = { id, face: p.face, yaw: p.headYaw, pitch: p.headPitch, me: id === myId };
    if (p.seat === 'engineer') car.right = person;
    else car.left = person;
    seats.set(carId, car);
  });
  for (const car of seats.values()) {
    if (car.left && !car.right) car.right = 'duck';
    else if (car.right && !car.left) car.left = 'duck';
  }
  state.cars.forEach((c, id) => {
    if (!c.bot) return;
    const bot = (side: string): SeatPerson => ({ id: `${id}-${side}`, face: '', yaw: 0, pitch: 0, me: false });
    seats.set(id, { left: bot('l'), right: bot('r') });
  });
  return seats;
}

type FaceListEntry = { file: string; name: string } & FaceFraming;

/**
 * The host's face list (/faces/faces.json, built by `npm run faces`); [] if missing. Also
 * hands each photo's framing to the head textures.
 */
async function fetchFaces(): Promise<FaceListEntry[]> {
  try {
    const res = await fetch('/faces/faces.json');
    if (!res.ok) return [];
    const data = (await res.json()) as { faces?: FaceListEntry[] };
    const faces = Array.isArray(data.faces) ? data.faces : [];
    setFaceFraming(faces);
    return faces;
  } catch {
    return [];
  }
}

/** Car slots driven by server bots (car ids are "car<slot>"). */
function botSlotsOf(state: { cars: { forEach(cb: (c: { bot: boolean }, id: string) => void): void } }): number[] {
  const slots: number[] = [];
  state.cars.forEach((c, id) => {
    if (c.bot) slots.push(Number(id.slice('car'.length)));
  });
  return slots;
}

/** Where you look in the `cockpit` scenario: right (negative yaw) and a bit up, at your teammate. */
const SCENARIO_LOOK = { yaw: -1.15, pitch: 0.25 };
/** `juice` scenario: landing speed (m/s) for the squash, and how long the confetti has flown (s). */
const SCENARIO_JUICE = { landing: 9, confettiSeconds: 0.45 };
/** `stall`/`drift` scenarios: smoke/sparks already flying this long when the picture is taken (s). */
const SCENARIO_SMOKE_SECONDS = 1;

/** How often the live race re-measures ping for the F3 overlay (ms). */
const PING_EVERY_MS = 2000;
/** Weight of the newest measurement in the smoothed input delay shown on F3. */
const INPUT_DELAY_SMOOTHING = 0.2;

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
  // This page only shows the player count; ignore the race broadcasts.
  for (const type of [MSG.events, MSG.tuning, MSG.reload]) room.onMessage(type, () => {});
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
  const showroom = scenario === 'props' ? propsShowroom(loadTrack(trackId, tuning)) : null;
  const track = showroom?.track ?? loadTrack(trackId, tuning);
  const itemsCfg = loadItems();
  const garage = scenario === 'garage' ? garageWorld(track) : null;
  const shortcutCam = scenario === 'shortcut' ? shortcutCamera(track) : null;
  const world = garage?.world ?? (showroom || shortcutCam ? createWorld(track, []) : frozenBotRace(track, tuning, scenario, itemsCfg));
  const fixedCamera = garage?.camera ?? showroom?.camera ?? shortcutCam ?? undefined;
  // Each car's look: the garage shows the roster in slot order; races use the first car.
  const roster = loadCars().cars;
  const lookOf = (carId: string): CarLook => {
    const slot = Number(/^car(\d+)$/.exec(carId)?.[1] ?? 0);
    return (garage ? roster[slot % roster.length] : roster[0])!.look;
  };
  const itemsView = frozenItems(world);
  const previewFace = new URLSearchParams(window.location.search).get('face') ?? '';
  if (previewFace !== '') await fetchFaces(); // its framing
  const container = el('game');
  container.hidden = false;
  const game = new Game({
    container,
    tuning,
    track,
    quality: pickQuality(window.location.search, tuning).preset,
    source: frozenSource(world),
    items: () => itemsView,
    view: scenario === 'track-overview' ? 'overview' : scenario === 'cockpit' ? 'cockpit' : fixedCamera ? 'fixed' : 'chase',
    ...(fixedCamera ? { fixedCamera } : {}),
    lookOf,
    focus: () => 'bot1',
    seatSide: () => 'left',
    // Hold the head where the scenario points it (as if the mouse were captured).
    mouseLocked: () => true,
    // Placeholder bobbleheads for the screenshots; bot2 drives solo with the duck.
    // In the cockpit shot you are bot1's Pilot and your teammate turns to look at you.
    occupants: (carId) => {
      const head = (side: string, yaw = 0): SeatPerson => ({
        // `&face=<file>` previews a face from assets/faces/ on the heads (default: placeholder).
        id: `${carId}-${side}`, face: previewFace, yaw, pitch: 0, me: carId === 'bot1' && side === 'l',
      });
      if (carId === 'bot2') return { left: head('l'), right: 'duck' };
      return { left: head('l', 0.5), right: head('r', carId === 'bot1' ? 1.2 : 0) };
    },
  });
  // Cockpit shot: turn your head right toward your teammate's bobblehead.
  if (scenario === 'cockpit') game.lookAt(SCENARIO_LOOK.yaw, SCENARIO_LOOK.pitch);
  if (scenario === 'items') {
    // The Forced Update overlay, 40% done, as both players of a hit car would see it.
    const max = itemsCfg.items.forcedUpdate.maxSeconds;
    new ItemEffectsOverlay(container).set({ blueLeft: 0, lagLeft: 0, swapLeft: 0, updateLeft: max * 0.6 }, max);
  }
  if (scenario === 'stall' || scenario === 'drift' || scenario === 'nitro') game.warmEffects(SCENARIO_SMOKE_SECONDS, performance.now());
  if (scenario === 'juice') {
    // You just finished (confetti) after a jump (squash) and honk.
    game.renderFrame(performance.now(), true); // builds the car meshes
    game.jolt('bot1', SCENARIO_JUICE.landing, true);
    game.confetti('bot1', true);
    game.say('bot1', 'HONK!');
    game.warmEffects(SCENARIO_JUICE.confettiSeconds, performance.now());
  }
  game.renderFrame(performance.now(), true);
  game.start();
  setStatus('');
  overlay?.();
  await markReady(hooks);
}

/** Lobby with made-up players over the track (scenario `lobby`, for screenshots). */
async function showLobbyScenario(hooks: GameHooks, tuning: Tuning): Promise<void> {
  const r = tuning.race;
  await showScenario(hooks, tuning, 'track-overview', () => {
    const noop = (): void => {};
    const handlers: LobbyHandlers = {
      setName: noop, setSeat: noop, leaveSeat: noop, setTeamName: noop, setReady: noop,
      start: noop, setLaps: noop, shuffle: noop, setBots: noop, setChaos: noop, setCar: noop, setFace: noop,
    };
    const lobby = new LobbyScreen(el('game'), { maxCars: r.maxCars, minLaps: r.minLaps, maxLaps: r.maxLaps }, handlers);
    const teams = ['The Blue Screens', '404 Not Found', 'Ctrl Freaks', 'Have You Tried Turning It Off', 'Packet Sniffers', 'The Hotfixers', 'Merge Conflict', 'Cable Management'];
    const roster = loadCars().cars;
    lobby.update({
      players: fakePlayers, myId: 'me', host: 'me', phase: 'lobby', laps: r.defaultLaps, teams, bots: true, botSlots: [4],
      carModels: roster.map((d) => d.id), roster: roster.map((d) => ({ id: d.id, name: d.name })),
    });
  });
}

/** Results with made-up times over the track (scenario `results`, for screenshots). */
async function showResultsScenario(hooks: GameHooks, tuning: Tuning): Promise<void> {
  await showScenario(hooks, tuning, 'track-overview', () => {
    const screen = new ResultsScreen(el('game'), { rematch: () => {}, lobby: () => {} });
    const teams = ['The Blue Screens', '404 Not Found', 'Ctrl Freaks', 'Have You Tried Turning It Off', 'Packet Sniffers'];
    screen.update(true, {
      cars: [
        { slot: 1, place: 1, finished: true, dnf: false, finishMs: 106_400, bestLapMs: 34_850, bot: false },
        { slot: 0, place: 2, finished: true, dnf: false, finishMs: 107_900, bestLapMs: 35_120, bot: false },
        { slot: 2, place: 3, finished: true, dnf: false, finishMs: 112_300, bestLapMs: 36_020, bot: false },
        { slot: 4, place: 4, finished: true, dnf: false, finishMs: 118_700, bestLapMs: 37_400, bot: true },
        { slot: 3, place: 5, finished: false, dnf: true, finishMs: 0, bestLapMs: 41_000, bot: false },
      ],
      players: fakePlayers,
      teams,
      myId: 'me',
      host: 'me',
      hostName: 'You',
    });
  });
}

/** Made-up players for the `lobby` scenario: you (host) in car 1, full cars, a solo car, one away. */
const fakePlayers: LobbyPlayer[] = [
  { id: 'me', name: 'You', slot: 0, seat: 'pilot', connected: true, ready: true },
  { id: 'a', name: 'Dina', slot: 0, seat: 'engineer', connected: true, ready: true },
  { id: 'b', name: 'Omar', slot: 1, seat: 'pilot', connected: true, ready: false },
  { id: 'c', name: 'Karim', slot: 1, seat: 'engineer', connected: true, ready: true },
  { id: 'd', name: 'Sara', slot: 2, seat: 'solo', connected: true, ready: false },
  { id: 'e', name: 'Youssef', slot: 3, seat: 'engineer', connected: false, ready: false },
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

  const source = new ServerCarSource(tuning.net.interpDelayMs, tuning.sim.dt * 1000);
  const delayMeter = new InputDelayMeter();
  const headSender = new HeadSender();
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
  // Sim events (bumps, jumps, …) drive sounds and effects later (P7). Listening now keeps the
  // SDK from warning about every unhandled one.
  // Sim events (bumps, jumps, …): for now they shake the cockpit head; sounds and effects in P7.
  let onEvents: (events: SimEvent[]) => void = () => {};
  room.onMessage(MSG.events, (events: SimEvent[]) => onEvents(events));
  // Faces on the host PC (none = everyone gets the drawn placeholder).
  // Loaded before the lobby is drawn, so the face picker does not appear late and push the
  // seat buttons down under the player's mouse.
  const faces = await fetchFaces();
  const race = latestTuning.race;
  const join = new LobbyScreen(container, { maxCars: race.maxCars, minLaps: race.minLaps, maxLaps: race.maxLaps }, {
    setName: (name) => room.send(MSG.setName, { name }),
    setSeat: (slot, seat) => room.send(MSG.setSeat, { slot, seat }),
    leaveSeat: () => room.send(MSG.leaveSeat, {}),
    setTeamName: (slot, name) => room.send(MSG.setTeamName, { slot, name }),
    setReady: (ready) => room.send(MSG.ready, { ready }),
    setFace: (face) => room.send(MSG.setFace, { face }),
    start: () => room.send(MSG.hostStart, {}),
    setLaps: (laps) => room.send(MSG.hostLaps, { laps }),
    shuffle: () => room.send(MSG.hostShuffle, {}),
    setBots: (on) => room.send(MSG.hostBots, { on }),
    setChaos: (on) => room.send(MSG.hostChaos, { on }),
    setCar: (slot, car) => room.send(MSG.setCar, { slot, car }),
  });
  room.onMessage(MSG.lobbyError, (e: LobbyError) => {
    join.show(true);
    join.showError(e.reason);
  });
  const badge = new RoleBadge(container);
  const swapFlash = new SwapFlash(container);
  const effects = new ItemEffectsOverlay(container);
  const toasts = new Toasts(container);
  const itemsCfg = loadItems();
  const hud = new RaceHud(container);
  const gaugePanel = new GaugePanel(container);
  const gauges: GaugeValues = { speed: 0, lap: null, place: null, heat: null, stalled: false, nitro: null, item: null };
  // Host only, during a race: the way out of a race nobody finishes.
  const endRace = document.createElement('button');
  endRace.className = 'end-race';
  endRace.textContent = '⏹ End race';
  endRace.hidden = true;
  endRace.addEventListener('click', () => room.send(MSG.hostEndRace, {}));
  container.appendChild(endRace);
  const board = new Scoreboard(container);
  // Who sits where (bobbleheads), rebuilt on every state change, read every frame.
  let seatsByCar = new Map<string, CarSeats>();
  const resultsScreen = new ResultsScreen(container, {
    rematch: () => room.send(MSG.hostStart, {}),
    lobby: () => room.send(MSG.hostLobby, {}),
  });
  let teamNames: string[] = [];
  const spectator = new Spectator(container, (carId) => teamNames[Number(carId.slice('car'.length))] ?? carId);
  let mySlot = -1;
  let myRole: Role | null = null;
  let mySeat = '';
  let phase: RacePhase = 'lobby';
  const track = loadTrack(DEFAULT_TRACK, tuning);
  // Your own car is predicted (answers your keys at once); everyone else is interpolated.
  const predictor = new OwnCarPredictor(track, loadCars().cars[0]!.stats);
  const localInput: CarInput = { ...NO_INPUT };
  /** Your car id, cached so the frame loop does not build a string every frame. */
  let myCarId: string | null = null;
  let keyboard: KeyboardControls | null = null;
  const carSource: CarSource = {
    sample(now, out) {
      source.sample(now, out);
      const mine = myCarId === null ? undefined : out.get(myCarId);
      if (!mine) {
        engine.update(false, 0, false, false, false);
        return;
      }
      const lead = liveStats.inputDelayMs ?? liveStats.pingMs ?? 0;
      if (keyboard) keyboard.readInto(localInput);
      // While the server ignores controls (countdown), predicting would make the car creep.
      predictor.predict(now, localInput, inputsAllowed(phase) ? myRole : null, lead, latestTuning, mine);
      // Your engine: your own gas key, or your partner's as the server last applied it.
      const gas = (myRole !== null && mayUse(myRole, 'gas') && localInput.gas) || serverGas;
      const brake = (myRole !== null && mayUse(myRole, 'brake') && localInput.brake) || serverBrake;
      const share = mine.speed / latestTuning.car.topSpeed;
      engine.update(true, share, gas, squealing(mine.drift !== 0, brake, share), mine.boosting || mine.nitroOn);
    },
  };
  let serverGas = false;
  let serverBrake = false;
  /** The countdown text last shown (beeps when it changes). */
  let lastCountdown: string | null = null;
  // The car each slot drives (synced), and lookups by car id ("car3" → slot 3).
  const roster = loadCars().cars;
  const rosterNames = roster.map((d) => ({ id: d.id, name: d.name }));
  let carModels: string[] = [];
  /** The car you drive (stats and engine voice are set when it changes). */
  let myCarDef: CarDef | null = null;
  /** Cars seen finished this race (confetti once each; joining during results throws none). */
  const finishedCars = new Set<string>();
  const carDefOf = (carId: string): CarDef => {
    const slot = Number(carId.slice('car'.length));
    return roster.find((d) => d.id === carModels[slot]) ?? roster[0]!;
  };
  const shotPool: ShotSnap[] = [];
  const shots: ShotSnap[] = [];
  const itemsView: ItemsView = { boxesUp: '', shots, shotsTime: 0 };
  room.onStateChange((state) => {
    const now = performance.now();
    source.push(now, state);
    liveStats.tickMs = state.tickMs;
    const players: LobbyPlayer[] = [];
    state.players.forEach((p, id) =>
      players.push({ id, name: p.name, slot: p.slot, seat: p.seat, connected: p.connected, ready: p.ready, face: p.face }),
    );
    const me = state.players.get(room.sessionId);
    const delay = me ? delayMeter.acked(me.ackSeq, now) : null;
    if (delay !== null) {
      const prev = liveStats.inputDelayMs;
      liveStats.inputDelayMs = prev === null ? delay : prev + (delay - prev) * INPUT_DELAY_SMOOTHING;
    }
    phase = state.phase;
    mySlot = me?.slot ?? -1;
    myCarId = mySlot >= 0 ? carIdForSlot(mySlot) : null;
    myRole = me && me.role !== '' ? (me.role as Role) : null;
    mySeat = me?.seat ?? '';
    const myCar = mySlot >= 0 ? state.cars.get(carIdForSlot(mySlot)) : undefined;
    serverGas = myCar?.inGas ?? false;
    serverBrake = myCar?.inBrake ?? false;
    // Item boxes, envelopes and puddles for the 3D view.
    itemsView.boxesUp = state.boxesUp;
    // Reuse the shot objects (no new ones per patch).
    let n = 0;
    state.shots.forEach((s) => {
      const o = (shotPool[n] ??= { kind: '', x: 0, z: 0, vx: 0, vz: 0 });
      o.kind = s.kind;
      o.x = s.x;
      o.z = s.z;
      o.vx = s.vx;
      o.vz = s.vz;
      n++;
    });
    shots.length = n;
    for (let i = 0; i < n; i++) shots[i] = shotPool[i]!;
    itemsView.shotsTime = now;
    if (myCar && myCarId !== null) predictor.onServer(myCarId, myCar, source.lastTime);
    badge.set(me?.role ?? '');
    endRace.hidden = !(state.host === room.sessionId && (state.phase === 'countdown' || state.phase === 'racing'));
    teamNames = [...state.teams];
    // Copy the picks only when one changed (this runs on every patch).
    if (state.carModels.length !== carModels.length || carModels.some((m, i) => m !== state.carModels[i])) {
      carModels = [...state.carModels];
    }
    // Prediction runs your car with its own stats; the engine sounds like it.
    const myDef = myCarId === null ? null : carDefOf(myCarId);
    if (myDef !== null && myDef !== myCarDef) {
      myCarDef = myDef;
      predictor.setStats(myDef.stats);
      engine.setVoice(myDef.engine);
    }
    seatsByCar = carSeatsFrom(state, room.sessionId);
    const boardCars: BoardCar[] = [];
    state.cars.forEach((c, id) => {
      if (!c.finished) finishedCars.delete(id);
      else if (!finishedCars.has(id)) {
        finishedCars.add(id);
        if (state.phase === 'racing') game.confetti(id, id === myCarId);
      }
      boardCars.push({
        slot: Number(id.slice('car'.length)), place: c.place, lapsDone: c.lapsDone, finished: c.finished,
        dnf: c.dnf, gapMs: c.gapMs, finishMs: c.finishMs, bestLapMs: c.bestLapMs, bot: c.bot,
      });
    });
    board.update(boardRows(boardCars, players, teamNames, state.laps, state.phase));
    resultsScreen.update(state.phase === 'results', {
      cars: boardCars,
      players,
      teams: teamNames,
      myId: room.sessionId,
      host: state.host,
      hostName: state.players.get(state.host)?.name ?? 'the host',
    });
    // Watching (not in a car): cycle through the cars, leader first during a race.
    const byPlace = [...boardCars].sort((a, b) => (a.place || 99) - (b.place || 99) || a.slot - b.slot);
    spectator.update(mySlot < 0, byPlace.map((c) => carIdForSlot(c.slot)), now);
    const hudNow = hudText({
        phase: state.phase,
        tick: state.tick,
        phaseTick: state.phaseTick,
        dt: latestTuning.sim.dt,
        countdownSeconds: latestTuning.race.countdownSeconds,
        laps: state.laps,
        cars: state.cars.size,
        me: myCar ? { lapsDone: myCar.lapsDone, place: myCar.place, finished: myCar.finished, dnf: myCar.dnf, wrongWay: myCar.wrongWay } : null,
      });
    hud.set(hudNow);
    const cue = countdownCue(lastCountdown, hudNow.countdown);
    lastCountdown = hudNow.countdown;
    if (cue) horns.playSound(COUNTDOWN_SOUNDS[cue], 0);
    music.setPlaying(state.phase === 'lobby' || state.phase === 'results');
    // The item you hold (P6.5 adds icons).
    gauges.lap = hudNow.lap;
    gauges.place = hudNow.place;
    gauges.heat = myCar ? myCar.heat : null;
    gauges.stalled = myCar ? myCar.stallLeft > 0 : false;
    gauges.nitro = myCar ? myCar.nitro : null;
    gauges.item = myCar && myCar.item !== '' ? myCar.item : null;
    // Item hits show on both players' screens of the car.
    effects.set(myCar ?? null, itemsCfg.items.forcedUpdate.maxSeconds);
    join.update({
      players,
      myId: room.sessionId,
      host: state.host,
      phase: state.phase,
      laps: state.laps,
      teams: [...state.teams],
      bots: state.bots,
      chaos: state.chaos,
      carModels,
      roster: rosterNames,
      botSlots: botSlotsOf(state),
      faces,
    });
  });

  const game = new Game({
    container,
    tuning,
    track,
    quality: pickQuality(window.location.search, tuning).preset,
    source: carSource,
    view: 'chase',
    // Follow your own car; while watching, the spectator cam picks the car.
    focus: () => myCarId ?? spectator.target,
    occupants: (carId) => seatsByCar.get(carId) ?? null,
    seatSide: () => seatSideFor(mySeat),
    mouseLocked: () => mouseLook.locked,
    gauges: () => gauges,
    items: () => itemsView,
    // Each car looks like the car its team picked.
    lookOf: (carId) => carDefOf(carId).look,
    onFrame: (now) => {
      // Chase-cam gauges for your car (the cockpit has its dashboard screen instead).
      gauges.speed = focusPose.speed;
      gaugePanel.update(game.view === 'chase' && myCarId !== null && focusPose.set, gauges);
      // Share where you look (your teammate sees your bobblehead turn).
      const h = game.head;
      const send = headSender.next(now, h.yaw, h.pitch, latestTuning.net.headSendMs);
      if (send) room.send(MSG.head, send);
      liveStats.snapshotAgeMs = source.lastArrival < 0 ? null : now - source.lastArrival;
      liveStats.interpDelayMs = source.interpDelayMs;
    },
  });
  // Camera: C toggles chase ↔ cockpit (remembered). Watching always uses the chase cam.
  // (applyView is defined below; the toggle only fires on a key press, after setup.)
  const cameraToggle = new CameraToggle(() => applyView());
  const mouseLook = new MouseLook(game.canvas, () => game.view === 'cockpit', (dx, dy) => game.mouse(dx, dy));
  const applyView = (): void => {
    const want = myCarId !== null && cameraToggle.mode === 'cockpit' ? 'cockpit' : 'chase';
    if (game.view !== want) {
      game.setView(want);
      if (want === 'chase') mouseLook.release();
    }
    // Results and lobby screens need the mouse pointer back.
    if (room.state.phase !== 'countdown' && room.state.phase !== 'racing') mouseLook.release();
  };
  room.onStateChange(applyView);
  const horns = new HornPlayer();
  const engine = new EngineSound(() => horns.context, () => horns.bus('engine'));
  const music = new MusicLoop(() => horns.context, () => horns.bus('music'));
  const volumePanel = new VolumePanel(document.body, horns.volumes, (v) => horns.setVolumes(v));
  /** How far a car is from the camera (m), for sound volume. */
  const heardFrom = (carId: string): number => {
    const p = game.carPosition(carId);
    const cam = game.cameraPosition;
    return p ? Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z) : 0;
  };
  onEvents = (events) => {
    for (const e of events) {
      if (e.type === 'honk') {
        game.say(e.car, 'HONK!');
        horns.play(carDefOf(e.car).horn, heardFrom(e.car));
        continue;
      }
      if (e.type === 'stall' || e.type === 'restart') {
        if (e.type === 'stall') game.say(e.car, 'STALL!');
        horns.playSound(ENGINE_SOUNDS[e.type], heardFrom(e.car));
        continue;
      }
      if (e.type === 'driftLevel') {
        const ding = DRIFT_SOUNDS.levels[e.level - 1];
        if (ding && e.car === myCarId) horns.playSound(ding, 0);
        continue;
      }
      if (e.type === 'swap') {
        // Seats swap on the server; the new role arrives with the next state patch, so work it
        // out here to flash it right away.
        if (e.car === myCarId) {
          swapFlash.show(swappedRole(myRole ?? ''));
          horns.playSound(DRIFT_SOUNDS.swap, 0);
        }
        continue;
      }
      if (e.type === 'itemBox') {
        if (e.car === myCarId && e.item) {
          toasts.show(`${itemIcon(e.item)} You got <b>${itemName(e.item)}</b>!`, 'good');
          horns.playSound(ITEM_SOUNDS.pickup, 0);
        }
        continue;
      }
      if (e.type === 'itemUse') {
        horns.playSound(ITEM_SOUNDS.use, heardFrom(e.car));
        continue;
      }
      if (e.type === 'itemHit') {
        const what = `${itemIcon(e.item)} <b>${itemName(e.item)}</b>`;
        const from = escapeHtml(teamNames[Number(e.by.slice('car'.length))] ?? e.by);
        const whom = escapeHtml(teamNames[Number(e.car.slice('car'.length))] ?? e.car);
        // Both players of the hit car see it (and the car that fired it).
        if (e.car === myCarId) toasts.show(e.blocked ? `Your Firewall blocked ${what}!` : `Hit by ${what} from ${from}!`, e.blocked ? 'good' : 'bad');
        else if (e.by === myCarId) toasts.show(e.blocked ? `${whom}'s Firewall blocked your ${what}` : `Your ${what} got ${whom}!`, e.blocked ? 'info' : 'good');
        horns.playSound(e.blocked ? ITEM_SOUNDS.blocked : ITEM_SOUNDS.hit, heardFrom(e.car));
        continue;
      }
      if (e.type === 'boost' || e.type === 'nitro') {
        horns.playSound(DRIFT_SOUNDS[e.type], heardFrom(e.car));
        continue;
      }
      if (e.type === 'wallHit') horns.playSound(IMPACT_SOUNDS.wall, heardFrom(e.car), 'sfx', impactLevel(e.speed));
      else if (e.type === 'carHit') horns.playSound(IMPACT_SOUNDS.bump, heardFrom(e.car), 'sfx', impactLevel(e.speed));
      else if (e.type === 'land') horns.playSound(IMPACT_SOUNDS.land, heardFrom(e.car), 'sfx', impactLevel(e.impact));
      if (e.type === 'wallHit') game.jolt(e.car, e.speed, false);
      else if (e.type === 'carHit') {
        game.jolt(e.car, e.speed, false);
        game.jolt(e.other, e.speed, false);
      } else if (e.type === 'land') game.jolt(e.car, e.impact, true);
      const hitsMe = e.car === myCarId || (e.type === 'carHit' && e.other === myCarId);
      if (!hitsMe) continue;
      if (e.type === 'wallHit' || e.type === 'carHit') game.bump(e.speed);
      else if (e.type === 'land') game.bump(e.impact);
    }
  };
  game.start();
  game.setTuning(latestTuning);
  tuningListeners.push((t) => game.setTuning(t));
  keyboard = new KeyboardControls((msg) => {
    delayMeter.sentInput(msg.seq, performance.now());
    room.send(MSG.input, msg);
  }, latestTuning.net.inputResendMs);
  if (import.meta.env.DEV) {
    // Dev only: the F2 panel (lil-gui is not in production builds).
    const { TuningPanel } = await import('./ui/tuningPanel');
    const panel = new TuningPanel(latestTuning, (t) => {
      latestTuning = t;
      game.setTuning(t);
      source.interpDelayMs = t.net.interpDelayMs;
    });
    tuningListeners.push((t) => panel.serverTuning(t));
  }
  room.onLeave(() => {
    window.clearInterval(pingTimer);
    keyboard?.dispose();
    join.dispose();
    badge.dispose();
    hud.dispose();
    gaugePanel.dispose();
    cameraToggle.dispose();
    engine.dispose();
    music.dispose();
    volumePanel.dispose();
    horns.dispose();
    swapFlash.dispose();
    effects.dispose();
    toasts.dispose();
    mouseLook.dispose();
    endRace.remove();
    board.dispose();
    resultsScreen.dispose();
    spectator.dispose();
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
      : hooks.scenario === 'lobby'
        ? showLobbyScenario(hooks, tuning)
        : hooks.scenario === 'results'
          ? showResultsScenario(hooks, tuning)
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
