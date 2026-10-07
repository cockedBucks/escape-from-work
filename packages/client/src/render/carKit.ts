import * as THREE from 'three';
import type { CarLook, CarPart } from '@escape/shared';
import { Builder } from './kitBuilder';
import { CAR_BODIES, CAR_KIT, CAR_PARTS_LOOK as P, HEAD, PALETTE } from './look';
import { alongEdge, bodySide, clipZ, heightAt, insetConvex, signedArea2, topSegments, type SidePoint } from './sideProfile';

// The car kit (ART_STYLE §4): real-life car types (P12.2) built from side outlines. A car's
// whole body — body with wheel arches, cabin with windows, bumpers, lights, plates and its
// signature parts — is ONE vertex-colored geometry, so it costs one draw call. Wheels, the
// roof number and the shadow are separate (they move or use a texture).
// Pure geometry: no DOM, testable headless.

/** Where things go on a built car (meters, car space: +Z forward, +X left). */
export interface CarShape {
  /** The merged, vertex-colored body. */
  body: THREE.BufferGeometry;
  wheelRadius: number;
  wheelWidth: number;
  /** Wheel centers: ±`wheelBase` forward/back, ±`wheelTrack` sideways. */
  wheelBase: number;
  wheelTrack: number;
  /** Bobblehead center height and seat position along the car. */
  headY: number;
  seatZ: number;
  /** Number decal: center height and place along the car (roof behind the heads, or hood). */
  numberY: number;
  numberZ: number;
  length: number;
  width: number;
}

/** Parts that sit on the roof (the number then goes on the hood). */
const ROOF_PARTS: readonly CarPart[] = ['roofSign', 'roofBox', 'dish', 'ladder'];

/** Arch radius over a wheel: a gap around the tire, but always some body left above it. */
export function archRadius(top: readonly SidePoint[], z: number, wheelRadius: number): number {
  return Math.min(wheelRadius + CAR_KIT.archGap, heightAt(top, z, false) - wheelRadius - CAR_KIT.archSkin);
}

/** A tire with its rim (vertex-colored, axle along X), shared by every wheel of that size. */
export function buildWheel(radius: number): THREE.BufferGeometry {
  const K = CAR_KIT;
  const b = new Builder(K.roundSegments);
  const along = Math.PI / 2; // cylinders stand on Y: turn them to lie along X
  b.add(new THREE.CylinderGeometry(radius, radius, K.wheelWidth, K.wheelSegments), PALETTE.tire, 0, 0, 0, 0, 0, along);
  const rim = radius * K.rimShare;
  b.add(new THREE.CylinderGeometry(rim, rim, K.wheelWidth + P.glassThick, K.rimSegments), K.rim, 0, 0, 0, 0, 0, along);
  return b.build();
}

/** Build a car's body and layout from its look and team paint. */
export function buildCarShape(look: CarLook, paint: number): CarShape {
  const K = CAR_KIT;
  const B = CAR_BODIES[look.body];
  const b = new Builder(K.roundSegments);
  const hw = B.width / 2;
  const cw = B.width * B.cabinWidth;
  const top = B.outline;
  const noseTop = top[0]!;
  const tailTop = top[top.length - 1]!;
  const front = noseTop[0];
  const back = tailTop[0];
  const cabin = B.cabin;
  const ccw = signedArea2(cabin) >= 0 ? 1 : -1;
  const shield = [cabin[0]!, cabin[1]!] as const;
  const roofFront = cabin[1]!;
  const roofBack = cabin[cabin.length - 2]!;
  const rearBase = cabin[cabin.length - 1]!;
  const clamp = (z: number, lo: number, hi: number): number => Math.min(Math.max(z, lo), hi);
  const cabinZs = cabin.map((p) => p[0]);
  /** Height of the body (not the cabin) at z (parts that would hang off an end stay on it). */
  const bodyAt = (z: number): number => heightAt(top, clamp(z, back, front), false);
  /** Height of the cabin's top at z (clamped to the cabin). */
  const cabinAt = (z: number): number => heightAt(cabin, clamp(z, Math.min(...cabinZs), Math.max(...cabinZs)));
  /** Height of the car's top (body or cabin) at z. */
  const topAt = (z: number): number => Math.max(bodyAt(z), heightAt(cabin, z));
  /** Highest point of the car's top over [z − half, z + half] (a flat part resting on it). */
  const restAt = (z: number, half: number): number => Math.max(topAt(z - half), topAt(z), topAt(z + half));
  // A wheelScale too big for this body (cars.json allows up to 1.8) gets the biggest wheel its
  // arches can take, so a tire never pokes through the fender.
  const fit = Math.min(...[B.wheelBase, -B.wheelBase].map((z) => (bodyAt(z) - K.archSkin - K.archGap) / 2));
  const wheelRadius = Math.min(K.wheelRadius * look.wheelScale, fit);

  // Body: the side outline with wheel arches, extruded across the car.
  const arches = [B.wheelBase, -B.wheelBase].map((z) => ({ z, centerY: wheelRadius, radius: archRadius(top, z, wheelRadius) }));
  b.prism(bodySide(top, B.ride, arches, K.archSegments), B.width, paint, 0);
  // Dark sills between the arches.
  const sillLength = 2 * B.wheelBase - arches[0]!.radius - arches[1]!.radius;
  for (const side of [-1, 1]) b.box(P.sill.thick, P.sill.height, sillLength, K.trim, side * hw, B.ride + P.sill.height / 2, 0);

  // Cabin in paint (its frame is the pillars and the roof), with tinted glass set into it.
  b.prism(cabin, cw, paint, 0);
  const glass = insetConvex(cabin, P.pillar);
  for (const [z0, z1] of B.windows) {
    const pane = clipZ(glass, Math.min(z0, z1), Math.max(z0, z1));
    if (pane.length < 3) continue;
    for (const side of [-1, 1]) b.prism(pane, P.glassThick, K.glass, side * (cw / 2));
  }
  // Windshield and rear window: panes laid on the cabin's front and back slopes.
  for (const [p, q] of [shield, [roofBack, rearBase] as const]) {
    const e = alongEdge(p, q);
    const nz = ((q[1] - p[1]) / e.length) * ccw; // outward normal (right of the edge, counter-clockwise)
    const ny = (-(q[0] - p[0]) / e.length) * ccw;
    const out = P.glassThick / 2;
    b.box(cw - 2 * P.pillar, P.glassThick, e.length - 2 * P.pillar, K.glass, 0, e.y + ny * out, e.z + nz * out, e.tilt);
  }
  // Side mirrors at the windshield's foot.
  const mirrorZ = shield[0][0] - P.mirror.back;
  for (const side of [-1, 1]) {
    b.box(P.mirror.width, P.mirror.height, P.mirror.depth, paint, side * (cw / 2 + P.mirror.width / 2), bodyAt(mirrorZ) + P.mirror.lift, mirrorZ);
  }

  // Nose and tail (upright faces from the ride line up to the outline's ends): headlights,
  // grille, taillights, bumpers and plates.
  const lampY = noseTop[1] - P.headlight.height / 2 - P.headlight.below;
  const tailY = tailTop[1] - P.taillight.height / 2 - P.taillight.below;
  for (const side of [-1, 1]) {
    b.box(P.headlight.width, P.headlight.height, P.lightDepth, K.light, side * hw * P.headlight.sideShare, lampY, front);
    b.box(P.taillight.width, P.taillight.height, P.lightDepth, K.tail, side * hw * P.taillight.sideShare, tailY, back);
  }
  b.box(B.width * P.grille.widthShare, P.grille.height, P.lightDepth, K.trim, 0, B.ride + (noseTop[1] - B.ride) * P.grille.heightShare, front);
  const bumperY = B.ride + P.bumper.height / 2;
  for (const end of [front, back]) {
    const dir = Math.sign(end);
    const z = end + dir * (P.bumper.out - P.bumper.depth / 2);
    b.box(B.width, P.bumper.height, P.bumper.depth, K.trim, 0, bumperY, z);
    b.box(P.plate.width, P.plate.height, P.plate.depth, K.plate, 0, bumperY, z + dir * (P.bumper.depth / 2 + P.plate.depth / 2));
  }

  // A pickup's open bed: side walls, tailgate and a dark floor.
  if (B.bed) {
    const d = B.bed;
    const wall = P.sill.thick * 2;
    const h = d.rail - d.floor;
    const len = d.front - d.back;
    for (const side of [-1, 1]) b.box(wall, h, len, paint, side * (hw - wall / 2), d.floor + h / 2, (d.front + d.back) / 2);
    b.box(B.width, h, wall, paint, 0, d.floor + h / 2, d.back + wall / 2);
    b.box(B.width - 2 * wall, P.glassThick, len - wall, K.trim, 0, d.floor, (d.front + d.back + wall) / 2);
  }

  // Heads poke up through an open sunroof.
  const seatZ = B.seatZ;
  const roofY = cabinAt(seatZ);
  b.box(cw * P.sunroof.widthShare, P.glassThick, P.sunroof.length, K.trim, 0, roofY, seatZ);

  // Roof parts sit at the back of the roof; behind the heads if there is room.
  const roofPartZ = (depth: number): number => Math.min(roofBack[0] + depth / 2 + P.roofMargin, seatZ - HEAD.radius - P.roofMargin - depth / 2);
  const hasRoofPart = look.parts.some((p) => ROOF_PARTS.includes(p));
  for (const part of look.parts) {
    switch (part) {
      case 'spoiler': {
        // A big wing on posts over the back (Spoiler Alert).
        const c = P.spoiler;
        const z = back + c.back;
        const base = topAt(z);
        const wingY = restAt(z, c.depth / 2) + c.lift;
        const ww = cw * c.widthShare;
        for (const side of [-1, 1]) b.box(c.post, wingY - base, c.post, K.trim, side * ww * c.postSideShare, (base + wingY) / 2, z);
        b.box(ww, c.thick, c.depth, paint, 0, wingY, z);
        for (const side of [-1, 1]) b.box(c.thick, c.plate, c.depth, K.trim, side * (ww / 2), wingY, z);
        break;
      }
      case 'roofSign': {
        const c = P.roofSign;
        const z = roofPartZ(c.depth);
        const y = cabinAt(z);
        b.box(cw * c.widthShare, c.height, c.depth, K.signYellow, 0, y + c.height / 2, z);
        b.box(cw * c.widthShare * c.stripeOut, c.stripe, c.depth * c.stripeOut, K.trim, 0, y + c.height / 2, z);
        break;
      }
      case 'roofBox': {
        const c = P.roofBox;
        const z = roofPartZ(c.length);
        const roofLen = roofFront[0] - roofBack[0];
        const y = cabinAt(z);
        for (const side of [-1, 1]) b.box(c.rail, c.rail, roofLen, K.metal, side * cw * c.railSideShare, roofBack[1] + c.rail / 2, (roofFront[0] + roofBack[0]) / 2);
        b.box(cw * c.widthShare, c.height, c.length, K.trim, 0, y + c.rail + c.height / 2, z);
        break;
      }
      case 'dish': {
        const c = P.dish;
        const x = cw * c.sideShare;
        const z = roofPartZ(c.radius * 2);
        const y = cabinAt(z);
        b.cyl(c.post, c.postHeight, K.trim, x, y + c.postHeight / 2, z);
        b.add(new THREE.CylinderGeometry(c.radius, c.rim, c.thick, K.roundSegments), K.metal, x, y + c.postHeight + c.thick, z, c.tilt);
        break;
      }
      case 'ladder': {
        const c = P.ladder;
        const x = cw * c.sideShare;
        const len = (roofFront[0] - roofBack[0]) * c.lengthShare;
        const z = (roofFront[0] + roofBack[0]) / 2;
        const y = roofBack[1] + c.rail;
        for (const side of [-1, 1]) b.box(c.rail, c.rail, len, K.metal, x + side * c.gap, y, z);
        for (let i = 0; i < c.rungs; i++) b.box(c.rungWidth, c.rail * c.rungShare, c.rail * c.rungShare, K.metal, x, y, z - len / 2 + (len * (i + 0.5)) / c.rungs);
        break;
      }
      case 'speakers': {
        // A speaker stack behind the cabin (in a pickup's bed), cones facing back (Bass Drop).
        const c = P.speakers;
        const z = rearBase[0] - c.behindCabin;
        const y = bodyAt(z);
        for (const side of [-1, 1]) {
          b.box(c.width, c.height, c.depth, K.trim, side * hw * c.sideShare, y + c.height / 2, z);
          b.cyl(c.cone, P.lightDepth, K.metal, side * hw * c.sideShare, y + c.height / 2, z - c.depth / 2, 'z');
        }
        break;
      }
      case 'hoodScoop': {
        const c = P.hoodScoop;
        const z = front + (shield[0][0] - front) * c.at;
        b.box(B.width * c.widthShare, c.height, c.length, K.trim, 0, restAt(z, c.length / 2) + c.height / 2 - P.glassThick, z);
        break;
      }
      case 'spareWheel': {
        // A spare wheel on the tailgate (SUV).
        const c = P.spareWheel;
        const r = wheelRadius * c.share;
        const y = Math.max(B.ride + r, (B.ride + tailTop[1]) / 2);
        b.cyl(r, c.thick, PALETTE.tire, 0, y, back - c.thick / 2, 'z');
        b.cyl(r * K.rimShare, c.thick + P.glassThick, K.rim, 0, y, back - c.thick / 2, 'z');
        break;
      }
      case 'stripes': {
        // Two racing stripes over the hood, roof and deck (not over the glass).
        const c = P.stripes;
        const pieces: (readonly [SidePoint, SidePoint])[] = [
          ...topSegments(top, shield[0][0], Infinity),
          ...topSegments(top, -Infinity, rearBase[0]),
          ...cabin.slice(1, -2).map((p, i) => [p, cabin[i + 2]!] as const),
        ];
        for (const [p, q] of pieces) {
          const e = alongEdge(p, q);
          for (const side of [-1, 1]) b.box(c.width, c.thick, e.length, K.stripe, side * (c.gap / 2 + c.width / 2), e.y + c.thick / 2, e.z, e.tilt);
        }
        break;
      }
    }
  }

  // The number: on the roof behind the heads if it fits there, else on the hood.
  const n = K.numberSize;
  const roofRoom = seatZ - HEAD.radius - P.roofMargin - (roofBack[0] + P.roofMargin);
  const onRoof = !hasRoofPart && roofRoom >= n;
  const numberZ = onRoof ? (seatZ - HEAD.radius + roofBack[0]) / 2 : front + (shield[0][0] - front) * P.numberHoodAt;
  const numberY = restAt(numberZ, n / 2) + K.numberLift;

  return {
    body: b.build(),
    wheelRadius,
    wheelWidth: K.wheelWidth,
    wheelBase: B.wheelBase,
    wheelTrack: hw - K.wheelWidth / 2,
    headY: roofY + HEAD.radius * K.headAboveRoof,
    seatZ,
    numberY,
    numberZ,
    length: front - back,
    width: B.width,
  };
}

/** Triangles in a geometry (for the per-car budget). */
export function triangles(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}
