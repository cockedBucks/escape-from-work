/**
 * Countdown sounds follow the HUD's countdown text: a beep each time the number changes
 * (3, 2, 1) and "go" when it turns into the start banner. Pure, for tests.
 */
export function countdownCue(prev: string | null, now: string | null): 'beep' | 'go' | null {
  if (now === null || now === prev) return null;
  return /^\d+$/.test(now) ? 'beep' : 'go';
}
