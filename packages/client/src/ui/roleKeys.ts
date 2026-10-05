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

/** A how-to-play card in the lobby: what the role does and its keys. */
export interface HowToCard {
  role: 'pilot' | 'engineer' | 'solo';
  title: string;
  job: string;
  /** [keys, what they do] */
  keys: readonly (readonly [string, string])[];
}

export const HOW_TO_CARDS: readonly HowToCard[] = [
  {
    role: 'pilot',
    title: 'PILOT',
    job: 'You steer. Turn hard into a corner and shout “DRIFT!”.',
    keys: [['A / D', 'steer'], ['C', 'cockpit view, mouse to look'], ['H', 'honk'], ['R', 'respawn']],
  },
  {
    role: 'engineer',
    title: 'ENGINEER',
    job: 'You run the pedals and the engine. Don’t let it overheat!',
    keys: [['W', 'gas'], ['S', 'brake · tap while turning = DRIFT'], ['Shift', 'nitro (heats the engine)'], ['H', 'honk']],
  },
  {
    role: 'solo',
    title: 'SOLO',
    job: 'All the controls, all by yourself. Harder: find a teammate!',
    keys: [['W / S', 'gas / brake'], ['A / D', 'steer'], ['tap S', 'while turning = DRIFT'], ['Shift', 'nitro']],
  },
];

/** The duo loop in one line (GAME_DESIGN §5). */
export const TEAM_TIP = 'Drift → fills NITRO → nitro heats the ENGINE → the purple SWAP lane trades seats and cools it.';

/** Your role after a swap lane: Pilot and Engineer trade; solo stays solo. */
export const swappedRole = (role: string): string => (role === 'pilot' ? 'engineer' : role === 'engineer' ? 'pilot' : role);
