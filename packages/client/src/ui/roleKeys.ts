// What each role does and which keys it has (GAME_DESIGN §4): one source for the role
// badge, the swap-lane flash and the lobby how-to cards.

export interface RoleText {
  title: string;
  /** One short line of keys (badge, flash). */
  keys: string;
}

export const ROLE_TEXT: Readonly<Record<string, RoleText>> = {
  pilot: { title: 'PILOT', keys: 'A / D steer · steer hard while your partner taps S = DRIFT · H honk · R respawn' },
  engineer: { title: 'ENGINEER', keys: 'W gas · S brake (tap while turning = DRIFT) · Shift nitro · H honk · R respawn' },
  solo: { title: 'SOLO', keys: 'W / S pedals · A / D steer · tap S while turning = DRIFT · Shift nitro · R respawn' },
  '': { title: 'WATCHING', keys: 'pick a seat in the lobby between races (Esc)' },
};

export const roleText = (role: string): RoleText => ROLE_TEXT[role] ?? ROLE_TEXT['']!;

/** Your role after a swap lane: Pilot and Engineer trade; solo stays solo. */
export const swappedRole = (role: string): string => (role === 'pilot' ? 'engineer' : role === 'engineer' ? 'pilot' : role);
