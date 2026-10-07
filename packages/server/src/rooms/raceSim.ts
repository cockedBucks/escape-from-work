import {
  NO_INPUT,
  Rng,
  createChaos,
  countTick,
  newCounts,
  type CarCounts,
  type CarDef,
  type ItemsConfig,
  applyEvents,
  botInput,
  newBotMemory,
  type BotMemory,
  dropCar,
  gapTicks,
  gridOrder,
  isWrongWay,
  newRun,
  raceOver,
  results,
  standings,
  updateWrongWay,
  type CarRun,
  type RaceRun,
  type ResultRow,
  carIdForSlot,
  defaultTeamName,
  shuffleSeats,
  teamNameProblem,
  type TeamsConfig,
  chooseHost,
  inputsAllowed,
  lapsProblem,
  newFlow,
  seatChangesAllowed,
  startCountdown,
  startProblem,
  stepFlow,
  toLobby,
  type RaceFlow,
  createCarOnGrid,
  createWorld,
  effectiveRole,
  mergeCarInput,
  occupants,
  parseInputMessage,
  seatProblem,
  step,
  toCarInput,
  usedSlots,
  type CarInput,
  type CarStats,
  type InputPart,
  type Seat,
  type SeatedPlayer,
  type SimEvent,
  type Track,
  type Tuning,
  type World,
  applyBattleEvents,
  battleOver,
  battleResults,
  battleStandings,
  dropBattleCar,
  isOut,
  newBattle,
  type BattleRun,
  type RaceMode,
} from '@escape/shared';

/** Refusal while a race is on (seat changes would teleport a car back to the grid). */
const SEATS_LOCKED = 'seats are locked during the race';

/** Grid position of a server car: its slot ("car3" → 3). */
const slotOfCar = (id: string): number => Number(id.slice('car'.length));

/** Mixed into the race-start tick to seed item rolls (any fixed number; differs per race). */
const CHAOS_SEED = 11;

interface Player extends SeatedPlayer {
  lastSeq: number;
  input: CarInput;
  /** Was R held in the last message? Respawn fires once per press, not while held. */
  respawnHeld: boolean;
  /** A press arrived that the next tick should act on. */
  respawnPending: boolean;
  /** Same once-per-press handling for the horn. */
  honkHeld: boolean;
  honkPending: boolean;
  /** Items fire once per press of Space, like the horn. */
  fireHeld: boolean;
  firePending: boolean;
  /** Key presses the client has reported (running count) and the ones the next tick uses. */
  mashTotal: number;
  mashPending: number;
  /** Tick of the last press that counted (presses are capped at forcedUpdate.maxMashPerSec). */
  mashTick: number;
  /** Pressed Ready in the lobby. */
  ready: boolean;
}

/**
 * The authoritative race behind the room, without any Colyseus code so it can be tested
 * directly: players, their seats, the cars they sit in, and the sim. A car exists while at
 * least one player sits in its slot.
 */
export class RaceSim {
  readonly world: World;
  private stats: CarStats;
  private readonly players = new Map<string, Player>();
  /** Player ids in the order they joined (the host is the earliest connected one). */
  private readonly joinOrder: string[] = [];
  /** Race phase, host and laps (shared rules in race/flow.ts). */
  readonly flow: RaceFlow;
  /** Team name per car slot (editable in the lobby). */
  readonly teamNames: string[];
  /** The race in progress (or the last one, until the next start). */
  run: RaceRun | null = null;
  /** Results of the last finished race (grid order for the next one). */
  lastResults: ResultRow[] | null = null;
  /** Award counters of the race running now, by car id (league, P9.3). */
  private counts = new Map<string, CarCounts>();
  /** The counters of the race that just ended, by car slot (for the league record). */
  lastCounts: ReadonlyMap<number, CarCounts> = new Map();
  /** Host asked to end the race (applied on the next tick). */
  private endRequested = false;
  /** Car in first place (racing). */
  private leaderId: string | undefined;
  /** Current place per car id (1 = leading), updated every racing tick. */
  private readonly places = new Map<string, number>();
  /** Host switch: chaos mode (item boxes and items). Needs an items config. */
  private chaosEnabled = true;
  /** Race or Battle (P11.6), the host's choice between races. */
  mode: RaceMode = 'race';
  /** The battle running now (or the last one, until the next start); null in race mode. */
  battle: BattleRun | null = null;

  /** Items are on: the host's chaos switch, and always in a battle (items are the weapons). */
  get chaos(): boolean {
    return (this.chaosEnabled || this.mode === 'battle') && this.items !== undefined;
  }

  /** Switch chaos mode on or off (boxes come back fresh; held items are dropped when off). */
  setChaos(on: boolean): void {
    this.chaosEnabled = on;
    if (!this.chaos) for (const car of this.world.cars) car.item = '';
    this.resetChaos();
  }

  /** Fresh item boxes (race start, new track, chaos switched); no items config = chaos off. */
  private resetChaos(): void {
    this.world.chaos = this.items && this.chaos ? createChaos(this.world.track, this.items, this.world.tick + CHAOS_SEED) : undefined;
  }

  /** Host: Race or Battle for the next race. */
  setMode(by: string, mode: RaceMode): string | null {
    if (by !== this.flow.host) return 'only the host can change the mode';
    if (!seatChangesAllowed(this.flow.phase)) return 'not during a race';
    if (mode === 'battle' && !this.items) return 'battle needs items (config/items.json)';
    this.mode = mode;
    this.battle = null;
    this.setChaos(this.chaosEnabled); // a battle always has items
    return null;
  }

  /** Lives left and out, for one car in the battle (null outside one). */
  carBattle(id: string): { lives: number; out: boolean } | null {
    const lives = this.battle?.lives.get(id);
    return lives === undefined || !this.battle ? null : { lives, out: isOut(this.battle, id) };
  }

  /** Host switch: bots drive empty cars up to `race.botFillCars` cars. */
  botsEnabled = false;
  /** Car slots driven by server bots, and each bot's memory. */
  private readonly botSlots = new Set<number>();
  private readonly botMemory = new Map<number, BotMemory>();

  constructor(
    track: Track,
    private cfg: Tuning,
    stats: CarStats,
    teams?: TeamsConfig,
    private readonly items?: ItemsConfig,
  ) {
    this.world = createWorld(track, []);
    this.resetChaos();
    this.stats = { ...stats };
    this.flow = newFlow(cfg.race);
    this.teamNames = Array.from({ length: cfg.race.maxCars }, (_, slot) =>
      teams ? defaultTeamName(teams, slot) : `Team ${slot + 1}`,
    );
  }

  /** The host before a track switch reloaded every page: keeps host while their seat is held. */
  private reloadHost: string | null = null;

  private updateHost(): void {
    if (this.reloadHost !== null) {
      const p = this.players.get(this.reloadHost);
      if (p) {
        this.flow.host = this.reloadHost;
        if (p.connected) this.reloadHost = null; // back: normal rules again
        return;
      }
      this.reloadHost = null; // their seat expired
    }
    this.flow.host = chooseHost(this.joinOrder, (id) => this.players.get(id)?.connected === true, this.flow.host);
  }

  /**
   * Every page is about to reload (track switch): the current host stays host while they
   * reconnect, instead of whoever reloads fastest (or a bot client that never reloads).
   */
  keepHostThroughReload(): void {
    this.reloadHost = this.flow.host;
  }

  /**
   * Swap in new tuning (live tuning). `sim` and `track` keep their current values: the tick
   * rate and the built track are fixed until a restart. Returns true when such a change was
   * ignored, so the caller can say "restart needed".
   */
  setConfig(cfg: Tuning): boolean {
    const ignored =
      JSON.stringify(cfg.sim) !== JSON.stringify(this.cfg.sim) ||
      JSON.stringify(cfg.track) !== JSON.stringify(this.cfg.track);
    this.cfg = { ...cfg, sim: this.cfg.sim, track: this.cfg.track };
    return ignored;
  }

  /** New car stats (cars.json edited): applies to every car right away. */
  setStats(stats: CarStats): void {
    this.stats = { ...stats };
    for (const car of this.world.cars) car.stats = { ...stats };
  }

  /** New track (track file edited): every car goes back to its grid spot. */
  setTrack(track: Track): void {
    this.world.track = track;
    for (const car of this.world.cars) {
      Object.assign(car, createCarOnGrid(car.id, car.stats, track, slotOfCar(car.id), this.cfg.race));
    }
    this.resetChaos();
  }

  /** Seat facts for every player, sorted by id (for state sync and rules). */
  seating(): SeatedPlayer[] {
    return [...this.players.values()]
      .map(({ id, slot, seat, connected }) => ({ id, slot, seat, connected }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** Last input `seq` applied for a player (-1 = none yet); echoed so clients can measure delay. */
  ackSeq(id: string): number {
    return this.players.get(id)?.lastSeq ?? -1;
  }

  /** A new player arrives, not in a car yet (they pick a seat next). */
  addPlayer(id: string): void {
    if (this.players.has(id)) return;
    this.players.set(id, {
      id, slot: -1, seat: null, connected: true,
      lastSeq: -1, input: { ...NO_INPUT }, respawnHeld: false, respawnPending: false, honkHeld: false, honkPending: false, fireHeld: false, firePending: false, mashTotal: 0, mashPending: 0, mashTick: -Infinity, ready: false,
    });
    this.joinOrder.push(id);
    this.updateHost();
  }

  /**
   * Connection lost (seat held) or back. While a player is away their partner drives solo;
   * coming back restores the roles. Inputs reset so a stale "gas held" never sticks.
   */
  setConnected(id: string, connected: boolean): void {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = connected;
    p.input = { ...NO_INPUT };
    // A reopened page counts its inputs from 1 again: forget the old page's numbering, or
    // every new input would look "older" than the last one and be dropped.
    if (connected) p.lastSeq = -1;
    p.respawnHeld = false;
    p.respawnPending = false;
    p.honkHeld = false;
    p.honkPending = false;
    p.fireHeld = false;
    p.firePending = false;
    p.mashTotal = 0;
    p.mashPending = 0;
    this.updateHost();
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    const at = this.joinOrder.indexOf(id);
    if (at >= 0) this.joinOrder.splice(at, 1);
    this.updateHost();
    this.syncCars();
    // Everyone left: start over in the lobby.
    if (this.players.size === 0) toLobby(this.flow, this.world.tick);
  }

  /** Take a seat. Returns why not, or null on success. */
  setSeat(id: string, slot: number, seat: Seat): string | null {
    const p = this.players.get(id);
    if (!p) return 'unknown player';
    if (!seatChangesAllowed(this.flow.phase)) return SEATS_LOCKED;
    const problem = seatProblem(this.seating(), id, slot, seat, this.cfg.race.maxCars);
    if (problem) return problem;
    p.slot = slot;
    p.seat = seat;
    p.input = { ...NO_INPUT };
    this.syncCars();
    return null;
  }

  /** Leave your seat and watch. Returns why not, or null on success. */
  leaveSeat(id: string): string | null {
    const p = this.players.get(id);
    if (!p) return 'unknown player';
    if (!seatChangesAllowed(this.flow.phase)) return SEATS_LOCKED;
    p.slot = -1;
    p.seat = null;
    this.syncCars();
    return null;
  }

  /** Host: start the race (or a rematch). Cars go to the grid and wait out the countdown. */
  startRace(by: string): string | null {
    const problem = startProblem(this.flow, by, this.world.cars.length);
    if (problem) return problem;
    // Rematch: drop cars that were only kept for the results screen.
    if (this.flow.phase === 'results') this.syncCars(false);
    if (this.world.cars.length === 0) return 'there are no cars (sit in one, or turn bots on)';
    startCountdown(this.flow, this.world.tick);
    for (const p of this.players.values()) p.ready = false;
    // Grid: random for the first race, then the last results reversed (leaders at the back).
    const order = gridOrder(this.world.cars.map((c) => c.id), this.lastResults, new Rng(this.world.tick + 7));
    for (const car of this.world.cars) {
      Object.assign(car, createCarOnGrid(car.id, car.stats, this.world.track, order.indexOf(car.id), this.cfg.race));
    }
    this.resetChaos();
    this.run = null;
    this.battle = null;
    return null;
  }

  /** Race info for one car (null outside a race). */
  carRace(id: string): { run: CarRun; place: number; wrongWay: boolean; gapTicks: number } | null {
    const r = this.run?.cars.get(id);
    if (!r || !this.run) return null;
    const leader = this.leaderId;
    return {
      run: r,
      place: this.places.get(id) ?? 0,
      wrongWay: isWrongWay(r, this.cfg.race, this.cfg.sim.dt),
      gapTicks: leader === undefined ? 0 : gapTicks(this.run, leader, id),
    };
  }

  /** Ready (or not) in the lobby. */
  setReady(id: string, ready: boolean): void {
    const p = this.players.get(id);
    if (p) p.ready = ready;
  }

  isReady(id: string): boolean {
    return this.players.get(id)?.ready ?? false;
  }

  /** The roster (cars.json) and the car each slot drives (default: roster car N for slot N). */
  private roster: readonly CarDef[] = [];
  readonly carModels: string[] = [];

  /** New roster (start, or cars.json edited): keep valid picks, give every car its stats. */
  setRoster(defs: readonly CarDef[]): void {
    this.roster = defs;
    for (let slot = 0; slot < this.cfg.race.maxCars; slot++) {
      const picked = this.carModels[slot];
      if (!picked || !defs.some((d) => d.id === picked)) this.carModels[slot] = defs[slot % Math.max(1, defs.length)]?.id ?? '';
    }
    for (const car of this.world.cars) car.stats = { ...this.statsOf(slotOfCar(car.id)) };
  }

  /** The stats of the car a slot drives. */
  statsOf(slot: number): CarStats {
    return this.roster.find((d) => d.id === this.carModels[slot])?.stats ?? this.stats;
  }

  /** A team picks its car (either of its players, between races). */
  pickCar(by: string, slot: number, carId: string): string | null {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.cfg.race.maxCars) return 'there is no such car';
    if (!seatChangesAllowed(this.flow.phase)) return 'not during a race';
    if (this.players.get(by)?.slot !== slot) return 'only the players in that car can pick it';
    if (!this.roster.some((d) => d.id === carId)) return 'there is no such car model';
    this.carModels[slot] = carId;
    const car = this.world.cars.find((c) => c.id === carIdForSlot(slot));
    if (car) car.stats = { ...this.statsOf(slot) };
    return null;
  }

  /** Rename a team: its own players or the host. */
  setTeamName(by: string, slot: number, name: string): string | null {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.teamNames.length) return 'there is no such car';
    const problem = teamNameProblem(this.seating(), by, slot, this.flow.host);
    if (problem) return problem;
    this.teamNames[slot] = name;
    return null;
  }

  /** Host: random pairs for everyone connected (between races). */
  shuffle(by: string): string | null {
    if (by !== this.flow.host) return 'only the host can shuffle';
    if (!seatChangesAllowed(this.flow.phase)) return SEATS_LOCKED;
    // Everyone, including players whose seat is held while they reconnect.
    const ids = [...this.players.keys()];
    const plan = shuffleSeats(ids, this.cfg.race.maxCars, new Rng(this.world.tick + 1));
    for (const p of this.players.values()) {
      p.slot = -1;
      p.seat = null;
      p.input = { ...NO_INPUT };
    }
    for (const a of plan) {
      const p = this.players.get(a.id);
      if (!p) continue;
      p.slot = a.slot;
      p.seat = a.seat;
    }
    this.syncCars();
    return null;
  }

  /** Host: chaos mode on/off (between races). */
  hostSetChaos(by: string, on: boolean): string | null {
    if (by !== this.flow.host) return 'only the host can change chaos mode';
    if (!seatChangesAllowed(this.flow.phase)) return 'not during a race';
    this.setChaos(on);
    return null;
  }

  /** Host: bots fill empty cars on/off. */
  setBots(by: string, on: boolean): string | null {
    if (by !== this.flow.host) return 'only the host can change bots';
    if (!seatChangesAllowed(this.flow.phase)) return 'not during a race';
    this.botsEnabled = on;
    this.syncCars();
    return null;
  }

  /** Is this car driven by a server bot? */
  isBot(carId: string): boolean {
    return this.botSlots.has(slotOfCar(carId));
  }

  /**
   * Bots fill empty cars until there are `race.botFillCars` cars (when the host turned bots on).
   * A person who sits in a bot's car takes it over.
   */
  private refreshBots(): void {
    const humans = new Set(usedSlots(this.seating()));
    for (const slot of [...this.botSlots]) {
      if (this.botsEnabled && !humans.has(slot)) continue;
      this.botSlots.delete(slot);
      this.botMemory.delete(slot);
    }
    // New bots only between races: never a phantom car on the grid or a bot taking over a
    // human team mid-race (e.g. when a reconnect hold runs out).
    if (!this.botsEnabled || !seatChangesAllowed(this.flow.phase)) return;
    for (let slot = 0; slot < this.cfg.race.maxCars && humans.size + this.botSlots.size < this.cfg.race.botFillCars; slot++) {
      if (humans.has(slot) || this.botSlots.has(slot)) continue;
      this.botSlots.add(slot);
      this.botMemory.set(slot, newBotMemory(this.cfg.bot.skill));
    }
  }

  /** Host: laps for the next race. */
  setLaps(by: string, laps: number): string | null {
    const problem = lapsProblem(this.flow, by, laps, this.cfg.race);
    if (problem) return problem;
    this.flow.laps = laps;
    return null;
  }

  /** Host: from the results back to the lobby. */
  backToLobby(by: string): string | null {
    if (by !== this.flow.host) return 'only the host can do that';
    if (this.flow.phase !== 'results') return 'only after a race';
    toLobby(this.flow, this.world.tick);
    this.syncCars(false); // cars kept for the results screen can go now
    return null;
  }

  /**
   * Host: stop the race now. In the countdown: back to the lobby. While racing: everyone
   * not finished is DNF and the results show (also the way out of a race nobody finishes).
   */
  endRace(by: string): string | null {
    if (by !== this.flow.host) return 'only the host can end the race';
    if (this.flow.phase === 'countdown') {
      toLobby(this.flow, this.world.tick);
      return null;
    }
    if (this.flow.phase !== 'racing') return 'no race is running';
    this.endRequested = true;
    return null;
  }

  /** Make the world's cars match the occupied slots (new cars start on the start line). */
  private syncCars(keepForResults = this.flow.phase === 'results'): void {
    this.refreshBots();
    const wanted = new Set([...usedSlots(this.seating()), ...this.botSlots].map(carIdForSlot));
    for (let i = this.world.cars.length - 1; i >= 0; i--) {
      const id = this.world.cars[i]!.id;
      if (wanted.has(id)) continue;
      // Keep every car on the results screen until the lobby (or a rematch) clears them.
      if (keepForResults) continue;
      this.world.cars.splice(i, 1);
      if (this.run && this.flow.phase === 'racing') dropCar(this.run, id);
      if (this.battle && this.flow.phase === 'racing') dropBattleCar(this.battle, id);
    }
    for (const id of wanted) {
      if (this.world.cars.some((c) => c.id === id)) continue;
      const car = createCarOnGrid(id, this.statsOf(slotOfCar(id)), this.world.track, slotOfCar(id), this.cfg.race);
      // A car appearing mid-race is ghosted for a moment, so it can't land on a passing car.
      car.ghostUntilTick = this.world.tick + Math.round(this.cfg.race.respawnGhostSeconds / this.cfg.sim.dt);
      // Keep cars sorted by id: the sim iterates them in this order (determinism).
      const at = this.world.cars.findIndex((c) => c.id > id);
      if (at < 0) this.world.cars.push(car);
      else this.world.cars.splice(at, 0, car);
    }
  }

  /**
   * Apply a raw client message. Returns false when it was dropped: malformed, from an
   * unknown player, or older than one already applied.
   */
  handleInput(id: string, raw: unknown): boolean {
    const p = this.players.get(id);
    const msg = parseInputMessage(raw);
    if (!p || !msg || msg.seq <= p.lastSeq) return false;
    p.lastSeq = msg.seq;
    p.input = toCarInput(msg);
    if (p.input.respawn && !p.respawnHeld) p.respawnPending = true;
    p.respawnHeld = p.input.respawn;
    const honk = p.input.honk ?? false;
    if (honk && !p.honkHeld) p.honkPending = true;
    p.honkHeld = honk;
    const fire = p.input.fire ?? false;
    if (fire && !p.fireHeld) p.firePending = true;
    p.fireHeld = fire;
    // Forced Update mashing: a new press counts at most `maxMashPerSec` times a second per
    // player (a modified client can't finish an update instantly); a lower count = restarted.
    const mash = msg.mash ?? p.mashTotal;
    const gap = this.items ? Math.round(1 / this.items.items.forcedUpdate.maxMashPerSec / this.cfg.sim.dt) : 0;
    if (mash > p.mashTotal && this.world.tick - p.mashTick >= gap) {
      p.mashPending = 1;
      p.mashTick = this.world.tick;
    }
    p.mashTotal = mash;
    return true;
  }

  /**
   * The input a car uses this tick: each connected occupant contributes only the controls
   * their role allows (a lone player is solo and has them all).
   */
  private carInput(slot: number, seating: SeatedPlayer[]): CarInput {
    const parts: InputPart[] = [];
    for (const s of occupants(seating, slot)) {
      const p = this.players.get(s.id);
      const role = effectiveRole(seating, s.id);
      if (!p || !role || !s.connected) continue;
      parts.push({ role, input: { ...p.input, respawn: p.respawnPending, honk: p.honkPending, fire: p.firePending, mash: p.mashPending } });
    }
    return mergeCarInput(parts);
  }

  /**
   * Swap lane: the car's Pilot and Engineer trade seats (each laptop just switches role).
   * A car with one player (or a bot) only gets the cooled engine.
   */
  private swapSeats(slot: number): void {
    let pilot: Player | undefined;
    let engineer: Player | undefined;
    for (const p of this.players.values()) {
      if (p.slot !== slot) continue;
      if (p.seat === 'pilot') pilot = p;
      else if (p.seat === 'engineer') engineer = p;
    }
    // A partner away (reconnecting) keeps their seat and role; the one left drives solo.
    if (!pilot || !engineer || !pilot.connected || !engineer.connected) return;
    pilot.seat = 'engineer';
    engineer.seat = 'pilot';
    this.seatsSwapped = true;
  }

  /** Set when a swap lane changed seats this tick (the room re-syncs players). */
  seatsSwapped = false;

  /** The merged input each car used in the last tick (by car id). */
  lastInputs: Readonly<Record<string, CarInput>> = {};

  /** One fixed sim tick. */
  tick(): SimEvent[] {
    const inputs: Record<string, CarInput> = {};
    const seating = this.seating();
    // During the countdown everyone waits on the grid: controls are ignored.
    const live = inputsAllowed(this.flow.phase);
    for (const slot of usedSlots(seating)) {
      inputs[carIdForSlot(slot)] = live ? this.carInput(slot, seating) : NO_INPUT;
      // One player driving alone: the optional solo handicap applies (solo.speedMultiplier).
      const car = this.world.cars.find((c) => c.id === carIdForSlot(slot));
      if (car) car.solo = occupants(seating, slot).some((s) => s.connected && effectiveRole(seating, s.id) === 'solo');
    }
    for (const slot of this.botSlots) {
      const car = this.world.cars.find((c) => c.id === carIdForSlot(slot));
      const memory = this.botMemory.get(slot);
      if (car && memory) inputs[car.id] = live ? botInput(car, this.world.track, this.cfg, memory, this.world.cars) : NO_INPUT;
    }
    for (const p of this.players.values()) {
      p.respawnPending = false;
      p.honkPending = false;
      p.firePending = false;
      p.mashPending = 0;
    }
    // Out of the battle: the car rolls to a stop, see-through, and nothing touches it.
    const battle = this.flow.phase === 'racing' ? this.battle : null;
    if (battle) {
      for (const car of this.world.cars) {
        if (!isOut(battle, car.id)) continue;
        inputs[car.id] = NO_INPUT;
        car.ghostUntilTick = this.world.tick + 2;
      }
    }
    this.lastInputs = inputs;
    const events = step(this.world, inputs, this.cfg);
    for (const e of events) if (e.type === 'swap') this.swapSeats(slotOfCar(e.car));
    const { race, sim } = this.cfg;
    const tick = this.world.tick;
    let over = false;
    if (this.flow.phase === 'racing' && this.run && battle) {
      // Battle: no laps and no wrong way (ambush from any side); item hits take lives.
      countTick(this.counts, events, this.brakingCars(inputs), sim.dt);
      for (const id of applyBattleEvents(battle, events, tick, this.cfg.battle, sim.dt)) {
        const car = this.world.cars.find((c) => c.id === id);
        if (car) car.item = '';
      }
      over = this.endRequested || battleOver(battle, tick, this.cfg.battle, sim.dt);
      this.endRequested = false;
    } else if (this.flow.phase === 'racing' && this.run) {
      applyEvents(this.run, events, tick);
      countTick(this.counts, events, this.brakingCars(inputs), sim.dt);
      updateWrongWay(this.run, this.world, race);
      if (this.endRequested) {
        for (const c of this.run.cars.values()) if (c.finishTick === null) c.dnf = true;
      }
      over = this.endRequested || raceOver(this.run, tick, race, sim.dt);
      this.endRequested = false;
    }
    const changed = stepFlow(this.flow, tick, race, sim.dt, over);
    if (changed === 'racing') {
      // GO: the race clock starts now.
      this.run = newRun(this.world.cars.map((c) => c.id), this.flow.laps, tick);
      this.battle = this.mode === 'battle' ? newBattle(this.world.cars.map((c) => c.id), this.cfg.battle, tick) : null;
      this.counts = newCounts(this.world.cars.map((c) => c.id));
    } else if (changed === 'results' && this.run) {
      this.lastResults = this.battle ? battleResults(this.battle, tick) : results(this.run, this.world);
      this.lastCounts = new Map([...this.counts].map(([id, c]) => [slotOfCar(id), { ...c }]));
    }
    // Places after any phase change, so the first racing tick already has them.
    if (this.run && this.flow.phase === 'racing') {
      this.places.clear();
      const order = this.battle ? battleStandings(this.battle) : standings(this.run, this.world);
      order.forEach((id, i) => this.places.set(id, i + 1));
      this.leaderId = order[0];
    }
    return events;
  }

  /** Cars whose applied input brakes while moving (the Brake Abuser counter). */
  private brakingCars(inputs: Readonly<Record<string, CarInput>>): Set<string> {
    const out = new Set<string>();
    for (const car of this.world.cars) {
      if (inputs[car.id]?.brake && Math.hypot(car.vx, car.vz) >= this.cfg.league.brakeMinSpeed) out.add(car.id);
    }
    return out;
  }
}

