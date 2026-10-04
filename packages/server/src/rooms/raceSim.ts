import {
  NO_INPUT,
  createCar,
  createWorld,
  parseInputMessage,
  step,
  toCarInput,
  type CarInput,
  type CarStats,
  type SimEvent,
  type Track,
  type Tuning,
  type World,
} from '@escape/shared';

interface Seat {
  lastSeq: number;
  input: CarInput;
  /** Was R held in the last message? Respawn fires once per press, not while held. */
  respawnHeld: boolean;
  /** A press arrived that the next tick should act on. */
  respawnPending: boolean;
}

/**
 * The authoritative race simulation behind the room, without any Colyseus code so it can
 * be tested directly. For now every player drives one car solo (P2 adds Pilot/Engineer).
 */
export class RaceSim {
  readonly world: World;
  private stats: CarStats;
  private readonly seats = new Map<string, Seat>();

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
    const ignored = JSON.stringify(cfg.sim) !== JSON.stringify(this.cfg.sim) || JSON.stringify(cfg.track) !== JSON.stringify(this.cfg.track);
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
    for (const car of this.world.cars) {
      const fresh = createCar(car.id, car.stats, track);
      Object.assign(car, fresh);
    }
  }

  /** Add a car for a player on the start line. Cars do not collide yet, so they share it. */
  addCar(id: string): void {
    if (this.seats.has(id)) return;
    const car = createCar(id, this.stats, this.world.track);
    // Keep cars sorted by id: the sim iterates them in this order (determinism).
    const at = this.world.cars.findIndex((c) => c.id > id);
    if (at < 0) this.world.cars.push(car);
    else this.world.cars.splice(at, 0, car);
    this.seats.set(id, { lastSeq: -1, input: { ...NO_INPUT }, respawnHeld: false, respawnPending: false });
  }

  removeCar(id: string): void {
    this.seats.delete(id);
    const at = this.world.cars.findIndex((c) => c.id === id);
    if (at >= 0) this.world.cars.splice(at, 1);
  }

  /**
   * Apply a raw client message. Returns false when it was dropped: malformed, from an
   * unknown player, or older than one already applied.
   */
  handleInput(id: string, raw: unknown): boolean {
    const seat = this.seats.get(id);
    const msg = parseInputMessage(raw);
    if (!seat || !msg || msg.seq <= seat.lastSeq) return false;
    seat.lastSeq = msg.seq;
    seat.input = toCarInput(msg);
    if (seat.input.respawn && !seat.respawnHeld) seat.respawnPending = true;
    seat.respawnHeld = seat.input.respawn;
    return true;
  }

  /** One fixed sim tick. Each car uses its player's latest input. */
  tick(): SimEvent[] {
    const inputs: Record<string, CarInput> = {};
    for (const [id, seat] of this.seats) {
      inputs[id] = { ...seat.input, respawn: seat.respawnPending };
      seat.respawnPending = false;
    }
    return step(this.world, inputs, this.cfg);
  }
}
