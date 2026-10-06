// Dev-only F2 tuning panel (lil-gui). Loaded with a dynamic import so production builds
// never include it. Edits go live at once through the server; Save writes config/tuning.json.
import GUI, { type Controller } from 'lil-gui';
import { getTuningValue, tuningFields, type Tuning } from '@escape/shared';

/** Sections that need a restart or a rebuild to change, so the panel leaves them out. */
const SKIP = ['sim', 'track', 'quality', 'league', 'net.port'];
/** Wait this long after the last slider move before sending (ms). */
const SEND_DELAY_MS = 120;
/** Ignore the server's echo for this long after a local edit, so a dragged slider never jumps (ms). */
const ECHO_GUARD_MS = 600;
/** Slider range for numbers whose schema has no upper limit: this many times the current value. */
const OPEN_RANGE_FACTOR = 3;

const skipped = (path: string[]): boolean => SKIP.some((s) => path.join('.') === s || path.join('.').startsWith(`${s}.`));

async function post(route: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(route, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? '{}' : JSON.stringify(body),
    });
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data.error ?? `HTTP ${res.status}`;
  } catch (err) {
    return String(err);
  }
}

export class TuningPanel {
  private readonly gui = new GUI({ title: 'Tuning (F2)' });
  private readonly working: Tuning;
  private readonly controllers: Controller[] = [];
  private sendTimer = 0;
  private lastLocalEdit = -Infinity;
  private readonly status = { text: 'live — not saved' };
  private readonly statusCtl: Controller;

  constructor(initial: Tuning, private readonly onLocalChange: (t: Tuning) => void) {
    this.working = structuredClone(initial);
    this.gui.hide();
    const folders = new Map<string, GUI>();
    for (const field of tuningFields()) {
      if (skipped(field.path)) continue;
      const key = field.path.at(-1)!;
      const parentPath = field.path.slice(0, -1);
      const folderName = parentPath.join('.');
      let folder = folders.get(folderName);
      if (!folder) {
        folder = this.gui.addFolder(folderName);
        folder.close();
        folders.set(folderName, folder);
      }
      const holder = getTuningValue(this.working, parentPath) as Record<string, number>;
      const value = holder[key] ?? 0;
      const min = field.min ?? 0;
      const max = field.max ?? Math.max(value * OPEN_RANGE_FACTOR, min + 1);
      const c = folder.add(holder, key, min, max, field.integer ? 1 : undefined);
      c.onChange(() => this.changed());
      this.controllers.push(c);
    }
    this.statusCtl = this.gui.add(this.status, 'text').name('status').disable();
    this.gui.add({ save: () => void this.save() }, 'save').name('💾 Save to tuning.json');
    this.gui.add({ revert: () => void this.revert() }, 'revert').name('↩ Revert to file');
    window.addEventListener('keydown', this.onKey);
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'F2') return;
    e.preventDefault();
    this.gui.show(this.gui._hidden);
  };

  private setStatus(text: string): void {
    this.status.text = text;
    this.statusCtl.updateDisplay();
  }

  private changed(): void {
    this.lastLocalEdit = performance.now();
    this.onLocalChange(this.working);
    window.clearTimeout(this.sendTimer);
    this.sendTimer = window.setTimeout(() => {
      void post('/dev/tuning', { tuning: this.working, save: false }).then((err) =>
        this.setStatus(err ? `refused: ${err.split('\n')[1] ?? err}` : 'live — not saved'),
      );
    }, SEND_DELAY_MS);
  }

  private async save(): Promise<void> {
    window.clearTimeout(this.sendTimer);
    const err = await post('/dev/tuning', { tuning: this.working, save: true });
    this.setStatus(err ? `save failed: ${err.split('\n')[1] ?? err}` : 'saved ✔');
  }

  private async revert(): Promise<void> {
    window.clearTimeout(this.sendTimer);
    this.lastLocalEdit = -Infinity;
    const err = await post('/dev/tuning/revert');
    this.setStatus(err ? `revert failed: ${err}` : 'reverted to file');
  }

  /** The server sent tuning (on join, after any change, or a file edit): show it. */
  serverTuning(t: Tuning): void {
    // Sections the panel does not show always follow the server, so Save never writes back
    // stale copies of them (e.g. after a hand edit of tuning.json).
    this.working.sim = structuredClone(t.sim);
    this.working.track = structuredClone(t.track);
    this.working.quality = structuredClone(t.quality);
    this.working.net.port = t.net.port;
    if (performance.now() - this.lastLocalEdit < ECHO_GUARD_MS) return;
    for (const field of tuningFields()) {
      if (skipped(field.path)) continue;
      const holder = getTuningValue(this.working, field.path.slice(0, -1)) as Record<string, number>;
      const v = getTuningValue(t, field.path);
      if (typeof v === 'number') holder[field.path.at(-1)!] = v;
    }
    for (const c of this.controllers) c.updateDisplay();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.gui.destroy();
  }
}
