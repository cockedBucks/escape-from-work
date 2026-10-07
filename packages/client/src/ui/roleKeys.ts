// What each role does and which keys it has (GAME_DESIGN §4): one source for the role
// badge, the swap-lane flash and the lobby how-to cards. Functions, not constants: the text
// is in the page's language (P11.4), picked after the modules load.
import { t } from '../i18n';

export interface RoleText {
  title: string;
  /** One short line of keys (badge, flash). */
  keys: string;
}

const ROLES = ['pilot', 'engineer', 'solo'] as const;

export const roleText = (role: string): RoleText =>
  (ROLES as readonly string[]).includes(role)
    ? { title: t(`role.${role as (typeof ROLES)[number]}`), keys: t(`role.${role as (typeof ROLES)[number]}.keys`) }
    : { title: t('role.watching'), keys: t('role.watching.keys') };

/** A how-to-play card in the lobby: what the role does and its keys. */
export interface HowToCard {
  role: 'pilot' | 'engineer' | 'solo';
  title: string;
  job: string;
  /** [keys, what they do] */
  keys: readonly (readonly [string, string])[];
}

export function howToCards(): readonly HowToCard[] {
  return [
    {
      role: 'pilot',
      title: t('role.pilot'),
      job: t('howto.pilot.job'),
      keys: [['A / D', t('howto.steer')], ['C', t('howto.cockpit')], ['H', t('howto.honk')], ['R', t('howto.respawn')]],
    },
    {
      role: 'engineer',
      title: t('role.engineer'),
      job: t('howto.engineer.job'),
      keys: [['W', t('howto.gas')], ['S', t('howto.brakeDrift')], ['Shift', t('howto.nitroHeat')], ['H', t('howto.honk')]],
    },
    {
      role: 'solo',
      title: t('role.solo'),
      job: t('howto.solo.job'),
      keys: [['W / S', t('howto.gasBrake')], ['A / D', t('howto.steer')], [t('howto.tapS'), t('howto.whileTurning')], ['Shift', t('howto.nitro')], ['Space', t('howto.item')]],
    },
  ];
}

/** The duo loop in one line (GAME_DESIGN §5). */
export const teamTip = (): string => t('howto.tip');

/** Your role after a swap lane: Pilot and Engineer trade; solo stays solo. */
export const swappedRole = (role: string): string => (role === 'pilot' ? 'engineer' : role === 'engineer' ? 'pilot' : role);

/** The key help page (P8.2): every key, grouped. Keys by physical position (any layout). */
export function keyHelp(): readonly { title: string; keys: readonly (readonly [string, string])[] }[] {
  return [
    {
      title: t('keys.pilot'),
      keys: [[t('keys.steerKeys'), t('howto.steer')], [t('keys.driftCombo'), t('keys.driftFills')], [t('keys.qHold'), t('keys.aimBack')]],
    },
    {
      title: t('keys.engineer'),
      keys: [[t('keys.gasKeys'), t('howto.gas')], [t('keys.brakeKeys'), t('keys.brakeReverse')], ['Shift', t('howto.nitroHeat')], ['Space', t('keys.useItem')]],
    },
    {
      title: t('keys.everyone'),
      keys: [
        ['H', t('howto.honk')],
        ['R', t('keys.respawnCheckpoint')],
        ['C', t('keys.camera')],
        [t('keys.tabHold'), t('keys.scoreboard')],
        ['Esc', t('keys.lobby')],
        ['?', t('keys.thisHelp')],
        ['F3', t('keys.fps')],
        [t('keys.anyKey'), t('keys.mash')],
      ],
    },
    {
      title: t('keys.solo'),
      keys: [['W A S D + Shift + Space + Q', t('keys.all')]],
    },
  ];
}
