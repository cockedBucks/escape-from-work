// Client entry. P0: title + live player count. Screens and the router come later.
import '@fontsource/fredoka/600.css';
import './style.css';
import { GAME_TITLE } from '@escape/shared';
import { joinRace } from './net/connection';

function el(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing #${id} in index.html`);
  return found;
}

const countEl = el('player-count');
const labelEl = el('player-label');
const statusEl = el('status');

function setStatus(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

document.title = GAME_TITLE;
el('title').textContent = GAME_TITLE;

try {
  const room = await joinRace();
  setStatus('Connected');
  room.onStateChange((state) => {
    const n = state.players.size;
    countEl.textContent = String(n);
    labelEl.textContent = n === 1 ? 'player' : 'players';
  });
  room.onLeave(() => setStatus('Disconnected from the game server. Reload to rejoin.', true));
} catch (err) {
  console.error(err);
  setStatus(`Can't reach the game server at ${window.location.hostname}. Is it running? Reload to retry.`, true);
}
