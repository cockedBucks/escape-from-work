// C switches chase ↔ cockpit; the choice is remembered in this browser (GAME_DESIGN §4).

export type CameraMode = 'chase' | 'cockpit';

const KEY = 'efw.camera';

export function loadCameraMode(): CameraMode {
  try {
    return window.localStorage.getItem(KEY) === 'cockpit' ? 'cockpit' : 'chase';
  } catch {
    return 'chase';
  }
}

function saveCameraMode(mode: CameraMode): void {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // Blocked storage: the choice just is not remembered.
  }
}

export const toggled = (mode: CameraMode): CameraMode => (mode === 'chase' ? 'cockpit' : 'chase');

/** Listens for C (physical key) and reports the new mode; ignores typing in text fields. */
export class CameraToggle {
  mode: CameraMode = loadCameraMode();

  constructor(private readonly onChange: (mode: CameraMode) => void) {
    window.addEventListener('keydown', this.onKey);
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyC' || e.repeat || e.target instanceof HTMLInputElement) return;
    this.mode = toggled(this.mode);
    saveCameraMode(this.mode);
    this.onChange(this.mode);
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
  }
}
