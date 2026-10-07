import * as THREE from 'three';

/** How long a speech bubble stays up (ms), and how high above the car it floats (m). */
const BUBBLE_MS = 900;
const BUBBLE_HEIGHT = 2.7;
/** It drifts up this far (px) over its life, fades out over the last share of it, and tilts up to ± this (deg). */
const BUBBLE_RISE_PX = 26;
const BUBBLE_FADE_SHARE = 0.3;
const BUBBLE_TILT_DEG = 9;

/** "HONK!" (and later other shouts) floating over a car, for everyone. DOM over the canvas. */
export class Bubbles {
  private readonly layer = document.createElement('div');
  private readonly active = new Map<string, { el: HTMLDivElement; text: HTMLSpanElement; until: number }>();
  private readonly v = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.layer.className = 'bubbles';
    parent.appendChild(this.layer);
  }

  /** Show `text` over car `carId` from now (replaces a bubble that is still up). */
  say(carId: string, text: string, now: number): void {
    let b = this.active.get(carId);
    if (!b) {
      // The outer box is placed over the car (its transform); the inner one pops, tilts and fades.
      const el = document.createElement('div');
      el.className = 'bubble';
      const span = document.createElement('span');
      span.className = 'bubble-text';
      el.appendChild(span);
      this.layer.appendChild(el);
      b = { el, text: span, until: 0 };
      this.active.set(carId, b);
    }
    b.text.textContent = text;
    b.text.style.setProperty('--tilt', `${((Math.random() * 2 - 1) * BUBBLE_TILT_DEG).toFixed(1)}deg`);
    b.text.classList.remove('pop');
    void b.text.offsetWidth; // restart the pop animation
    b.text.classList.add('pop');
    b.until = now + BUBBLE_MS;
  }

  /** Place bubbles over their cars (screen space) and drop finished ones. Call every frame. */
  update(now: number, camera: THREE.Camera, width: number, height: number, carPos: (id: string) => { x: number; y: number; z: number } | undefined): void {
    for (const [id, b] of this.active) {
      const p = carPos(id);
      if (now > b.until || !p) {
        b.el.remove();
        this.active.delete(id);
        continue;
      }
      this.v.set(p.x, p.y + BUBBLE_HEIGHT, p.z).project(camera);
      const behind = this.v.z > 1;
      b.el.style.display = behind ? 'none' : '';
      const left = Math.max(0, (b.until - now) / BUBBLE_MS); // 1 → 0 over its life
      const rise = (1 - left) * BUBBLE_RISE_PX;
      b.el.style.opacity = left < BUBBLE_FADE_SHARE ? (left / BUBBLE_FADE_SHARE).toFixed(2) : '1';
      b.el.style.transform = `translate(${((this.v.x + 1) / 2) * width}px, ${((1 - this.v.y) / 2) * height - rise}px) translate(-50%, -100%)`;
    }
  }

  dispose(): void {
    this.layer.remove();
    this.active.clear();
  }
}
