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
}

/**
 * The authoritative race simulation behind the room, without any Colyseus code so it can
 * be tested directly. For now every player drives one car solo (P2 adds Pilot/Engineer).
 */
export class RaceSim {
  readonly world: World;
  private readonly seats = new Map<string, Seat>();

  constructor(
    track: Track,
    private cfg: Tuning,
    private readonly stats: CarStats,
  ) {
    this.world = createWorld(track, []);
  }

  /** Swap in new tuning (live tuning in P1.7). */
  setConfig(cfg: Tuning): void {
    this.cfg = cfg;
  }

  /** Add a car for a player on the start line. Cars do not collide yet, so they share it. */
  addCar(id: string): void {
    if (this.seats.has(id)) return;
    const car = createCar(id, this.stats, this.world.track);
    // Keep cars sorted by id: the sim iterates them in this order (determinism).
    const at = this.world.cars.findIndex((c) => c.id > id);
    if (at < 0) this.world.cars.push(car);
    else this.world.cars.splice(at, 0, car);
    this.seats.set(id, { lastSeq: -1, input: { ...NO_INPUT } });
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
    return true;
  }

  /** One fixed sim tick. Each car uses its player's latest input. */
  tick(): SimEvent[] {
    const inputs: Record<string, CarInput> = {};
    for (const [id, seat] of this.seats) inputs[id] = seat.input;
    return step(this.world, inputs, this.cfg);
  }
}
