import { Room, type Client } from '@colyseus/core';
import {
  BotsSchema,
  MSG,
  NAME_MAX_LENGTH,
  ReadySchema,
  SetTeamNameSchema,
  TEAM_NAME_MAX_LENGTH,
  parseHead,
  SetLapsSchema,
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
  head: TokenBucket;
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
    this.sim = new RaceSim(live.track, this.tuning, firstCar.stats, live.teams);
    for (const name of this.sim.teamNames) this.state.teams.push(name);
    // Two players per car plus some watchers (seats themselves are limited by the seat rules).
    this.maxClients = this.tuning.race.maxCars * 2 + this.tuning.race.maxSpectators;
    this.setPatchRate(this.tuning.net.patchRateMs);
    this.unsubscribe = live.subscribe((change) => this.onConfigChange(change));

    this.onMessage(MSG.input, (client, message: unknown) => {
      // Over the rate limit or malformed: drop quietly (never log per message).
      if (!this.limits.get(client.sessionId)?.input.take()) return;
      this.sim.handleInput(client.sessionId, message);
    });

    // Head angles (cockpit look): validated, clamped to the head limits, straight into state.
    this.onMessage(MSG.head, (client, message: unknown) => {
      if (!this.limits.get(client.sessionId)?.head.take()) return;
      const head = parseHead(message, this.tuning.camera);
      const player = this.state.players.get(client.sessionId);
      if (!head || !player) return;
      player.headYaw = head.yaw;
      player.headPitch = head.pitch;
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
      const problem = this.sim.leaveSeat(client.sessionId);
      if (problem) return this.refuse(client, problem);
      this.syncPlayers();
    });

    this.onMessage(MSG.setTeamName, (client, message: unknown) => {
      if (!this.limits.get(client.sessionId)?.lobby.take()) return;
      const msg = SetTeamNameSchema.safeParse(message);
      if (!msg.success) return this.refuse(client, `team names are 1–${TEAM_NAME_MAX_LENGTH} characters`);
      const problem = this.sim.setTeamName(client.sessionId, msg.data.slot, msg.data.name);
      if (problem) return this.refuse(client, problem);
      this.state.teams[msg.data.slot] = msg.data.name;
    });

    this.onMessage(MSG.ready, (client, message: unknown) => {
      if (!this.limits.get(client.sessionId)?.lobby.take()) return;
      const msg = ReadySchema.safeParse(message);
      if (!msg.success) return;
      this.sim.setReady(client.sessionId, msg.data.ready);
      this.syncPlayers();
    });

    // Host controls. The race rules decide who may do what and when.
    this.onMessage(MSG.hostShuffle, (client) => {
      if (!this.limits.get(client.sessionId)?.lobby.take()) return;
      const problem = this.sim.shuffle(client.sessionId);
      if (problem) return this.refuse(client, problem);
      this.syncPlayers();
    });

    this.onMessage(MSG.hostBots, (client, message: unknown) => {
      if (!this.limits.get(client.sessionId)?.lobby.take()) return;
      const msg = BotsSchema.safeParse(message);
      if (!msg.success) return;
      const problem = this.sim.setBots(client.sessionId, msg.data.on);
      if (problem) return this.refuse(client, problem);
      this.state.bots = this.sim.botsEnabled;
    });

    this.onMessage(MSG.hostStart, (client) => {
      if (!this.limits.get(client.sessionId)?.lobby.take()) return;
      const problem = this.sim.startRace(client.sessionId);
      if (problem) return this.refuse(client, problem);
      this.syncPlayers(); // ready flags reset
      console.log(`[room] race start (${this.sim.world.cars.length} cars, ${this.sim.flow.laps} laps)`);
    });

    this.onMessage(MSG.hostLaps, (client, message: unknown) => {
      if (!this.limits.get(client.sessionId)?.lobby.take()) return;
      const msg = SetLapsSchema.safeParse(message);
      if (!msg.success) return this.refuse(client, 'bad laps request');
      const problem = this.sim.setLaps(client.sessionId, msg.data.laps);
      if (problem) this.refuse(client, problem);
    });

    this.onMessage(MSG.hostEndRace, (client) => {
      if (!this.limits.get(client.sessionId)?.lobby.take()) return;
      const problem = this.sim.endRace(client.sessionId);
      if (problem) return this.refuse(client, problem);
      console.log('[room] race ended by the host');
    });

    this.onMessage(MSG.hostLobby, (client) => {
      if (!this.limits.get(client.sessionId)?.lobby.take()) return;
      const problem = this.sim.backToLobby(client.sessionId);
      if (problem) this.refuse(client, problem);
    });

    // The tick rate is fixed when the room starts: changing sim.dt needs a server restart.
    this.setFixedTimestep(() => {
      const started = performance.now();
      const phaseBefore = this.sim.flow.phase;
      const hostBefore = this.sim.flow.host;
      const events = this.sim.tick();
      this.logChanges(phaseBefore, hostBefore);
      // Smoothed so the overlay number is readable (weight of the newest tick).
      const cost = performance.now() - started;
      this.tickMsAvg += (cost - this.tickMsAvg) * TICK_MS_SMOOTHING;
      this.recordRaceTick(cost);
      // Rounded, so an idle room does not send a patch every tick just for this number.
      this.state.tickMs = Math.round(this.tickMsAvg * TICK_MS_ROUND) / TICK_MS_ROUND;
      this.syncCars(this.sim.world);
      if (events.length > 0) this.broadcast(MSG.events, events);
    }, Math.round(1 / this.tuning.sim.dt));
  }

  /** One log line per race start/end and host change (never per tick). */
  private logChanges(phaseBefore: string, hostBefore: string | null): void {
    const flow = this.sim.flow;
    if (phaseBefore === 'racing' && flow.phase === 'results') {
      const done = (this.sim.lastResults ?? []).filter((r) => !r.dnf).length;
      console.log(`[room] race end (${done}/${this.sim.lastResults?.length ?? 0} finished)`);
    }
    if (hostBefore !== flow.host) this.logHost();
  }

  /** Run a player change and log if the host moved because of it. */
  private trackHost(change: () => void): void {
    const before = this.sim.flow.host;
    change();
    if (before !== this.sim.flow.host) this.logHost();
  }

  private logHost(): void {
    const host = this.sim.flow.host;
    console.log(`[room] host is now ${host === null ? 'nobody' : (this.state.players.get(host)?.name ?? host)}`);
  }

  /** Race tick stats: reset when a countdown starts, measured while racing. */
  private raceTicks = { count: 0, sum: 0, max: 0, over: 0 };

  private recordRaceTick(cost: number): void {
    const phase = this.sim.flow.phase;
    if (phase === 'countdown') {
      this.raceTicks = { count: 0, sum: 0, max: 0, over: 0 };
      this.state.tickOverBudget = 0;
    }
    if (phase !== 'racing') return;
    const r = this.raceTicks;
    r.count++;
    r.sum += cost;
    r.max = Math.max(r.max, cost);
    if (cost > this.tuning.sim.dt * 1000) {
      r.over++;
      this.state.tickOverBudget = r.over;
    }
    this.state.tickMsMax = r.max;
    this.state.raceTicks = r.count;
    // Rounded like tickMs so it does not force a patch every tick.
    this.state.tickMsAvg = Math.round((r.sum / r.count) * TICK_MS_ROUND) / TICK_MS_ROUND;
  }

  private refuse(client: Client, reason: string): void {
    const err: LobbyError = { reason };
    client.send(MSG.lobbyError, err);
  }

  private newLimits(): Limits {
    const n = this.tuning.net;
    return {
      input: new TokenBucket(n.inputRatePerSec, n.inputBurst),
      lobby: new TokenBucket(n.lobbyRatePerSec, n.lobbyBurst),
      head: new TokenBucket(n.headRatePerSec, n.headBurst),
    };
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
    this.trackHost(() => this.sim.addPlayer(client.sessionId));
    this.syncPlayers();
    // The page bundles tuning.json at build time; this makes sure it uses the live values.
    client.send(MSG.tuning, this.tuning);
    console.log(`[room] join  ${client.sessionId} (${this.state.players.size} connected)`);
  }

  /** Connection lost without saying goodbye (Wi-Fi blip, tab closed): hold the seat for a while. */
  override onDrop(client: Client): void {
    this.trackHost(() => this.sim.setConnected(client.sessionId, false));
    this.syncPlayers();
    console.log(`[room] drop  ${client.sessionId} (seat held ${this.tuning.net.reconnectSeconds}s)`);
    // Resolves on reconnect (onReconnect). On timeout it rejects and Colyseus calls onLeave,
    // so the rejection itself needs no handling beyond not crashing the process.
    this.allowReconnection(client, this.tuning.net.reconnectSeconds).catch(() => {});
  }

  override onReconnect(client: Client): void {
    this.trackHost(() => this.sim.setConnected(client.sessionId, true));
    this.syncPlayers();
    client.send(MSG.tuning, this.tuning);
    console.log(`[room] back  ${client.sessionId}`);
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.limits.delete(client.sessionId);
    this.trackHost(() => this.sim.removePlayer(client.sessionId));
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
      view.ready = this.sim.isReady(s.id);
    }
  }

  /** Copy the sim's cars into the synced state (Colyseus sends only what changed). */
  private syncCars(world: World): void {
    this.state.tick = world.tick;
    const flow = this.sim.flow;
    this.state.phase = flow.phase;
    this.state.phaseTick = flow.phaseTick;
    this.state.host = flow.host ?? '';
    this.state.laps = flow.laps;
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
      view.bot = this.sim.isBot(car.id);
      const race = this.sim.carRace(car.id);
      const tickMs = this.tuning.sim.dt * 1000;
      view.lapsDone = race?.run.lapsDone ?? 0;
      view.place = race?.place ?? 0;
      view.finished = race?.run.finishTick != null;
      view.dnf = race?.run.dnf ?? false;
      view.wrongWay = race?.wrongWay ?? false;
      const start = this.sim.run?.startTick ?? 0;
      view.finishMs = race && race.run.finishTick !== null ? Math.round((race.run.finishTick - start) * tickMs) : 0;
      view.gapMs = race ? Math.round(race.gapTicks * tickMs) : 0;
      view.bestLapMs = race && race.run.bestLapTicks !== null ? Math.round(race.run.bestLapTicks * tickMs) : 0;
      const input = this.sim.lastInputs[car.id];
      view.inSteer = input?.steer ?? 0;
      view.inGas = input?.gas ?? false;
      view.inBrake = input?.brake ?? false;
      view.respawning = car.respawnAtTick >= 0;
      view.ghost = car.ghostUntilTick > world.tick;
    }
  }
}
