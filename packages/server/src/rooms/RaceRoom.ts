import { Room, type Client } from '@colyseus/core';
import {
  MSG,
  NAME_MAX_LENGTH,
  SetNameSchema,
  SetSeatSchema,
  effectiveRole,
  type LobbyError,
  type Tuning,
  type World,
} from '@escape/shared';
import { liveConfig, type ConfigChange } from '../liveConfig';
import { TokenBucket } from '../net/rateLimit';
import { CarView, PlayerState, RaceState } from '../schema/RaceState';
import { RaceSim } from './raceSim';

/** Weight of the newest tick in the smoothed tick cost shown by the F3 overlay. */
const TICK_MS_SMOOTHING = 0.05;
/** tickMs is sent in steps of 1/this ms (0.1 ms). */
const TICK_MS_ROUND = 10;

interface Limits {
  input: TokenBucket;
  lobby: TokenBucket;
}

/** The one room of the server: players join, pick a car and seat, and drive. */
export class RaceRoom extends Room<{ state: RaceState }> {
  // The server creates this room at startup; it must survive being empty.
  override autoDispose = false;
  override state = new RaceState();

  private sim!: RaceSim;
  private tuning!: Tuning;
  private readonly limits = new Map<string, Limits>();
  private unsubscribe: () => void = () => {};
  private tickMsAvg = 0;
  private joinCount = 0;

  override onCreate(): void {
    // Config comes from the server's files (live in dev), never from client options.
    const live = liveConfig();
    this.tuning = live.tuning;
    const firstCar = live.cars.cars[0];
    if (!firstCar) throw new Error('config/cars.json has no cars');
    this.sim = new RaceSim(live.track, this.tuning, firstCar.stats);
    // Two players per car; more would only be able to watch.
    this.maxClients = this.tuning.race.maxCars * 2;
    this.setPatchRate(this.tuning.net.patchRateMs);
    this.unsubscribe = live.subscribe((change) => this.onConfigChange(change));

    this.onMessage(MSG.input, (client, message: unknown) => {
      // Over the rate limit or malformed: drop quietly (never log per message).
      if (!this.limits.get(client.sessionId)?.input.take()) return;
      this.sim.handleInput(client.sessionId, message);
    });

    this.onMessage(MSG.setName, (client, message: unknown) => {
      if (!this.limits.get(client.sessionId)?.lobby.take()) return;
      const msg = SetNameSchema.safeParse(message);
      const player = this.state.players.get(client.sessionId);
      if (!msg.success || !player) return this.refuse(client, `names are 1–${NAME_MAX_LENGTH} characters`);
      player.name = msg.data.name;
    });

    this.onMessage(MSG.setSeat, (client, message: unknown) => {
      if (!this.limits.get(client.sessionId)?.lobby.take()) return;
      const msg = SetSeatSchema.safeParse(message);
      if (!msg.success) return this.refuse(client, 'bad seat request');
      const problem = this.sim.setSeat(client.sessionId, msg.data.slot, msg.data.seat);
      if (problem) return this.refuse(client, problem);
      this.syncPlayers();
    });

    this.onMessage(MSG.leaveSeat, (client) => {
      if (!this.limits.get(client.sessionId)?.lobby.take()) return;
      this.sim.leaveSeat(client.sessionId);
      this.syncPlayers();
    });

    // The tick rate is fixed when the room starts: changing sim.dt needs a server restart.
    this.setFixedTimestep(() => {
      const started = performance.now();
      const events = this.sim.tick();
      // Smoothed so the overlay number is readable (weight of the newest tick).
      this.tickMsAvg += (performance.now() - started - this.tickMsAvg) * TICK_MS_SMOOTHING;
      // Rounded, so an idle room does not send a patch every tick just for this number.
      this.state.tickMs = Math.round(this.tickMsAvg * TICK_MS_ROUND) / TICK_MS_ROUND;
      this.syncCars(this.sim.world);
      if (events.length > 0) this.broadcast(MSG.events, events);
    }, Math.round(1 / this.tuning.sim.dt));
  }

  private refuse(client: Client, reason: string): void {
    const err: LobbyError = { reason };
    client.send(MSG.lobbyError, err);
  }

  private newLimits(): Limits {
    const n = this.tuning.net;
    return { input: new TokenBucket(n.inputRatePerSec, n.inputBurst), lobby: new TokenBucket(n.lobbyRatePerSec, n.lobbyBurst) };
  }

  /** Live config changed (dev: F2 panel or an edited file). */
  private onConfigChange(change: ConfigChange): void {
    if (change.kind === 'tuning') {
      this.tuning = change.tuning;
      if (this.sim.setConfig(change.tuning)) {
        console.log('[config] sim/track settings changed: restart the server to apply them');
      }
      for (const id of this.limits.keys()) this.limits.set(id, this.newLimits());
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
    this.joinCount++;
    const player = new PlayerState();
    player.name = `Player ${this.joinCount}`;
    this.state.players.set(client.sessionId, player);
    this.limits.set(client.sessionId, this.newLimits());
    this.sim.addPlayer(client.sessionId);
    this.syncPlayers();
    // The page bundles tuning.json at build time; this makes sure it uses the live values.
    client.send(MSG.tuning, this.tuning);
    console.log(`[room] join  ${client.sessionId} (${this.state.players.size} connected)`);
  }

  /** Connection lost without saying goodbye (Wi-Fi blip, tab closed): hold the seat for a while. */
  override onDrop(client: Client): void {
    this.sim.setConnected(client.sessionId, false);
    this.syncPlayers();
    console.log(`[room] drop  ${client.sessionId} (seat held ${this.tuning.net.reconnectSeconds}s)`);
    // Resolves on reconnect (onReconnect). On timeout it rejects and Colyseus calls onLeave,
    // so the rejection itself needs no handling beyond not crashing the process.
    this.allowReconnection(client, this.tuning.net.reconnectSeconds).catch(() => {});
  }

  override onReconnect(client: Client): void {
    this.sim.setConnected(client.sessionId, true);
    this.syncPlayers();
    client.send(MSG.tuning, this.tuning);
    console.log(`[room] back  ${client.sessionId}`);
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.limits.delete(client.sessionId);
    this.sim.removePlayer(client.sessionId);
    this.syncPlayers();
    console.log(`[room] leave ${client.sessionId} (${this.state.players.size} connected)`);
  }

  override onDispose(): void {
    this.unsubscribe();
  }

  /** Copy seats and roles into the synced players (after any seat change). */
  private syncPlayers(): void {
    const seating = this.sim.seating();
    for (const s of seating) {
      const view = this.state.players.get(s.id);
      if (!view) continue;
      view.slot = s.slot;
      view.seat = s.seat ?? '';
      view.role = effectiveRole(seating, s.id) ?? '';
      view.connected = s.connected;
    }
  }

  /** Copy the sim's cars into the synced state (Colyseus sends only what changed). */
  private syncCars(world: World): void {
    this.state.tick = world.tick;
    // Input echo: sent with the same patch as the motion it caused.
    this.state.players.forEach((view, id) => {
      view.ackSeq = this.sim.ackSeq(id);
    });
    for (const id of [...this.state.cars.keys()]) {
      if (!world.cars.some((c) => c.id === id)) this.state.cars.delete(id);
    }
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
      view.vx = car.vx;
      view.vz = car.vz;
      view.vy = car.vy;
      const input = this.sim.lastInputs[car.id];
      view.inSteer = input?.steer ?? 0;
      view.inGas = input?.gas ?? false;
      view.inBrake = input?.brake ?? false;
      view.respawning = car.respawnAtTick >= 0;
      view.ghost = car.ghostUntilTick > world.tick;
    }
  }
}
