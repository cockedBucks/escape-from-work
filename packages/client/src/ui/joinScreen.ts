// Temporary join screen (P2.1): name, car slot, seat. The real lobby replaces it in P8.
import { NAME_MAX_LENGTH, type Seat } from '@escape/shared';
import { TEAM_COLORS } from '../render/look';

/** One player as the join screen needs it. */
export interface JoinPlayer {
  id: string;
  name: string;
  slot: number;
  seat: string;
  connected: boolean;
}

export interface JoinScreenHandlers {
  setName(name: string): void;
  setSeat(slot: number, seat: Seat): void;
  leaveSeat(): void;
}

const NAME_KEY = 'efw.name';

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}

/** Remembered name from last time (localStorage may be blocked: then nothing). */
export function savedName(): string | null {
  try {
    return window.localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

function saveName(name: string): void {
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    // Private mode or blocked storage: the name just is not remembered.
  }
}

/**
 * Pick a name and a seat. Shows who sits where; taken seats are disabled. Opens on join,
 * closes once you sit down, and Esc opens it again to switch seats.
 */
export class JoinScreen {
  private readonly root = document.createElement('div');
  private readonly cards = document.createElement('div');
  private readonly error = document.createElement('p');
  private readonly nameInput = document.createElement('input');
  private players: JoinPlayer[] = [];
  private myId = '';

  constructor(
    parent: HTMLElement,
    private readonly maxCars: number,
    private readonly handlers: JoinScreenHandlers,
  ) {
    this.root.className = 'join';
    const panel = document.createElement('div');
    panel.className = 'join-panel';
    const title = document.createElement('h2');
    title.textContent = 'Pick a car and a seat';
    const nameRow = document.createElement('label');
    nameRow.className = 'join-name';
    nameRow.textContent = 'Your name ';
    this.nameInput.maxLength = NAME_MAX_LENGTH;
    this.nameInput.placeholder = 'Name';
    this.nameInput.addEventListener('change', () => this.commitName());
    nameRow.appendChild(this.nameInput);
    this.cards.className = 'join-cards';
    this.cards.addEventListener('click', this.onClick);
    this.error.className = 'join-error';
    const help = document.createElement('p');
    help.className = 'join-help';
    help.textContent = 'Pilot steers (A/D). Engineer drives the pedals (W/S). Alone in a car you do both. Esc reopens this screen.';
    panel.append(title, nameRow, this.cards, this.error, help);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    window.addEventListener('keydown', this.onKey);

    const remembered = savedName();
    if (remembered) {
      this.nameInput.value = remembered;
      this.commitName();
    }
  }

  private commitName(): void {
    const name = this.nameInput.value.trim().slice(0, NAME_MAX_LENGTH);
    if (!name) return;
    saveName(name);
    this.handlers.setName(name);
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') this.show(!this.visible);
  };

  private readonly onClick = (e: MouseEvent): void => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn || btn.disabled) return;
    this.error.textContent = '';
    if (btn.dataset['action'] === 'watch') {
      this.handlers.leaveSeat();
      return;
    }
    this.commitName();
    this.handlers.setSeat(Number(btn.dataset['slot']), btn.dataset['seat'] as Seat);
  };

  show(visible: boolean): void {
    this.root.hidden = !visible;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  showError(reason: string): void {
    this.error.textContent = `Can't sit there: ${reason}.`;
  }

  /** Redraw with the latest players. Closes itself the moment you sit down. */
  update(players: JoinPlayer[], myId: string): void {
    const me = players.find((p) => p.id === myId);
    const wasSeated = this.players.find((p) => p.id === this.myId)?.slot ?? -1;
    this.players = players;
    this.myId = myId;
    if (me && document.activeElement !== this.nameInput && !this.nameInput.value) this.nameInput.value = me.name;
    if (me && me.slot >= 0 && wasSeated !== me.slot) this.show(false);
    this.render();
  }

  private render(): void {
    const html: string[] = [];
    for (let slot = 0; slot < this.maxCars; slot++) {
      const inCar = this.players.filter((p) => p.slot === slot && p.seat !== '');
      const solo = inCar.find((p) => p.seat === 'solo');
      const seatBtn = (seat: Seat, label: string): string => {
        const who = seat === 'solo' ? solo : inCar.find((p) => p.seat === seat) ?? solo;
        const mine = who?.id === this.myId;
        const taken = who !== undefined && !mine;
        const blocked = seat === 'solo' && inCar.some((p) => p.id !== this.myId);
        const text = who ? `${escapeHtml(who.name)}${who.connected ? '' : ' (away)'}` : 'free';
        return `<button class="seat${mine ? ' mine' : ''}" data-slot="${slot}" data-seat="${seat}" ${taken || blocked ? 'disabled' : ''}>
          <span class="seat-role">${label}</span><span class="seat-who">${text}</span></button>`;
      };
      html.push(`<div class="join-card" style="--team:${hex(TEAM_COLORS[slot % TEAM_COLORS.length]!)}">
        <div class="join-card-head">Car ${slot + 1}</div>
        ${seatBtn('pilot', 'Pilot')}${seatBtn('engineer', 'Engineer')}${seatBtn('solo', 'Solo')}
      </div>`);
    }
    const me = this.players.find((p) => p.id === this.myId);
    if (me && me.slot >= 0) html.push('<button class="watch" data-action="watch">Leave my seat and watch</button>');
    this.cards.innerHTML = html.join('');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
