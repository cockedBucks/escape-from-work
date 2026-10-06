import * as THREE from 'three';
import type { CarLook, CarPart } from '@escape/shared';
import { Builder } from './kitBuilder';
import { CAR_BODIES, CAR_KIT, CAR_PARTS_LOOK as P, HEAD } from './look';

// The car kit (ART_STYLE §4): a car's whole body — chassis, glass cabin with a painted roof,
// bumpers, lights and its signature parts — is ONE vertex-colored geometry, so it costs one
// draw call. Wheels, the roof number and the shadow are separate (they move or use a texture).
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
  /** Roof-number decal: center and whether it lies on the roof (else on the hood). */
  numberY: number;
  numberZ: number;
  length: number;
  width: number;
}

/** Parts that sit on the roof (behind the heads). */
const ROOF_PARTS: readonly CarPart[] = ['roofSign', 'roofBox', 'dish', 'ladder'];

/** Build a car's body and layout from its look and team paint. */
export function buildCarShape(look: CarLook, paint: number): CarShape {
  const K = CAR_KIT;
  const B = CAR_BODIES[look.body];
  const b = new Builder(CAR_KIT.roundSegments);
  const hw = B.width / 2;
  const bodyTop = B.ride + B.body;
  const cabinTop = bodyTop + B.cabinHeight;
  const roofTop = cabinTop + K.roofThickness;
  const cabinFront = B.cabinZ + B.cabinLength / 2;
  const cabinBack = B.cabinZ - B.cabinLength / 2;

  // Chassis and cabin.
  if (look.body === 'round') {
    b.blob(hw, B.body, B.length / 2, paint, 0, B.ride + B.body * 0.5, 0);
    b.blob(hw * 0.78, B.cabinHeight, B.cabinLength / 2, K.glass, 0, bodyTop - B.body * 0.15, B.cabinZ);
    b.blob(hw * 0.6, K.roofThickness * 2, B.cabinLength * 0.35, paint, 0, cabinTop - B.body * 0.12, B.cabinZ);
  } else {
    b.box(B.width, B.body, B.length, paint, 0, B.ride + B.body / 2, 0);
    b.box(B.width * 0.86, B.cabinHeight, B.cabinLength, K.glass, 0, bodyTop + B.cabinHeight / 2, B.cabinZ);
    b.box(B.width * 0.9, K.roofThickness, B.cabinLength * 1.04, paint, 0, cabinTop + K.roofThickness / 2, B.cabinZ);
  }
  // Bumpers, headlights, taillights.
  const bu = P.bumper;
  for (const end of [-1, 1]) b.box(B.width * bu.widthShare, bu.height, bu.depth, K.trim, 0, B.ride + bu.lift, (end * B.length) / 2);
  const lightY = B.ride + B.body * P.headlight.heightShare;
  const lz = B.length / 2 + P.lightDepth / 6;
  for (const side of [-1, 1]) {
    b.box(P.headlight.width, P.headlight.height, P.lightDepth, K.light, side * hw * P.headlight.sideShare, lightY, lz);
    b.box(P.taillight.width, P.taillight.height, P.lightDepth, K.tail, side * hw * P.taillight.sideShare, lightY, -lz);
  }

  // Heads in the front half of the cabin; roof parts on the back half.
  const seatZ = B.cabinZ + B.cabinLength * P.seatForward;
  const roofPartZ = cabinBack + B.cabinLength * P.roofPartBack;
  const hasRoofPart = look.parts.some((p) => ROOF_PARTS.includes(p));

  for (const part of look.parts) {
    switch (part) {
      case 'spoiler': {
        // Three wings stacked taller than the car (Spoiler Alert).
        const c = P.spoiler;
        const z = -B.length / 2 + c.back;
        const top = roofTop * c.heightOverRoof;
        for (const side of [-1, 1]) b.box(c.post, top - bodyTop, c.post, K.trim, side * hw * c.postSideShare, (bodyTop + top) / 2, z);
        for (let i = 1; i <= 3; i++) b.box(B.width * c.wingWidthShare, c.wingThick, c.wingDepth, paint, 0, bodyTop + ((top - bodyTop) * i) / 3, z);
        break;
      }
      case 'roofSign': {
        const c = P.roofSign;
        b.box(B.width * c.widthShare, c.height, c.depth, K.signYellow, 0, roofTop + c.height / 2, roofPartZ);
        b.box(B.width * c.widthShare * 1.03, c.stripe, c.depth * 1.03, K.trim, 0, roofTop + c.height / 2, roofPartZ);
        break;
      }
      case 'roofBox': {
        const c = P.roofBox;
        b.box(B.width * c.widthShare, c.height, B.cabinLength * c.lengthShare, K.metal, 0, roofTop + c.height / 2, roofPartZ);
        break;
      }
      case 'dish': {
        const c = P.dish;
        const x = hw * c.sideShare;
        b.cyl(c.post, c.postHeight, K.trim, x, roofTop + c.postHeight / 2, roofPartZ);
        b.add(new THREE.CylinderGeometry(c.radius, c.rim, c.thick, K.roundSegments), K.metal, x, roofTop + c.postHeight + c.thick, roofPartZ, c.tilt);
        break;
      }
      case 'ladder': {
        const c = P.ladder;
        const x = hw * c.sideShare;
        for (const side of [-1, 1]) b.box(c.rail, c.rail, B.cabinLength * c.lengthShare, K.metal, x + side * c.gap, roofTop + c.rail, B.cabinZ);
        for (let i = 0; i < c.rungs; i++) b.box(c.rungWidth, c.rail * 0.8, c.rail * 0.8, K.metal, x, roofTop + c.rail, cabinBack + (B.cabinLength * (i + 0.5)) / c.rungs);
        break;
      }
      case 'speakers': {
        // A speaker stack in the pickup bed, cones facing back (Bass Drop).
        const c = P.speakers;
        const z = cabinBack - c.behindCabin;
        for (const side of [-1, 1]) {
          b.box(c.width, c.height, c.depth, K.trim, side * hw * c.sideShare, bodyTop + c.height / 2, z);
          b.cyl(c.cone, P.lightDepth, K.metal, side * hw * c.sideShare, bodyTop + c.height / 2, z - c.depth / 2, 'z');
        }
        break;
      }
      case 'hoodScoop': {
        const c = P.hoodScoop;
        b.box(B.width * c.widthShare, c.height, c.length, K.trim, 0, bodyTop + c.height / 2, (cabinFront + B.length / 2) / 2);
        break;
      }
      case 'windupKey': {
        // A big wind-up key on the back (Bug Report).
        const c = P.windupKey;
        const y = B.ride + B.body * c.heightShare;
        b.cyl(c.shaft, c.shaftLength, K.metal, 0, y, -B.length / 2 - c.shaftLength / 2, 'z');
        b.blob(c.wingWidth, c.wingHeight, c.wingThick, K.metal, 0, y, -B.length / 2 - c.shaftLength);
        break;
      }
    }
  }

  const wheelRadius = K.wheelRadius * look.wheelScale;
  return {
    body: b.build(),
    wheelRadius,
    wheelWidth: K.wheelWidth,
    wheelBase: B.wheelBase,
    wheelTrack: hw - K.wheelWidth * 0.3,
    headY: roofTop + HEAD.radius * K.headAboveRoof,
    seatZ,
    // The roof number lies on the roof behind the heads, or on the hood if a roof part is there.
    numberY: hasRoofPart ? bodyTop + 0.01 : roofTop + 0.01,
    numberZ: hasRoofPart ? (cabinFront + B.length / 2) / 2 : roofPartZ,
    length: B.length,
    width: B.width,
  };
}

/** Triangles in a geometry (for the per-car budget). */
export function triangles(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}
