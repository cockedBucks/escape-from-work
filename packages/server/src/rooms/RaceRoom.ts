import { randomUUID } from 'node:crypto';
import { Room, type Client } from '@colyseus/core';
import {
  BotsSchema,
  ChaosSchema,
  SetCarSchema,
  MSG,
  NAME_MAX_LENGTH,
  ReadySchema,
  SetTeamNameSchema,
  TEAM_NAME_MAX_LENGTH,
  parseHead,
  SetFaceSchema,
  SetLapsSchema,
  SetTrackSchema,
  seatChangesAllowed,
  SetNameSchema,
  SetSeatSchema,
  carIdForSlot,
  effectiveRole,
  pickAwards,
  type LobbyError,
  type RaceRecord,
  type Tuning,
  type World,
} from '@escape/shared';
import { faceExists } from '../faces';
import { league } from '../league/league';
import { localIso, raceRecord } from '../league/record';
import { liveConfig, type ConfigChange } from '../liveConfig';
import { TokenBucket } from '../net/rateLimit';
import { CarView, PlayerState, RaceState, ShotView } from '../schema/RaceState';
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

/** Proof that the server (not a client) asked for the room; a fresh secret every run. */
export const SERVER_ROOM_KEY = randomUUID();

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
  /** The record of the last race (sent again to anyone who (re)joins during the results). */
  private lastRecord: RaceRecord | null = null;
  /** Sessions that joined as networked bot clients (scripts/bots): never scored in the league. */
  private readonly botClients = new Set<string>();

  override onCreate(options: unknown): void {
    // One lobby per server (D004): only the server itself makes the room, never a client's create().
    if ((options as { key?: unknown } | null)?.key !== SERVER_ROOM_KEY) throw new Error('rooms are made by the server only');
    // Config comes from the server's files (live in dev), never from client options.
    const live = liveConfig();
    this.tuning = live.tuning;
    const firstCar = live.cars.cars[0];
    if (!firstCar) throw new Error('config/cars.json has no cars');
    this.sim = new RaceSim(live.track, this.tuning, firstCar.stats, live.teams, live.items);
    for (const name of this.sim.teamNames) this.state.teams.push(name);
    this.state.track = live.trackId;
    this.sim.setRoster(live.cars.cars);
    for (const model of this.sim.carModels) this.state.carModels.push(model);
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
      if (!head || !player || player.slot < 0) return; // only seated players have a head
      player.headYaw = head.yaw;
      player.headPitch = head.pitch;
    });

    this.onMessage(MSG.setFace, (client, message: unknown) => {
      if (!this.limits.get(client.sessionId)?.lobby.take()) return;
      const msg = SetFaceSchema.safeParse(message);
      const player = this.state.players.get(client.sessionId);
      if (!msg.success || !player) return;
      // Only faces that really exist on this PC (or '' for the placeholder).
      if (msg.data.face !== '' && !faceExists(msg.data.face)) return this.refuse(client, 'that face is not on the host');
      player.face = msg.data.face;
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

    this.onMessage(MSG.setCar, (client, message: unknown) => {
      if (!this.limits.get(client.sessionId)?.lobby.take()) return;
      const msg = SetCarSchema.safeParse(message);
      if (!msg.success) return;
      const problem = this.sim.pickCar(client.sessionId, msg.data.slot, msg.data.car);
      if (problem) return this.refuse(client, problem);
      this.state.carModels[msg.data.slot] = msg.data.car;
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

    this.onMessage(MSG.hostChaos, (client, message: unknown) => {
      if (!this.limits.get(client.sessionId)?.lobby.take()) return;
      const msg = ChaosSchema.safeParse(message);
      if (!msg.success) return;
      const problem = this.sim.hostSetChaos(client.sessionId, msg.data.on);
      if (problem) return this.refuse(client, problem);
      this.state.chaos = this.sim.chaos;
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

    this.onMessage(MSG.hostTrack, (client, message: unknown) => {
      if (!this.limits.get(client.sessionId)?.lobby.take()) return;
      const msg = SetTrackSchema.safeParse(message);
      if (!msg.success) return this.refuse(client, 'bad track request');
      if (client.sessionId !== this.sim.flow.host) return this.refuse(client, 'only the host can pick the track');
      if (!seatChangesAllowed(this.sim.flow.phase)) return this.refuse(client, 'not during a race');
      // Loading the track emits a config change: the sim takes it and every page reloads into it.
      const problem = liveConfig().selectTrack(msg.data.id);
      if (problem) return this.refuse(client, problem);
      console.log(`[room] track is now ${msg.data.id}`);
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
      if (this.sim.seatsSwapped) {
        this.sim.seatsSwapped = false;
        this.syncPlayers(); // new roles after a swap lane
      }
      if (events.length > 0) this.broadcast(MSG.events, events);
    }, Math.round(1 / this.tuning.sim.dt));
  }

  /** One log line per race start/end and host change (never per tick). */
  private logChanges(phaseBefore: string, hostBefore: string | null): void {
    const flow = this.sim.flow;
    if (phaseBefore === 'racing' && flow.phase === 'results') {
      const done = (this.sim.lastResults ?? []).filter((r) => !r.dnf).length;
      console.log(`[room] race end (${done}/${this.sim.lastResults?.length ?? 0} finished)`);
      this.recordRace();
    }
    if (hostBefore !== flow.host) this.logHost();
  }

  /** Joining or back during the results: the points and awards of the race just finished. */
  private sendRecord(client: Client): void {
    if (this.lastRecord && this.sim.flow.phase === 'results') client.send(MSG.raceRecord, this.lastRecord);
  }

  /**
   * The finished race's record with its awards: sent to everyone (results screen) and saved to
   * the league (real server only). Bots-only races have no record.
   */
  private recordRace(): void {
    const results = this.sim.lastResults;
    if (!results) return;
    const players = [...this.state.players.entries()].map(([id, p]) => ({ name: p.name, slot: p.slot, seat: p.seat, bot: this.botClients.has(id) }));
    const record = raceRecord({
      at: localIso(new Date()),
      track: liveConfig().trackId,
      laps: this.sim.flow.laps,
      chaos: this.sim.chaos,
      tickMs: this.tuning.sim.dt * 1000,
      results,
      teamNames: this.sim.teamNames,
      carModels: this.sim.carModels,
      isBotSlot: (slot) => this.sim.isBot(carIdForSlot(slot)),
      players,
      counts: this.sim.lastCounts,
    });
    if (!record) return;
    record.awards = pickAwards(record.cars, this.tuning.league.awards, this.tuning.league.maxAwards);
    this.lastRecord = record;
    this.broadcast(MSG.raceRecord, record);
    const store = league();
    if (!store) return;
    try {
      store.addRace(record);
    } catch (err) {
      // Never let the league stop the game. The race stays in memory; the next save writes it too.
      console.warn(`[league] could not save the race (kept in memory, retried after the next race): ${String(err instanceof Error ? err.message : err).split('\n')[0]}`);
    }
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
      this.sim.setRoster(change.cars.cars);
      this.sim.carModels.forEach((model, slot) => (this.state.carModels[slot] = model));
    } else {
      this.sim.setTrack(change.track);
      this.state.track = liveConfig().trackId;
      this.broadcast(MSG.reload, { reason: 'track' });
    }
  }

  override onJoin(client: Client, options?: unknown): void {
    this.joinCount++;
    if (typeof options === 'object' && options !== null && (options as { bot?: unknown }).bot === true) this.botClients.add(client.sessionId);
    const player = new PlayerState();
    player.name = `Player ${this.joinCount}`;
    this.state.players.set(client.sessionId, player);
    this.limits.set(client.sessionId, this.newLimits());
    this.trackHost(() => this.sim.addPlayer(client.sessionId));
    this.syncPlayers();
    // The page bundles tuning.json at build time; this makes sure it uses the live values.
    client.send(MSG.tuning, this.tuning);
    this.sendRecord(client);
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
    this.sendRecord(client);
    console.log(`[room] back  ${client.sessionId}`);
  }

  override onLeave(client: Client): void {
    this.botClients.delete(client.sessionId);
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

  /** Envelope / puddle keys seen this tick (reused). */
  private readonly liveShots = new Set<string>();

  /** Item boxes (up/down) and flying envelopes / puddles. */
  private syncChaos(world: World): void {
    const chaos = world.chaos;
    this.state.chaos = this.sim.chaos;
    let up = '';
    if (chaos) for (const b of chaos.boxes) up += b.respawnAtTick > world.tick ? '0' : '1';
    this.state.boxesUp = up;
    const live = this.liveShots;
    live.clear();
    const put = (key: string, kind: string, x: number, z: number, vx: number, vz: number): void => {
      live.add(key);
      let v = this.state.shots.get(key);
      if (!v) {
        v = new ShotView();
        v.kind = kind;
        this.state.shots.set(key, v);
      }
      v.x = x;
      v.z = z;
      v.vx = vx;
      v.vz = vz;
    };
    if (chaos) {
      for (const e of chaos.envelopes) put(`m${e.id}`, 'mail', e.x, e.z, e.vx, e.vz);
      for (const p of chaos.puddles) put(`c${p.id}`, 'coffee', p.x, p.z, 0, 0);
    }
    // Something gone? (Only then walk the map; deleting while iterating needs a copy of the keys.)
    if (this.state.shots.size !== live.size) {
      for (const key of [...this.state.shots.keys()]) if (!live.has(key)) this.state.shots.delete(key);
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
    this.syncChaos(world);
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
      view.inNitro = input?.nitro ?? false;
      view.respawning = car.respawnAtTick >= 0;
      view.ghost = car.ghostUntilTick > world.tick;
      view.heat = car.heat;
      view.stallLeft = car.stallUntilTick > world.tick ? (car.stallUntilTick - world.tick) * this.tuning.sim.dt : 0;
      view.drift = car.driftDir;
      view.driftLevel = car.driftLevel;
      view.driftCharge = car.driftCharge;
      view.boostLeft = car.boostTicks * this.tuning.sim.dt;
      view.driftStraight = car.straightTicks * this.tuning.sim.dt;
      view.onSwap = car.onSwap;
      view.nitro = car.nitro;
      view.nitroOn = car.nitroOn;
      view.solo = car.solo;
      view.item = car.item;
      view.spinLeft = car.spinTicks * this.tuning.sim.dt;
      view.shieldLeft = car.shieldTicks * this.tuning.sim.dt;
      view.blueLeft = car.blueScreenTicks * this.tuning.sim.dt;
      view.lagLeft = car.lagTicks * this.tuning.sim.dt;
      view.swapLeft = car.controlSwapTicks * this.tuning.sim.dt;
      view.updateLeft = car.updateTicks * this.tuning.sim.dt;
    }
  }
}
