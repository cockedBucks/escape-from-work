/**
 * Pointer Lock mouse look for the cockpit cam: click the game to capture the mouse, move to
 * look around, Esc (browser default) to let it go. Only active while `enabled()` is true.
 */
export class MouseLook {
  constructor(
    private readonly target: HTMLElement,
    private readonly enabled: () => boolean,
    private readonly onMove: (dx: number, dy: number) => void,
  ) {
    target.addEventListener('click', this.onClick);
    document.addEventListener('mousemove', this.onMouse);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.target;
  }

  private readonly onClick = (): void => {
    if (this.enabled() && !this.locked) {
      // Some browsers return a promise that rejects when the page has no focus; harmless.
      void Promise.resolve(this.target.requestPointerLock()).catch(() => {});
    }
  };

  private readonly onMouse = (e: MouseEvent): void => {
    if (this.locked && this.enabled()) this.onMove(e.movementX, e.movementY);
  };

  /** Give the mouse back (e.g. when switching to the chase cam). */
  release(): void {
    if (this.locked) document.exitPointerLock();
  }

  dispose(): void {
    this.release();
    this.target.removeEventListener('click', this.onClick);
    document.removeEventListener('mousemove', this.onMouse);
  }
}
