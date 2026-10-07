// Lobby (P3.2): name, teams with slot colors and editable IT-pun names, seats, Ready, host
// controls. DOM over the canvas. Redraws only when what it shows changes, and never while
// you are typing in one of its text fields (live updates must not steal your keystrokes).
import { NAME_MAX_LENGTH, TEAM_NAME_MAX_LENGTH, type RacePhase, type Seat } from '@escape/shared';
import { TEAM_COLORS } from '../render/look';
import { howToCards, teamTip } from './roleKeys';
import { t } from '../i18n';
import { escapeHtml } from './html';

export interface LobbyPlayer {
  id: string;
  name: string;
  /** Bobblehead face file ('' = drawn placeholder). */
  face?: string;
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
  /** Chaos mode (items); absent = on. */
  chaos?: boolean;
  /** The car each slot drives (cars.json id) and the roster to pick from (in order). */
  carModels?: readonly string[];
  roster?: readonly { id: string; name: string }[];
  /** Car slots currently driven by server bots. */
  botSlots: number[];
  /** Faces available on the host (from /faces/faces.json); empty = placeholder only. */
  faces?: { file: string; name: string }[];
  /** Race or Battle (P11.6), and the battle rules to show; absent = race. */
  mode?: string;
  battle?: { lives: number; minutes: number };
  /** The track raced next, and the ones the host may pick (P10.0). */
  track?: string;
  tracks?: readonly { id: string; name: string }[];
}

export interface LobbyHandlers {
  setName(name: string): void;
  setSeat(slot: number, seat: Seat): void;
  leaveSeat(): void;
  setTeamName(slot: number, name: string): void;
  setReady(ready: boolean): void;
  setFace(face: string): void;
  start(): void;
  setLaps(laps: number): void;
  shuffle(): void;
  setBots(on: boolean): void;
  setChaos(on: boolean): void;
  /** Pick the car for your team's slot. */
  setCar(slot: number, car: string): void;
  /** Host: race this track next. */
  setTrack(id: string): void;
  /** Host: Race or Battle next (P11.6). */
  setMode(mode: 'race' | 'battle'): void;
}

export interface LobbyLimits {
  maxCars: number;
  minLaps: number;
  maxLaps: number;
}

const NAME_KEY = 'efw.name';

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

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
  const chaos = v.chaos ?? true;
  const html: string[] = [];
  const faces = v.faces ?? [];
  if (faces.length > 0) {
    // Face picker: your bobblehead face (only people who agreed have a photo here).
    const mine = me?.face ?? '';
    const pick = (file: string, label: string, inner: string): string =>
      `<button class="face${file === mine ? ' mine' : ''}" data-action="face" data-face="${escapeHtml(file)}" title="${escapeHtml(label)}">${inner}</button>`;
    html.push(`<div class="face-picker"><span>${t('lobby.yourFace')}</span>`);
    html.push(pick('', t('lobby.smiley'), '<span class="face-smiley">🤓</span>'));
    for (const f of faces) {
      html.push(pick(f.file, f.name, `<img src="/faces/${encodeURIComponent(f.file)}" alt="${escapeHtml(f.name)}">`));
    }
    html.push('</div>');
  }
  html.push('<div class="join-cards">');
  for (let slot = 0; slot < limits.maxCars; slot++) {
    const inCar = v.players.filter((p) => p.slot === slot && p.seat !== '');
    const solo = inCar.find((p) => p.seat === 'solo');
    const mineCar = me?.slot === slot;
    const team = escapeHtml(v.teams[slot] ?? t('team.default', { n: slot + 1 }));
    const seatBtn = (seat: Seat, label: string): string => {
      const who = seat === 'solo' ? solo : inCar.find((p) => p.seat === seat) ?? solo;
      const mine = who?.id === v.myId;
      const taken = who !== undefined && !mine;
      const blocked = seat === 'solo' && inCar.some((p) => p.id !== v.myId);
      const bot = !who && v.botSlots.includes(slot) && seat !== 'solo';
      const name = who ? `${who.ready ? '✓ ' : ''}${escapeHtml(who.name)}${who.connected ? '' : t('lobby.away')}` : bot ? t('lobby.bot') : t('lobby.free');
      return `<button class="seat${mine ? ' mine' : ''}" data-slot="${slot}" data-seat="${seat}" ${taken || blocked ? 'disabled' : ''}>
        <span class="seat-role">${label}</span><span class="seat-who">${name}</span></button>`;
    };
    const head = mineCar || iAmHost
      ? `<input class="team-name" data-slot="${slot}" maxlength="${TEAM_NAME_MAX_LENGTH}" value="${team}" dir="auto" aria-label="${t('lobby.teamName')}">`
      : `<div class="team-name">${team}</div>`;
    // The car this team drives: its own players flip through the roster with ◀ ▶.
    const model = v.roster?.find((d) => d.id === v.carModels?.[slot]);
    const carRow = !model
      ? ''
      : mineCar && v.phase !== 'racing' && v.phase !== 'countdown'
        ? `<div class="car-pick"><button data-action="car-prev" data-slot="${slot}" aria-label="${t('lobby.prevCar')}">◀</button><span>${escapeHtml(model.name)}</span><button data-action="car-next" data-slot="${slot}" aria-label="${t('lobby.nextCar')}">▶</button></div>`
        : `<div class="car-pick"><span>${escapeHtml(model.name)}</span></div>`;
    html.push(`<div class="join-card${mineCar ? ' my-team' : ''}" style="--team:${hex(TEAM_COLORS[slot % TEAM_COLORS.length]!)}">
      <div class="join-card-head"><span>${t('lobby.car', { n: slot + 1 })}</span>${carRow}</div>${head}
      ${seatBtn('pilot', t('seat.pilot'))}${seatBtn('engineer', t('seat.engineer'))}${seatBtn('solo', t('seat.solo'))}
    </div>`);
  }
  html.push('</div>');

  html.push(howToHtml(me?.seat ?? ''));

  const ready = me?.ready ?? false;
  const seated = me !== undefined && me.slot >= 0;
  html.push('<div class="lobby-actions">');
  if (seated) {
    html.push(`<button class="big ready${ready ? ' on' : ''}" data-action="ready">${ready ? t('lobby.ready') : t('lobby.notReady')}</button>`);
    html.push(`<button class="watch" data-action="watch">${t('lobby.watch')}</button>`);
  }
  if (iAmHost) {
    const battle = v.mode === 'battle';
    // Battle: no laps (lives and a time limit instead) and items are always on.
    const lapsOrRules = battle
      ? (v.battle ? `<span class="battle-rules">${t('lobby.battleRules', { lives: v.battle.lives, minutes: v.battle.minutes })}</span>` : '')
      : `<span class="laps">${t('lobby.laps')} <button data-action="laps-down" ${v.laps <= limits.minLaps ? 'disabled' : ''}>−</button>
      <strong>${v.laps}</strong>
      <button data-action="laps-up" ${v.laps >= limits.maxLaps ? 'disabled' : ''}>+</button></span>`;
    const chaosBtn = battle
      ? ''
      : `<button data-action="chaos" class="${chaos ? 'on' : ''}" title="${t('lobby.chaosTitle')}">${chaos ? t('lobby.chaosOn') : t('lobby.chaosOff')}</button>`;
    html.push(`<div class="host-controls"><span class="host-badge">${t('lobby.host')}</span>
      <button data-action="mode" class="mode${battle ? ' on' : ''}" title="${t('mode.title')}" ${v.phase === 'lobby' ? '' : 'disabled'}>${battle ? t('mode.battle') : t('mode.race')}</button>
      ${lapsOrRules}
      <button data-action="shuffle">${t('lobby.shuffle')}</button>
      <button data-action="bots" class="${v.bots ? 'on' : ''}">${v.bots ? t('lobby.botsOn') : t('lobby.botsOff')}</button>
      ${chaosBtn}
      <button class="big start" data-action="start">${v.phase === 'results' ? t('lobby.rematch') : t('lobby.start')}</button>
    </div>`);
  } else {
    const host = v.players.find((p) => p.id === v.host);
    const hostName = escapeHtml(host?.name ?? t('lobby.theHost'));
    html.push(`<p class="waiting">${v.mode === 'battle' ? t('lobby.waitingBattle', { host: hostName }) : t('lobby.waiting', { laps: laps(v.laps), host: hostName })}</p>`);
  }
  html.push('</div>');
  return html.join('');
}

/**
 * The track line at the top of the lobby: a drop-down for the host (one pick = one switch, so
 * every page reloads once), just the name for everyone else. Pure, tested.
 */
export function trackHtml(v: LobbyView): string {
  const tracks = v.tracks ?? [];
  const name = escapeHtml(tracks.find((t) => t.id === v.track)?.name ?? v.track ?? '');
  if (!name) return '';
  if (v.myId !== v.host || tracks.length < 2) return `<span class="track-label">${t('lobby.track')}</span><strong>${name}</strong>`;
  const options = tracks
    .map((t) => `<option value="${escapeHtml(t.id)}"${t.id === v.track ? ' selected' : ''}>${escapeHtml(t.name)}</option>`)
    .join('');
  return `<span class="track-label">${t('lobby.track')}</span><select data-action="track" title="${escapeHtml(t('lobby.trackTitle'))}">${options}</select>`;
}

const laps = (n: number): string => t(n === 1 ? 'lobby.lap' : 'lobby.lapsN', { n });

/** How-to-play: one short card per role (yours highlighted) and the team loop in a line. */
function howToHtml(mySeat: string): string {
  const cards = howToCards().map((c) => {
    const keys = c.keys.map(([k, what]) => `<li><kbd>${k}</kbd> ${what}</li>`).join('');
    return `<div class="howto-card${c.role === mySeat ? ' mine' : ''}" data-role="${c.role}"><strong>${c.title}</strong><p>${c.job}</p><ul>${keys}</ul></div>`;
  });
  return `<div class="howto">${cards.join('')}<p class="howto-tip">${teamTip()}</p></div>`;
}

/**
 * The lobby overlay. Opens between races; Esc hides it to drive around while you wait.
 */
export class LobbyScreen {
  private readonly root = document.createElement('div');
  private readonly body = document.createElement('div');
  private readonly error = document.createElement('p');
  private readonly nameInput = document.createElement('input');
  private readonly trackEl = document.createElement('div');
  private view: LobbyView | null = null;
  private lastHtml = '';
  private lastTrackHtml = '';

  constructor(
    parent: HTMLElement,
    private readonly limits: LobbyLimits,
    private readonly handlers: LobbyHandlers,
  ) {
    this.root.className = 'join lobby';
    const panel = document.createElement('div');
    panel.className = 'join-panel';
    const title = document.createElement('h2');
    title.textContent = t('lobby.title');
    const nameRow = document.createElement('label');
    nameRow.className = 'join-name';
    nameRow.textContent = t('lobby.yourName');
    this.nameInput.maxLength = NAME_MAX_LENGTH;
    this.nameInput.dir = 'auto';
    this.nameInput.placeholder = t('lobby.namePlaceholder');
    this.nameInput.addEventListener('change', () => this.commitName());
    nameRow.appendChild(this.nameInput);
    const topRow = document.createElement('div');
    topRow.className = 'lobby-top';
    this.trackEl.className = 'track-pick';
    this.trackEl.addEventListener('change', this.onTrackChange);
    topRow.append(nameRow, this.trackEl);
    this.body.addEventListener('click', this.onClick);
    this.body.addEventListener('change', this.onChange);
    this.error.className = 'join-error';
    const help = document.createElement('div');
    help.className = 'lobby-help';
    help.innerHTML = t('lobby.help');
    panel.append(title, topRow, this.body, this.error, help);
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

  private readonly onTrackChange = (e: Event): void => {
    const select = e.target as HTMLSelectElement;
    if (select.dataset['action'] !== 'track' || !this.view || select.value === this.view.track) return;
    // The server checks it; every page then reloads into the new track.
    this.handlers.setTrack(select.value);
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    // Esc while typing just leaves the field; it must not hide the lobby under you.
    if (e.code !== 'Escape' || !this.view) return;
    if (e.target instanceof HTMLInputElement) {
      e.target.blur();
      return;
    }
    if (this.view.phase === 'lobby') this.show(!this.visible);
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
      case 'face': return this.handlers.setFace(btn.dataset['face'] ?? '');
      case 'start': return this.handlers.start();
      case 'shuffle': return this.handlers.shuffle();
      case 'bots': return this.handlers.setBots(!v.bots);
      case 'chaos': return this.handlers.setChaos(!(v.chaos ?? true));
      case 'mode': return this.handlers.setMode(v.mode === 'battle' ? 'race' : 'battle');
      case 'car-prev':
      case 'car-next': {
        const slot = Number(btn.dataset['slot']);
        const roster = v.roster ?? [];
        const at = roster.findIndex((d) => d.id === v.carModels?.[slot]);
        const next = roster[(at + (btn.dataset['action'] === 'car-next' ? 1 : -1) + roster.length) % roster.length];
        if (next) this.handlers.setCar(slot, next.id);
        return;
      }
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
    if (visible) this.render(true);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  showError(reason: string): void {
    this.error.textContent = t('lobby.notPossible', { reason });
  }

  /** New state from the server. Opens between races, closes when the countdown starts. */
  update(view: LobbyView): void {
    const prev = this.view;
    this.view = view;
    const me = view.players.find((p) => p.id === view.myId);
    if (me && document.activeElement !== this.nameInput && !this.nameInput.value) this.nameInput.value = me.name;
    const between = view.phase === 'lobby'; // the results screen covers the results phase
    if (!prev || prev.phase !== view.phase) this.show(between);
    // Hidden (during a race): skip the work; show() draws it fresh when it opens.
    if (this.visible) this.render(false);
  }

  private render(force: boolean): void {
    if (!this.view) return;
    // Never rebuild under someone's fingers: wait until they leave the text field.
    // (Only text fields: a clicked button also keeps focus, and must not freeze the lobby.)
    const typing = document.activeElement instanceof HTMLInputElement && this.body.contains(document.activeElement);
    if (!force && typing) return;
    const track = trackHtml(this.view);
    if (track !== this.lastTrackHtml) {
      this.lastTrackHtml = track;
      this.trackEl.innerHTML = track;
    }
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
