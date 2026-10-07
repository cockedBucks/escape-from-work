import {
  NO_INPUT,
  botInput,
  createCar,
  createWorld,
  newBotMemory,
  step,
  createChaos,
  PROP_KITS,
  type PropKit,
  type CarInput,
  type ItemsConfig,
  type Track,
  type Tuning,
  type World,
} from '@escape/shared';
import type { CarSource } from './game';
import type { CarSnap } from './net/snapshots';
import type { ItemsView } from './render/itemProps';
import { PROP_SHAPES } from './render/look';
import { clearOfRoads, shapeHalfWidth } from './render/propKit';
import { ReplayRecorder, photoCamera, type ReplayClip } from './replay/photoFinish';

/** Cars in a scenario bot race, and how far into the race the picture is taken (s). */
const SCENARIO_CARS = 4;
const SCENARIO_SECONDS = { chase: 6, ghost: 6, cockpit: 6, juice: 6, stall: 6, drift: 6, nitro: 6, sandstorm: 6, items: 2.2, garage: 0, photo: 0, props: 0, shortcut: 0, 'track-overview': 0 } as const;
/** Each bot starts this many ticks after the previous one, so they spread out. */
const STAGGER_TICKS = 20;

export type RaceScenario = keyof typeof SCENARIO_SECONDS;

export const isRaceScenario = (s: string | null): s is RaceScenario => s !== null && s in SCENARIO_SECONDS;

/**
 * Run a local bot race to a fixed moment and freeze it there, so every screenshot of the
 * scenario shows exactly the same picture. Uses the same shared sim as the server.
 */
export function frozenBotRace(track: Track, tuning: Tuning, scenario: RaceScenario, items?: ItemsConfig): World {
  const halfWidth = (track.samples[track.gates[0]?.sample ?? 0]?.width ?? 0) / 2;
  const cars = Array.from({ length: SCENARIO_CARS }, (_, i) =>
    createCar(`bot${i + 1}`, { speed: 1, grip: 1, weight: 1 }, track, 0, (i / (SCENARIO_CARS - 1) - 0.5) * halfWidth),
  );
  const world = createWorld(track, cars);
  const memory = new Map(world.cars.map((c) => [c.id, newBotMemory()]));
  const ticks = Math.round(SCENARIO_SECONDS[scenario] / tuning.sim.dt);
  for (let t = 0; t < ticks; t++) {
    const inputs: Record<string, CarInput> = {};
    // Stagger the bots a little so they do not drive as one block.
    for (const [i, car] of world.cars.entries()) {
      inputs[car.id] = t < i * STAGGER_TICKS ? NO_INPUT : botInput(car, track, tuning, memory.get(car.id)!);
    }
    step(world, inputs, tuning);
  }
  // `stall`: the car you follow (bot1) has just overheated (smoke, chase view).
  if (scenario === 'stall' && world.cars[0]) {
    world.cars[0].heat = 1;
    world.cars[0].stallUntilTick = world.tick + Math.round(tuning.heat.stallSeconds / tuning.sim.dt);
  }
  // `drift`: the car you follow (bot1) is mid-drift with orange (level 2) sparks.
  if (scenario === 'drift' && world.cars[0]) {
    const car = world.cars[0];
    car.driftDir = 1;
    car.driftLevel = 2;
    car.driftCharge = tuning.drift.levelSeconds[1];
    car.nitro = 0.6;
  }
  // `items`: chaos on, every box up, an envelope flying ahead of bot1, a coffee puddle beside
  // it, and bot1 behind its Firewall.
  if (scenario === 'items' && world.cars[0] && items) {
    const car = world.cars[0];
    world.chaos = createChaos(track, items, 1);
    const f = { x: Math.sin(car.yaw), z: Math.cos(car.yaw) };
    const r = { x: f.z, z: -f.x };
    world.chaos.envelopes.push({
      id: 1, owner: car.id, x: car.x + f.x * 9, z: car.z + f.z * 9, vx: f.x * 40, vz: f.z * 40,
      segment: car.segment, ticksLeft: 100, bounces: 0, armedAtTick: 0,
    });
    world.chaos.puddles.push({ id: 2, owner: car.id, x: car.x + f.x * 14 + r.x * 4, z: car.z + f.z * 14 + r.z * 4, ticksLeft: 100, ownerSafeUntilTick: 0, hit: [] });
    car.shieldTicks = 100;
  }
  // `nitro`: the car you follow (bot1) is burning nitro (big flames out the back).
  if (scenario === 'nitro' && world.cars[0]) {
    world.cars[0].nitro = 0.7;
    world.cars[0].nitroOn = true;
  }
  return world;
}

/** A car source that always shows the same frozen world. */
export function frozenSource(world: World): CarSource {
  return {
    sample(_now: number, out: Map<string, CarSnap>): void {
      for (const car of world.cars) {
        out.set(car.id, {
          x: car.x,
          y: car.y,
          z: car.z,
          yaw: car.yaw,
          speed: Math.hypot(car.vx, car.vz),
          steer: car.steer,
          respawning: car.respawnAtTick >= 0,
          ghost: car.ghostUntilTick > world.tick,
          stalled: car.stallUntilTick > world.tick,
          drift: car.driftDir,
          driftLevel: car.driftLevel,
          boosting: car.boostTicks > 0,
          nitroOn: car.nitroOn,
          shielded: car.shieldTicks > 0,
        });
      }
    },
  };
}

/** The frozen world's chaos (boxes, envelopes, puddles) for the item props. */
export function frozenItems(world: World): ItemsView | null {
  const chaos = world.chaos;
  if (!chaos) return null;
  return {
    boxesUp: chaos.boxes.map((b) => (b.respawnAtTick > world.tick ? '0' : '1')).join(''),
    shots: [
      ...chaos.envelopes.map((e) => ({ kind: 'mail', x: e.x, z: e.z, vx: 0, vz: 0 })),
      ...chaos.puddles.map((p) => ({ kind: 'coffee', x: p.x, z: p.z, vx: 0, vz: 0 })),
    ],
    shotsTime: 0,
  };
}

/** Garage: cars parked in two rows at the start line (spacing m); the camera stands behind and above (where the chase cam and the roof numbers face). */
const GARAGE = { cars: 8, sideGap: 5, rowGap: 7, camAhead: -19, camSide: -5, camHeight: 7, lookHeight: 0.5 };

/**
 * The `garage` showroom: one car per slot (car0…car7, so team colors and numbers differ)
 * standing still in two rows at the start line, and a fixed camera in front of them.
 */
export function garageWorld(track: Track): { world: World; camera: { from: [number, number, number]; at: [number, number, number] } } {
  const gate = track.gates[0]!;
  const f = { x: Math.sin(gate.yaw), z: Math.cos(gate.yaw) };
  const r = { x: f.z, z: -f.x }; // the driver's right
  const cols = Math.ceil(GARAGE.cars / 2);
  const cars = Array.from({ length: GARAGE.cars }, (_, i) => {
    const c = createCar(`car${i}`, { speed: 1, grip: 1, weight: 1 }, track);
    const side = ((i % cols) - (cols - 1) / 2) * GARAGE.sideGap;
    const back = -Math.floor(i / cols) * GARAGE.rowGap;
    c.x = gate.pos.x + r.x * side + f.x * back;
    c.z = gate.pos.z + r.z * side + f.z * back;
    c.yaw = gate.yaw;
    return c;
  });
  const mid = { x: gate.pos.x - f.x * (GARAGE.rowGap / 2), z: gate.pos.z - f.z * (GARAGE.rowGap / 2) };
  return {
    world: createWorld(track, cars),
    camera: {
      from: [mid.x + f.x * GARAGE.camAhead + r.x * GARAGE.camSide, GARAGE.camHeight, mid.z + f.z * GARAGE.camAhead + r.z * GARAGE.camSide],
      at: [mid.x, GARAGE.lookHeight, mid.z],
    },
  };
}

/** `photo` scenario: cars around the finish line at the crossing moment (m ahead of the line, m to the right). */
const PHOTO_SCENE = { speed: 25, crossMs: 1500, clipMs: 3000, frameMs: 1000 / 30, cars: [[-1.6, -2.2], [-1.9, 2.2], [-8, 0], [-13, -2.5]] as const };

/**
 * The `photo` scenario: a recorded clip of four cars driving through the finish line (built
 * here, as the page would record it), to play through the real replay at the crossing moment.
 */
export function photoFinishClip(track: Track): { clip: ReplayClip; at: number; camera: { from: [number, number, number]; at: [number, number, number] } } {
  const gate = track.gates[0]!;
  const f = { x: Math.sin(gate.yaw), z: Math.cos(gate.yaw) };
  const r = { x: gate.right.x - gate.pos.x, z: gate.right.z - gate.pos.z };
  const len = Math.hypot(r.x, r.z) || 1;
  const rec = new ReplayRecorder(PHOTO_SCENE.cars.length, 1000 / PHOTO_SCENE.frameMs, PHOTO_SCENE.clipMs / 1000);
  const snaps = new Map<string, CarSnap>();
  for (let t = 0; t <= PHOTO_SCENE.clipMs; t += PHOTO_SCENE.frameMs) {
    const along = ((t - PHOTO_SCENE.crossMs) / 1000) * PHOTO_SCENE.speed;
    PHOTO_SCENE.cars.forEach(([ahead, side], i) => {
      snaps.set(`car${i}`, {
        x: gate.pos.x + f.x * (ahead + along) + (r.x / len) * side,
        y: 0,
        z: gate.pos.z + f.z * (ahead + along) + (r.z / len) * side,
        yaw: gate.yaw, speed: PHOTO_SCENE.speed, steer: 0, respawning: false, ghost: false, stalled: false,
        drift: 0, driftLevel: 0, boosting: false, nitroOn: false, shielded: false,
      });
    });
    rec.record(t, snaps);
  }
  return { clip: rec.clip(), at: PHOTO_SCENE.crossMs, camera: photoCamera(gate) };
}

/** Props showroom: one of each office prop in a row beside the start straight (spacing m). */
const PROP_ROW = { pad: 1.6, side: 14, sideStep: 1, maxSide: 200, camBack: 22, camSide: 0, camHeight: 7, lookHeight: 1.2, viewWidthPerMeter: 1.5 };

/** Half the widest extent of a prop kit piece as drawn (m, `officeScale` included). */
export function propHalfWidth(kit: PropKit): number {
  return shapeHalfWidth(PROP_SHAPES[kit]);
}

/**
 * The `props` scenario: one of every prop the track uses (every kit when it has none) lined up
 * beside the start line, spaced by size, and a fixed camera far enough back to see the row.
 */
export function propsShowroom(track: Track): { track: Track; camera: { from: [number, number, number]; at: [number, number, number] } } {
  const gate = track.gates[0]!;
  const f = { x: Math.sin(gate.yaw), z: Math.cos(gate.yaw) };
  const r = { x: f.z, z: -f.x };
  const used = new Set(track.def.props.map((p) => p.kit));
  const kits = PROP_KITS.filter((k) => used.size === 0 || used.has(k));
  const halves = kits.map(propHalfWidth);
  const length = halves.reduce((sum, h) => sum + 2 * h + PROP_ROW.pad, -PROP_ROW.pad);
  const rowAt = (side: number): { kit: PropKit; x: number; z: number; rot: number }[] => {
    let cursor = -length / 2;
    return kits.map((kit, i) => {
      const along = cursor + halves[i]!;
      cursor += 2 * halves[i]! + PROP_ROW.pad;
      return { kit, x: gate.pos.x + f.x * along - r.x * side, z: gate.pos.z + f.z * along - r.z * side, rot: gate.yaw - Math.PI / 2 };
    });
  };
  // Move the row out from the road until no prop (as a square of its drawn half width) touches any road.
  let side = PROP_ROW.side;
  let props = rowAt(side);
  while (side < PROP_ROW.maxSide && !props.every((p, i) => clearOfRoads(track, p.x, p.z, halves[i]!))) {
    side += PROP_ROW.sideStep;
    props = rowAt(side);
  }
  const mid = { x: gate.pos.x - r.x * side, z: gate.pos.z - r.z * side };
  // Far enough to see the whole row, and in front of the deepest prop (the CPU cooler is huge).
  const back = Math.max(PROP_ROW.camBack, length / PROP_ROW.viewWidthPerMeter - side, Math.max(...halves) + PROP_ROW.camBack / 2);
  return {
    track: { ...track, def: { ...track.def, props } },
    camera: {
      from: [mid.x + r.x * back + f.x * PROP_ROW.camSide, PROP_ROW.camHeight, mid.z + r.z * back + f.z * PROP_ROW.camSide],
      at: [mid.x, PROP_ROW.lookHeight, mid.z],
    },
  };
}

/** `shortcut` camera: above the main road `back` m before the first shortcut's fork, looking at the fork. */
const SHORTCUT_CAM = { back: 28, side: 0, height: 34, lookAlong: 0.2 };

/**
 * The `shortcut` scenario: a fixed camera over where the track's first shortcut leaves the
 * main road (no cars), to check the junction walls and the opening. Falls back to the start line.
 */
export function shortcutCamera(track: Track): { from: [number, number, number]; at: [number, number, number] } {
  const br = track.branches[0];
  const fork = br?.samples[0] ?? track.samples[track.gates[0]?.sample ?? 0]!;
  const look = br?.samples[Math.floor((br.samples.length - 1) * SHORTCUT_CAM.lookAlong)] ?? fork;
  return {
    from: [fork.pos.x - fork.dir.x * SHORTCUT_CAM.back, SHORTCUT_CAM.height, fork.pos.z - fork.dir.z * SHORTCUT_CAM.back],
    at: [look.pos.x, 0, look.pos.z],
  };
}
