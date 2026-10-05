import {
  NO_INPUT,
  carIdForSlot,
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
} from '@escape/shared';

/** Refusal while a race is on (seat changes would teleport a car back to the grid). */
const SEATS_LOCKED = 'seats are locked during the race';

/** Grid position of a server car: its slot ("car3" → 3). */
const slotOfCar = (id: string): number => Number(id.slice('car'.length));

interface Player extends SeatedPlayer {
  lastSeq: number;
  input: CarInput;
  /** Was R held in the last message? Respawn fires once per press, not while held. */
  respawnHeld: boolean;
  /** A press arrived that the next tick should act on. */
  respawnPending: boolean;
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

  constructor(
    track: Track,
    private cfg: Tuning,
    stats: CarStats,
  ) {
    this.world = createWorld(track, []);
    this.stats = { ...stats };
    this.flow = newFlow(cfg.race);
  }

  private updateHost(): void {
    this.flow.host = chooseHost(this.joinOrder, (id) => this.players.get(id)?.connected === true, this.flow.host);
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
      lastSeq: -1, input: { ...NO_INPUT }, respawnHeld: false, respawnPending: false,
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
    const problem = startProblem(this.flow, by, usedSlots(this.seating()).length);
    if (problem) return problem;
    startCountdown(this.flow, this.world.tick);
    for (const car of this.world.cars) {
      Object.assign(car, createCarOnGrid(car.id, car.stats, this.world.track, slotOfCar(car.id), this.cfg.race));
    }
    return null;
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
    return null;
  }

  /** Make the world's cars match the occupied slots (new cars start on the start line). */
  private syncCars(): void {
    const wanted = new Set(usedSlots(this.seating()).map(carIdForSlot));
    for (let i = this.world.cars.length - 1; i >= 0; i--) {
      if (!wanted.has(this.world.cars[i]!.id)) this.world.cars.splice(i, 1);
    }
    for (const id of wanted) {
      if (this.world.cars.some((c) => c.id === id)) continue;
      const car = createCarOnGrid(id, this.stats, this.world.track, slotOfCar(id), this.cfg.race);
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
      parts.push({ role, input: { ...p.input, respawn: p.respawnPending } });
    }
    return mergeCarInput(parts);
  }

  /** The merged input each car used in the last tick (by car id). */
  lastInputs: Readonly<Record<string, CarInput>> = {};

  /** One fixed sim tick. */
  tick(): SimEvent[] {
    const inputs: Record<string, CarInput> = {};
    const seating = this.seating();
    // During the countdown everyone waits on the grid: controls are ignored.
    const live = inputsAllowed(this.flow.phase);
    for (const slot of usedSlots(seating)) inputs[carIdForSlot(slot)] = live ? this.carInput(slot, seating) : NO_INPUT;
    for (const p of this.players.values()) p.respawnPending = false;
    this.lastInputs = inputs;
    const events = step(this.world, inputs, this.cfg);
    // Race over comes from the race rules in P3.3; until then a race only ends via the lobby.
    stepFlow(this.flow, this.world.tick, this.cfg.race, this.cfg.sim.dt, false);
    return events;
  }
}
