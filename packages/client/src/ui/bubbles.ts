import * as THREE from 'three';

/** How long a speech bubble stays up (ms), and how high above the car it floats (m). */
const BUBBLE_MS = 900;
const BUBBLE_HEIGHT = 2.7;

/** "HONK!" (and later other shouts) floating over a car, for everyone. DOM over the canvas. */
export class Bubbles {
  private readonly layer = document.createElement('div');
  private readonly active = new Map<string, { el: HTMLDivElement; until: number }>();
  private readonly v = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.layer.className = 'bubbles';
    parent.appendChild(this.layer);
  }

  /** Show `text` over car `carId` from now (replaces a bubble that is still up). */
  say(carId: string, text: string, now: number): void {
    let b = this.active.get(carId);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'bubble';
      this.layer.appendChild(el);
      b = { el, until: 0 };
      this.active.set(carId, b);
    }
    b.el.textContent = text;
    b.el.classList.remove('pop');
    void b.el.offsetWidth; // restart the pop animation
    b.el.classList.add('pop');
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
      b.el.style.transform = `translate(${((this.v.x + 1) / 2) * width}px, ${((1 - this.v.y) / 2) * height}px) translate(-50%, -100%)`;
    }
  }

  dispose(): void {
    this.layer.remove();
    this.active.clear();
  }
}
