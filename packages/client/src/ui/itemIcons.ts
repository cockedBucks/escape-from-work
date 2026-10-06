// Item icons for the HUD, drawn in code as small inline SVGs (no image files, no emoji fonts).
import type { ItemId } from '@escape/shared';

const svg = (body: string): string =>
  `<svg class="item-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${body}</svg>`;

const ICONS: Readonly<Record<ItemId, string>> = {
  // An envelope.
  replyAll: svg('<rect x="2" y="5" width="20" height="14" rx="2" fill="#fff" stroke="#1e2230" stroke-width="1.6"/><path d="M2.8 6 12 13 21.2 6" fill="none" stroke="#e63946" stroke-width="1.8"/>'),
  // A shield.
  firewall: svg('<path d="M12 2 20 5v6c0 5-3.6 9-8 11-4.4-2-8-6-8-11V5z" fill="#2a9d8f" stroke="#1e2230" stroke-width="1.4"/><path d="M8 12h8M12 8v8" stroke="#fff" stroke-width="1.8"/>'),
  // A coffee cup with a spill.
  coffeeSpill: svg('<path d="M5 6h11v7a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" fill="#fff" stroke="#1e2230" stroke-width="1.4"/><path d="M16 8h2a2 2 0 0 1 0 4h-2" fill="none" stroke="#1e2230" stroke-width="1.4"/><ellipse cx="12" cy="21" rx="9" ry="2" fill="#6f4e37"/>'),
  // An undo arrow.
  ctrlZ: svg('<path d="M9 5 4 10l5 5" fill="none" stroke="#1d7fe0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 10h9a6 6 0 0 1 0 12h-3" fill="none" stroke="#1d7fe0" stroke-width="2.4" stroke-linecap="round"/>'),
  // A blue screen with a sad face.
  blueScreen: svg('<rect x="2" y="3" width="20" height="15" rx="1.5" fill="#1068c4"/><path d="M9 8v1M15 8v1" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M8.5 14q3.5-3 7 0" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M9 21h6" stroke="#1e2230" stroke-width="2"/>'),
  // Signal bars with a spike.
  lagSpike: svg('<path d="M4 20v-3M9 20v-6M14 20v-9M19 20V5" stroke="#1e2230" stroke-width="2.6" stroke-linecap="round"/><path d="M3 9 7 4l3 6 4-8" fill="none" stroke="#fb8500" stroke-width="2" stroke-linejoin="round"/>'),
  // Two arrows trading places.
  controlSwap: svg('<path d="M4 8h14l-3-3M20 16H6l3 3" fill="none" stroke="#9b5de5" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  // A download arrow over a progress bar.
  forcedUpdate: svg('<path d="M12 3v10M8 9l4 4 4-4" fill="none" stroke="#06d6a0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="3" y="17" width="18" height="4" rx="2" fill="#3d4a5c"/><rect x="3" y="17" width="8" height="4" rx="2" fill="#06d6a0"/>'),
};

/** The icon for an item id ('' or unknown = no icon). */
export const itemIcon = (id: string): string => ICONS[id as ItemId] ?? '';
