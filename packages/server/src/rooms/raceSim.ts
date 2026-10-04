import {
  NO_INPUT,
  carIdForSlot,
  createCar,
  createWorld,
  occupants,
  parseInputMessage,
  seatProblem,
  step,
  toCarInput,
  usedSlots,
  type CarInput,
  type CarStats,
  type Seat,
  type SeatedPlayer,
  type SimEvent,
  type Track,
  type Tuning,
  type World,
} from '@escape/shared';

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

  constructor(
    track: Track,
    private cfg: Tuning,
    stats: CarStats,
  ) {
    this.world = createWorld(track, []);
    this.stats = { ...stats };
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

  /** New track (track file edited): every car goes back to the start line. */
  setTrack(track: Track): void {
    this.world.track = track;
    for (const car of this.world.cars) Object.assign(car, createCar(car.id, car.stats, track));
  }

  /** Seat facts for every player, sorted by id (for state sync and rules). */
  seating(): SeatedPlayer[] {
    return [...this.players.values()]
      .map(({ id, slot, seat, connected }) => ({ id, slot, seat, connected }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** A new player arrives, not in a car yet (they pick a seat next). */
  addPlayer(id: string): void {
    if (this.players.has(id)) return;
    this.players.set(id, {
      id, slot: -1, seat: null, connected: true,
      lastSeq: -1, input: { ...NO_INPUT }, respawnHeld: false, respawnPending: false,
    });
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.syncCars();
  }

  /** Take a seat. Returns why not, or null on success. */
  setSeat(id: string, slot: number, seat: Seat): string | null {
    const p = this.players.get(id);
    if (!p) return 'unknown player';
    const problem = seatProblem(this.seating(), id, slot, seat, this.cfg.race.maxCars);
    if (problem) return problem;
    p.slot = slot;
    p.seat = seat;
    p.input = { ...NO_INPUT };
    this.syncCars();
    return null;
  }

  /** Leave your seat and watch. */
  leaveSeat(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    p.slot = -1;
    p.seat = null;
    this.syncCars();
  }

  /** Make the world's cars match the occupied slots (new cars start on the start line). */
  private syncCars(): void {
    const wanted = new Set(usedSlots(this.seating()).map(carIdForSlot));
    for (let i = this.world.cars.length - 1; i >= 0; i--) {
      if (!wanted.has(this.world.cars[i]!.id)) this.world.cars.splice(i, 1);
    }
    for (const id of wanted) {
      if (this.world.cars.some((c) => c.id === id)) continue;
      const car = createCar(id, this.stats, this.world.track);
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

  /** The input a car uses this tick. P2.1: its first occupant drives everything (P2.2 merges roles). */
  private carInput(slot: number): CarInput {
    const seated = occupants(this.seating(), slot).filter((s) => s.connected);
    const driver = seated[0] ? this.players.get(seated[0].id) : undefined;
    if (!driver) return NO_INPUT;
    return { ...driver.input, respawn: driver.respawnPending };
  }

  /** One fixed sim tick. */
  tick(): SimEvent[] {
    const inputs: Record<string, CarInput> = {};
    for (const slot of usedSlots(this.seating())) inputs[carIdForSlot(slot)] = this.carInput(slot);
    for (const p of this.players.values()) p.respawnPending = false;
    return step(this.world, inputs, this.cfg);
  }
}
