import type { Room } from '@colyseus/sdk';

/**
 * Resolve once the room's synced state satisfies `check`. Event-driven (no sleeps):
 * checks now, then on every state patch, and fails with `label` after `timeoutMs`.
 * Note: `join()` can resolve before the first full state arrives, so `check` must cope
 * with fields that are still missing (use `?.`).
 */
export function waitForState<S>(
  room: Room<unknown, S>,
  check: (state: S) => boolean,
  label: string,
  timeoutMs = 5_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const current = room.state as S | undefined;
    if (current !== undefined && check(current)) {
      resolve();
      return;
    }
    const listener = (state: S): void => {
      if (!check(state)) return;
      clearTimeout(timer);
      room.onStateChange.remove(listener);
      resolve();
    };
    const timer = setTimeout(() => {
      room.onStateChange.remove(listener);
      reject(new Error(`timed out after ${timeoutMs} ms waiting for: ${label}`));
    }, timeoutMs);
    room.onStateChange(listener);
  });
}
