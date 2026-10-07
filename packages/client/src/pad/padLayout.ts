// Phone controller (P11.5): which touch buttons each role gets (GAME_DESIGN §4, same split as
// the keyboard). Pure, so it is tested; the screen draws whatever this returns.
import type { Action } from '../input/keyboard';
import type { StringKey } from '../i18n';

/** Where a button sits: the big thumb zones on the left and right, or the small middle row. */
export type PadZone = 'left' | 'right' | 'middle';

export interface PadButton {
  action: Action;
  /** Text on the button (a string key) or a symbol shown as is. */
  label: StringKey | '◀' | '▶';
  zone: PadZone;
}

const B = (action: Action, label: PadButton['label'], zone: PadZone): PadButton => ({ action, label, zone });

/** The buttons for a role as synced ('pilot' | 'engineer' | 'solo'); none when not in a car. */
export function padButtons(role: string): PadButton[] {
  // Pilot (P13.2): both arrows under the left thumb, the big DRIFT button under the right one.
  if (role === 'pilot') {
    return [B('left', '◀', 'left'), B('right', '▶', 'left'), B('aimBack', 'pad.aimBack', 'middle'), B('honk', 'pad.honk', 'middle'), B('respawn', 'pad.respawn', 'middle'), B('space', 'pad.drift', 'right')];
  }
  if (role === 'engineer') {
    return [B('brake', 'pad.brake', 'left'), B('nitro', 'pad.nitro', 'middle'), B('item', 'pad.item', 'middle'), B('honk', 'pad.honk', 'middle'), B('respawn', 'pad.respawn', 'middle'), B('gas', 'pad.gas', 'right')];
  }
  if (role === 'solo') {
    return [
      B('left', '◀', 'left'), B('right', '▶', 'left'),
      B('space', 'pad.drift', 'middle'), B('nitro', 'pad.nitro', 'middle'), B('item', 'pad.item', 'middle'), B('aimBack', 'pad.aimBack', 'middle'), B('honk', 'pad.honk', 'middle'), B('respawn', 'pad.respawn', 'middle'),
      B('brake', 'pad.brake', 'right'), B('gas', 'pad.gas', 'right'),
    ];
  }
  return [];
}
