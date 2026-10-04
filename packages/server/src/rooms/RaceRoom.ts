import { Room, type Client } from '@colyseus/core';
import { MSG, type Tuning, type World } from '@escape/shared';
import { liveConfig, type ConfigChange } from '../liveConfig';
import { TokenBucket } from '../net/rateLimit';
import { CarView, PlayerState, RaceState } from '../schema/RaceState';
import { RaceSim } from './raceSim';

/** Weight of the newest tick in the smoothed tick cost shown by the F3 overlay. */
const TICK_MS_SMOOTHING = 0.05;

/** The one room of the server: players join, each drives a car solo on the Test Loop. */
export class RaceRoom extends Room<{ state: RaceState }> {
  // The server creates this room at startup; it must survive being empty.
  override autoDispose = false;
  override state = new RaceState();

  private sim!: RaceSim;
  private tuning!: Tuning;
  private readonly limits = new Map<string, TokenBucket>();
  private unsubscribe: () => void = () => {};

  override onCreate(): void {
    // Config comes from the server's files (live in dev), never from client options.
    const live = liveConfig();
    this.tuning = live.tuning;
    const firstCar = live.cars.cars[0];
    if (!firstCar) throw new Error('config/cars.json has no cars');
    this.sim = new RaceSim(live.track, this.tuning, firstCar.stats);
    this.setPatchRate(this.tuning.net.patchRateMs);
    this.unsubscribe = live.subscribe((change) => this.onConfigChange(change));

    this.onMessage(MSG.input, (client, message: unknown) => {
      // Over the rate limit or malformed: drop quietly (never log per message).
      if (!this.limits.get(client.sessionId)?.take()) return;
      this.sim.handleInput(client.sessionId, message);
    });

    // The tick rate is fixed when the room starts: changing sim.dt needs a server restart.
    this.setFixedTimestep(() => {
      const started = performance.now();
      const events = this.sim.tick();
      // Smoothed so the overlay number is readable (weight of the newest tick).
      this.state.tickMs += (performance.now() - started - this.state.tickMs) * TICK_MS_SMOOTHING;
      this.syncState(this.sim.world);
      if (events.length > 0) this.broadcast(MSG.events, events);
    }, Math.round(1 / this.tuning.sim.dt));
  }

  /** Live config changed (dev: F2 panel or an edited file). */
  private onConfigChange(change: ConfigChange): void {
    if (change.kind === 'tuning') {
      this.tuning = change.tuning;
      this.sim.setConfig(change.tuning);
      this.setPatchRate(change.tuning.net.patchRateMs);
      this.broadcast(MSG.tuning, change.tuning);
    } else if (change.kind === 'cars') {
      const first = change.cars.cars[0];
      if (first) this.sim.setStats(first.stats);
    } else {
      this.sim.setTrack(change.track);
      this.broadcast(MSG.reload, { reason: 'track' });
    }
  }

  override onJoin(client: Client): void {
    this.state.players.set(client.sessionId, new PlayerState());
    const { inputRatePerSec, inputBurst } = this.tuning.net;
    this.limits.set(client.sessionId, new TokenBucket(inputRatePerSec, inputBurst));
    this.sim.addCar(client.sessionId);
    // The page bundles tuning.json at build time; this makes sure it uses the live values.
    client.send(MSG.tuning, this.tuning);
    console.log(`[room] join  ${client.sessionId} (${this.state.players.size} connected)`);
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.limits.delete(client.sessionId);
    this.sim.removeCar(client.sessionId);
    this.state.cars.delete(client.sessionId);
    console.log(`[room] leave ${client.sessionId} (${this.state.players.size} connected)`);
  }

  override onDispose(): void {
    this.unsubscribe();
  }

  /** Copy the sim's cars into the synced state (Colyseus sends only what changed). */
  private syncState(world: World): void {
    this.state.tick = world.tick;
    for (const car of world.cars) {
      let view = this.state.cars.get(car.id);
      if (!view) {
        view = new CarView();
        this.state.cars.set(car.id, view);
      }
      view.x = car.x;
      view.z = car.z;
      view.y = car.y;
      view.yaw = car.yaw;
      view.speed = Math.hypot(car.vx, car.vz);
      view.steer = car.steer;
      view.progress = car.progress;
      view.respawning = car.respawnAtTick >= 0;
      view.ghost = car.ghostUntilTick > world.tick;
    }
  }
}
