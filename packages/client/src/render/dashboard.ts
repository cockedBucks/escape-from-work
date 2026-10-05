import * as THREE from 'three';
import { gaugeText, type GaugeValues } from '../ui/gauges';
import { BOX_CAR, COCKPIT, DASH_SCREEN } from './look';

/** Redraw the dashboard screen at most this often (ms): text, not animation. */
const REDRAW_MS = 100;

/**
 * The cockpit dashboard screen: speed, lap, place, heat and nitro bars, item slot, drawn
 * on a small canvas and shown as a tilted panel on your car's dashboard. One draw call,
 * only for your own car in the cockpit cam.
 */
export class DashboardScreen {
  readonly mesh: THREE.Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private last = '';
  private lastDraw = -Infinity;

  constructor() {
    this.canvas.width = DASH_SCREEN.pixelsWide;
    this.canvas.height = DASH_SCREEN.pixelsWide / 4;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not available');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(DASH_SCREEN.width, DASH_SCREEN.width / 4);
    // Lean back toward the driver, sit on top of the dashboard block.
    geo.rotateX(-DASH_SCREEN.tilt);
    geo.rotateY(Math.PI); // face the driver (who looks toward +Z)
    geo.translate(0, BOX_CAR.ride + BOX_CAR.bodyHeight + COCKPIT.dashHeight + DASH_SCREEN.raise, COCKPIT.dashForward - COCKPIT.dashDepth * 0.6);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.texture }));
  }

  /** Redraw when the shown values changed (and at most every REDRAW_MS). */
  update(now: number, v: GaugeValues): void {
    if (now - this.lastDraw < REDRAW_MS) return;
    const t = gaugeText(v);
    const key = JSON.stringify(t);
    if (key === this.last) return;
    this.last = key;
    this.lastDraw = now;
    const { ctx } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.fillStyle = '#1e2230';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    // Columns (fractions of the width): speed ..0.25 | km/h 0.26 | lap/place 0.38 | bars 0.6–0.77 | item 0.81
    ctx.font = `600 ${H * 0.58}px Fredoka, system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(t.speed, W * 0.25, H * 0.48);
    ctx.font = `600 ${H * 0.18}px Fredoka, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('km/h', W * 0.26, H * 0.72);
    ctx.fillText(t.lap, W * 0.38, H * 0.32);
    ctx.fillText(t.place, W * 0.38, H * 0.7);
    const bar = (label: string, x: number, y: number, fill: number, color: string): void => {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x, y - H * 0.13);
      ctx.fillStyle = '#3d4a5c';
      ctx.fillRect(x, y, W * 0.17, H * 0.12);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, W * 0.17 * Math.max(0, Math.min(1, fill)), H * 0.12);
    };
    bar(t.heatLabel, W * 0.6, H * 0.32, t.heat, '#e63946');
    bar('NITRO', W * 0.6, H * 0.7, t.nitro, '#1d7fe0');
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = H * 0.04;
    ctx.strokeRect(W * 0.81, H * 0.18, H * 0.64, H * 0.64);
    ctx.textAlign = 'center';
    ctx.fillText(t.item, W * 0.81 + H * 0.32, H * 0.5);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
