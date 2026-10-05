// Lobby (P3.2): name, teams with slot colors and editable IT-pun names, seats, Ready, host
// controls. DOM over the canvas. Redraws only when what it shows changes, and never while
// you are typing in one of its text fields (live updates must not steal your keystrokes).
import { NAME_MAX_LENGTH, TEAM_NAME_MAX_LENGTH, type RacePhase, type Seat } from '@escape/shared';
import { TEAM_COLORS } from '../render/look';

export interface LobbyPlayer {
  id: string;
  name: string;
  slot: number;
  seat: string;
  connected: boolean;
  ready: boolean;
}

/** Everything the lobby shows. */
export interface LobbyView {
  players: LobbyPlayer[];
  myId: string;
  host: string;
  phase: RacePhase;
  laps: number;
  teams: string[];
  bots: boolean;
}

export interface LobbyHandlers {
  setName(name: string): void;
  setSeat(slot: number, seat: Seat): void;
  leaveSeat(): void;
  setTeamName(slot: number, name: string): void;
  setReady(ready: boolean): void;
  start(): void;
  setLaps(laps: number): void;
  shuffle(): void;
  setBots(on: boolean): void;
}

export interface LobbyLimits {
  maxCars: number;
  minLaps: number;
  maxLaps: number;
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

/** The HTML of the team cards and host controls (pure, so it can be compared and tested). */
export function lobbyHtml(v: LobbyView, limits: LobbyLimits): string {
  const me = v.players.find((p) => p.id === v.myId);
  const iAmHost = v.host === v.myId;
  const html: string[] = ['<div class="join-cards">'];
  for (let slot = 0; slot < limits.maxCars; slot++) {
    const inCar = v.players.filter((p) => p.slot === slot && p.seat !== '');
    const solo = inCar.find((p) => p.seat === 'solo');
    const mineCar = me?.slot === slot;
    const team = escapeHtml(v.teams[slot] ?? `Team ${slot + 1}`);
    const seatBtn = (seat: Seat, label: string): string => {
      const who = seat === 'solo' ? solo : inCar.find((p) => p.seat === seat) ?? solo;
      const mine = who?.id === v.myId;
      const taken = who !== undefined && !mine;
      const blocked = seat === 'solo' && inCar.some((p) => p.id !== v.myId);
      const name = who ? `${who.ready ? '✓ ' : ''}${escapeHtml(who.name)}${who.connected ? '' : ' (away)'}` : 'free';
      return `<button class="seat${mine ? ' mine' : ''}" data-slot="${slot}" data-seat="${seat}" ${taken || blocked ? 'disabled' : ''}>
        <span class="seat-role">${label}</span><span class="seat-who">${name}</span></button>`;
    };
    const head = mineCar || iAmHost
      ? `<input class="team-name" data-slot="${slot}" maxlength="${TEAM_NAME_MAX_LENGTH}" value="${team}" aria-label="Team name">`
      : `<div class="team-name">${team}</div>`;
    html.push(`<div class="join-card${mineCar ? ' my-team' : ''}" style="--team:${hex(TEAM_COLORS[slot % TEAM_COLORS.length]!)}">
      <div class="join-card-head">Car ${slot + 1}</div>${head}
      ${seatBtn('pilot', 'Pilot')}${seatBtn('engineer', 'Engineer')}${seatBtn('solo', 'Solo')}
    </div>`);
  }
  html.push('</div>');

  const ready = me?.ready ?? false;
  const seated = me !== undefined && me.slot >= 0;
  html.push('<div class="lobby-actions">');
  if (seated) {
    html.push(`<button class="big ready${ready ? ' on' : ''}" data-action="ready">${ready ? '✓ Ready' : 'Ready?'}</button>`);
    html.push('<button class="watch" data-action="watch">Leave my seat and watch</button>');
  }
  if (iAmHost) {
    html.push(`<div class="host-controls"><span class="host-badge">HOST</span>
      <span class="laps">Laps <button data-action="laps-down" ${v.laps <= limits.minLaps ? 'disabled' : ''}>−</button>
      <strong>${v.laps}</strong>
      <button data-action="laps-up" ${v.laps >= limits.maxLaps ? 'disabled' : ''}>+</button></span>
      <button data-action="shuffle">🔀 Shuffle</button>
      <button data-action="bots" class="${v.bots ? 'on' : ''}">🤖 Bots: ${v.bots ? 'on' : 'off'}</button>
      <button class="big start" data-action="start">${v.phase === 'results' ? 'REMATCH' : 'START RACE'}</button>
    </div>`);
  } else {
    const host = v.players.find((p) => p.id === v.host);
    html.push(`<p class="waiting">${laps(v.laps)} · waiting for <strong>${escapeHtml(host?.name ?? 'the host')}</strong> to start</p>`);
  }
  html.push('</div>');
  return html.join('');
}

const laps = (n: number): string => `${n} lap${n === 1 ? '' : 's'}`;

/**
 * The lobby overlay. Opens between races; Esc hides it to drive around while you wait.
 */
export class LobbyScreen {
  private readonly root = document.createElement('div');
  private readonly body = document.createElement('div');
  private readonly error = document.createElement('p');
  private readonly nameInput = document.createElement('input');
  private view: LobbyView | null = null;
  private lastHtml = '';

  constructor(
    parent: HTMLElement,
    private readonly limits: LobbyLimits,
    private readonly handlers: LobbyHandlers,
  ) {
    this.root.className = 'join lobby';
    const panel = document.createElement('div');
    panel.className = 'join-panel';
    const title = document.createElement('h2');
    title.textContent = 'Lobby — pick a car and a seat';
    const nameRow = document.createElement('label');
    nameRow.className = 'join-name';
    nameRow.textContent = 'Your name ';
    this.nameInput.maxLength = NAME_MAX_LENGTH;
    this.nameInput.placeholder = 'Name';
    this.nameInput.addEventListener('change', () => this.commitName());
    nameRow.appendChild(this.nameInput);
    this.body.addEventListener('click', this.onClick);
    this.body.addEventListener('change', this.onChange);
    this.error.className = 'join-error';
    const help = document.createElement('div');
    help.className = 'lobby-help';
    help.innerHTML =
      '<div><strong>Pilot</strong> steers with A / D</div>' +
      '<div><strong>Engineer</strong> gas W · brake / reverse S</div>' +
      '<div><strong>Solo</strong> does both</div>' +
      '<div>R respawn · Esc hide the lobby and drive around</div>';
    panel.append(title, nameRow, this.body, this.error, help);
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
    if (e.code !== 'Escape' || !this.view) return;
    if (this.view.phase === 'lobby' || this.view.phase === 'results') this.show(!this.visible);
  };

  private readonly onChange = (e: Event): void => {
    const input = e.target as HTMLInputElement;
    if (!input.classList.contains('team-name')) return;
    const name = input.value.trim().slice(0, TEAM_NAME_MAX_LENGTH);
    if (name) this.handlers.setTeamName(Number(input.dataset['slot']), name);
    this.render(true);
  };

  private readonly onClick = (e: MouseEvent): void => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn || btn.disabled || !this.view) return;
    this.error.textContent = '';
    const v = this.view;
    switch (btn.dataset['action']) {
      case 'watch': return this.handlers.leaveSeat();
      case 'ready': return this.handlers.setReady(!(v.players.find((p) => p.id === v.myId)?.ready ?? false));
      case 'start': return this.handlers.start();
      case 'shuffle': return this.handlers.shuffle();
      case 'bots': return this.handlers.setBots(!v.bots);
      case 'laps-down': return this.handlers.setLaps(v.laps - 1);
      case 'laps-up': return this.handlers.setLaps(v.laps + 1);
      default:
        if (btn.dataset['seat']) {
          this.commitName();
          this.handlers.setSeat(Number(btn.dataset['slot']), btn.dataset['seat'] as Seat);
        }
    }
  };

  show(visible: boolean): void {
    this.root.hidden = !visible;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  showError(reason: string): void {
    this.error.textContent = `Not possible: ${reason}.`;
  }

  /** New state from the server. Opens between races, closes when the countdown starts. */
  update(view: LobbyView): void {
    const prev = this.view;
    this.view = view;
    const me = view.players.find((p) => p.id === view.myId);
    if (me && document.activeElement !== this.nameInput && !this.nameInput.value) this.nameInput.value = me.name;
    const between = view.phase === 'lobby' || view.phase === 'results';
    if (!prev || prev.phase !== view.phase) this.show(between);
    this.render(false);
  }

  private render(force: boolean): void {
    if (!this.view) return;
    // Never rebuild under someone's fingers: wait until they leave the text field.
    // (Only text fields: a clicked button also keeps focus, and must not freeze the lobby.)
    const typing = document.activeElement instanceof HTMLInputElement && this.body.contains(document.activeElement);
    if (!force && typing) return;
    const next = lobbyHtml(this.view, this.limits);
    if (next === this.lastHtml) return;
    this.lastHtml = next;
    this.body.innerHTML = next;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
