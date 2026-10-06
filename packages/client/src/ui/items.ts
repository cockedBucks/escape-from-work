// Display names of the chaos items (GAME_DESIGN §7): IT jokes.
import type { ItemId } from '@escape/shared';

export const ITEM_NAMES: Readonly<Record<ItemId, string>> = {
  replyAll: 'Reply-All',
  firewall: 'Firewall',
  coffeeSpill: 'Coffee Spill',
  ctrlZ: 'Ctrl+Z',
  blueScreen: 'Blue Screen',
  lagSpike: 'Lag Spike',
  controlSwap: 'Control Swap',
  forcedUpdate: 'Forced Update',
};

/** Name of an item id as synced ('' or unknown ids show as they are). */
export const itemName = (id: string): string => ITEM_NAMES[id as ItemId] ?? id;
