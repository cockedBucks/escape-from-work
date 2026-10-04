import { Room, type Client } from '@colyseus/core';
import { MSG, type World } from '@escape/shared';
import { loadCarsFile, loadTrackFile, loadTuningFile } from '../config';
import { TokenBucket } from '../net/rateLimit';
import { CarView, PlayerState, RaceState } from '../schema/RaceState';
import { RaceSim } from './raceSim';

/** Track used until the lobby can pick one (P3). */
const DEFAULT_TRACK = 'test-loop';

/** The one room of the server: players join, each drives a car solo on the Test Loop. */
export class RaceRoom extends Room<{ state: RaceState }> {
  // The server creates this room at startup; it must survive being empty.
  override autoDispose = false;
  override state = new RaceState();

  private sim!: RaceSim;
  private readonly limits = new Map<string, TokenBucket>();
  private inputRate = { perSec: 0, burst: 1 };

  override onCreate(): void {
    // Read from disk here, never from client-supplied options.
    const tuning = loadTuningFile();
    const cars = loadCarsFile();
    const firstCar = cars.cars[0];
    if (!firstCar) throw new Error('config/cars.json has no cars');
    this.sim = new RaceSim(loadTrackFile(DEFAULT_TRACK, tuning), tuning, firstCar.stats);
    this.inputRate = { perSec: tuning.net.inputRatePerSec, burst: tuning.net.inputBurst };
    this.setPatchRate(tuning.net.patchRateMs);

    this.onMessage(MSG.input, (client, message: unknown) => {
      // Over the rate limit or malformed: drop quietly (never log per message).
      if (!this.limits.get(client.sessionId)?.take()) return;
      this.sim.handleInput(client.sessionId, message);
    });

    this.setFixedTimestep(() => {
      const events = this.sim.tick();
      this.syncState(this.sim.world);
      if (events.length > 0) this.broadcast(MSG.events, events);
    }, Math.round(1 / tuning.sim.dt));
  }

  override onJoin(client: Client): void {
    this.state.players.set(client.sessionId, new PlayerState());
    this.limits.set(client.sessionId, new TokenBucket(this.inputRate.perSec, this.inputRate.burst));
    this.sim.addCar(client.sessionId);
    console.log(`[room] join  ${client.sessionId} (${this.state.players.size} connected)`);
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.limits.delete(client.sessionId);
    this.sim.removeCar(client.sessionId);
    this.state.cars.delete(client.sessionId);
    console.log(`[room] leave ${client.sessionId} (${this.state.players.size} connected)`);
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
