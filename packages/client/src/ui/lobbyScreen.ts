// Lobby (P3.2): name, teams with slot colors and editable IT-pun names, seats, Ready, host
// controls. DOM over the canvas. Redraws only when what it shows changes, and never while
// you are typing in one of its text fields (live updates must not steal your keystrokes).
// P12.3: each team card shows its car's picture, name and real-life type; big seat buttons
// with icons and faces; the garage window shows every car with stats to pick your team's.
import { NAME_MAX_LENGTH, TEAM_NAME_MAX_LENGTH, type CarDef, type RacePhase, type Seat } from '@escape/shared';
import { TEAM_COLORS } from '../render/look';
import { howToCards, teamTip } from './roleKeys';
import { t, type StringKey } from '../i18n';
import { escapeHtml } from './html';
import { carType } from './carType';

/** A roster car as the lobby shows it. */
export type LobbyCar = Pick<CarDef, 'id' | 'name' | 'stats' | 'look'>;

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
  roster?: readonly LobbyCar[];
  /** Every car stat sits in this range (cars.json `statRange`): the garage's bar scale. */
  statRange?: { min: number; max: number };
  /** Car slots currently driven by server bots. */
  botSlots: number[];
  /** Faces available on the host (from /faces/faces.json); empty = placeholder only. */
  faces?: { file: string; name: string }[];
  /** The game's name as its host typed it ('' / absent = the server's always-open game), P12.1. */
  game?: string;
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
  /** Leave this game and go back to the menu (P12.1). */
  leaveGame(): void;
  /** Play a roster car's horn (the garage's Honk button). */
  honk?(car: string): void;
}

/** A car picture's URL for a roster car in a slot's team color ('' = no picture). */
export type CarPictureSource = (carId: string, slot: number) => string;

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
    const seatBtn = (seat: Seat): string => {
      const who = seat === 'solo' ? solo : inCar.find((p) => p.seat === seat) ?? solo;
      const mine = who?.id === v.myId;
      const taken = who !== undefined && !mine;
      const blocked = seat === 'solo' && inCar.some((p) => p.id !== v.myId);
      const bot = !who && v.botSlots.includes(slot) && seat !== 'solo';
      const open = !who && !bot && !blocked;
      const name = who
        ? `${avatarHtml(who.face ?? '')}<span class="seat-name">${who.ready ? '✓ ' : ''}${escapeHtml(who.name)}${who.connected ? '' : t('lobby.away')}</span>`
        : bot ? t('lobby.bot') : blocked ? '' : `<span class="seat-free">${t('lobby.sitHere')}</span>`;
      const S = SEATS[seat];
      // Solo is the slim "or drive Solo" line under the two real seats.
      const role = seat === 'solo' && open ? t('seat.orSolo', { solo: t(S.name) }) : t(S.name);
      return `<button class="seat seat-${seat}${mine ? ' mine' : ''}${open ? ' open' : ''}" data-slot="${slot}" data-seat="${seat}" ${taken || blocked ? 'disabled' : ''}>`
        + `<span class="seat-icon">${S.icon}</span><span class="seat-role">${role}</span><span class="seat-job">${t(S.job)}</span><span class="seat-who">${name}</span></button>`;
    };
    const head = mineCar || iAmHost
      ? `<input class="team-name" data-slot="${slot}" maxlength="${TEAM_NAME_MAX_LENGTH}" value="${team}" dir="auto" aria-label="${t('lobby.teamName')}">`
      : `<div class="team-name">${team}</div>`;
    html.push(`<div class="join-card${mineCar ? ' my-team' : ''}" style="--team:${hex(TEAM_COLORS[slot % TEAM_COLORS.length]!)}">
      <div class="join-card-head"><span class="car-num">${slot + 1}</span>${head}</div>
      ${carHtml(v, slot, mineCar)}
      <div class="seat-pair">${seatBtn('pilot')}${seatBtn('engineer')}</div>${seatBtn('solo')}
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

/** Seat icons, names and jobs. */
const SEATS: Readonly<Record<Seat, { icon: string; name: StringKey; job: StringKey }>> = {
  pilot: { icon: '🕹️', name: 'seat.pilot', job: 'seat.pilotJob' },
  engineer: { icon: '🔧', name: 'seat.engineer', job: 'seat.engineerJob' },
  solo: { icon: '🚗', name: 'seat.solo', job: 'seat.soloJob' },
};

/** A player's little face in a seat: their photo, or the drawn smiley. */
function avatarHtml(face: string): string {
  return face
    ? `<img class="seat-face" src="/faces/${encodeURIComponent(face)}" alt="">`
    : '<span class="seat-face">🤓</span>';
}

/** Lobby phases where teams may still pick their car (as the server's rules). */
const canPickCar = (phase: RacePhase): boolean => phase !== 'racing' && phase !== 'countdown';

/**
 * A team card's car: its picture (filled in after drawing, from `data-pic`), name and real-life
 * type. The team's own players flip through the roster with ◀ ▶ or open the garage by
 * clicking the picture.
 */
function carHtml(v: LobbyView, slot: number, mineCar: boolean): string {
  const model = v.roster?.find((d) => d.id === v.carModels?.[slot]);
  if (!model) return '';
  const pic = `<img class="car-pic" data-pic="${escapeHtml(model.id)}|${slot}" alt="">`;
  // The name plate sits on the picture.
  const label = `<span class="car-label"><strong>${escapeHtml(model.name)}</strong><span class="car-type">${carType(model.look.body)}</span></span>`;
  if (!mineCar || !canPickCar(v.phase)) return `<div class="car-show"><div class="car-pic-box">${pic}${label}</div></div>`;
  return `<div class="car-show">`
    + `<button class="car-flip" data-action="car-prev" data-slot="${slot}" aria-label="${t('lobby.prevCar')}">◀</button>`
    + `<button class="car-pic-box" data-action="garage" data-slot="${slot}" title="${t('lobby.garageTitle')}">${pic}<span class="garage-tag">${t('lobby.garage')}</span>${label}</button>`
    + `<button class="car-flip" data-action="car-next" data-slot="${slot}" aria-label="${t('lobby.nextCar')}">▶</button>`
    + '</div>';
}

/** Stat bars start this far in, so the lowest stat still shows a bar (%). */
const STAT_BAR_FLOOR = 18;

/**
 * The garage window: every roster car in your team's color with its type, stats and horn;
 * click one to drive it. Pure, tested.
 */
export function garageHtml(v: LobbyView, slot: number, maxCars: number): string {
  const roster = v.roster ?? [];
  const stats = roster.flatMap((c) => [c.stats.speed, c.stats.grip, c.stats.weight]);
  const range = v.statRange ?? { min: Math.min(...stats), max: Math.max(...stats) };
  const span = range.max - range.min;
  const bar = (key: StringKey, value: number): string => {
    const share = span > 0 ? Math.min(1, Math.max(0, (value - range.min) / span)) : 0.5;
    const pct = Math.round(STAT_BAR_FLOOR + (100 - STAT_BAR_FLOOR) * share);
    return `<span class="stat"><span class="stat-name">${t(key)}</span><span class="stat-bar"><i style="width:${pct}%"></i></span></span>`;
  };
  const current = v.carModels?.[slot];
  const tiles = roster.map((car) => {
    const id = escapeHtml(car.id);
    // Other teams on this model: their color dots.
    const others = (v.carModels ?? []).flatMap((m, s) => (m === car.id && s !== slot && s < maxCars ? [s] : []));
    const dots = others.length === 0 ? '' : `<span class="garage-others" title="${t('garage.alsoDriven')}">${others
      .map((s) => `<span class="garage-dot" style="--team:${hex(TEAM_COLORS[s % TEAM_COLORS.length]!)}">${s + 1}</span>`).join('')}</span>`;
    const mine = car.id === current;
    return `<div class="garage-car${mine ? ' current' : ''}">`
      + `<button class="garage-pick" data-action="pick-car" data-slot="${slot}" data-car="${id}" title="${t('garage.pick')}">`
      + `<img class="car-pic" data-pic="${id}|${slot}" alt="">`
      + `<span class="garage-name">${escapeHtml(car.name)}</span><span class="car-type">${carType(car.look.body)}</span>`
      + bar('garage.speed', car.stats.speed) + bar('garage.grip', car.stats.grip) + bar('garage.weight', car.stats.weight)
      + `${mine ? `<span class="garage-yours">${t('garage.yours')}</span>` : ''}</button>`
      + `<div class="garage-foot"><button class="garage-honk" data-action="honk" data-car="${id}">${t('garage.honk')}</button>${dots}</div>`
      + '</div>';
  });
  const team = escapeHtml(v.teams[slot] ?? t('team.default', { n: slot + 1 }));
  return `<div class="garage" role="dialog" aria-label="${t('garage.title')}" style="--team:${hex(TEAM_COLORS[slot % TEAM_COLORS.length]!)}">`
    + `<div class="garage-panel"><div class="garage-head"><h3>${t('garage.title')}</h3><span class="garage-for">${t('garage.for', { team })}</span>`
    + `<button class="garage-close" data-action="garage-close" aria-label="${t('garage.close')}">✕</button></div>`
    + `<div class="garage-grid">${tiles.join('')}</div></div></div>`;
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
  private readonly title = document.createElement('h2');
  private gameName = '';
  /** The team whose garage window is open (null = closed). */
  private garageSlot: number | null = null;
  private view: LobbyView | null = null;
  private lastHtml = '';
  private lastTrackHtml = '';

  constructor(
    parent: HTMLElement,
    private readonly limits: LobbyLimits,
    private readonly handlers: LobbyHandlers,
    private readonly pictures: CarPictureSource = () => '',
  ) {
    this.root.className = 'join lobby';
    const panel = document.createElement('div');
    panel.className = 'join-panel';
    const title = this.title;
    title.textContent = t('lobby.title');
    // Leave this game (back to the menu: host or join another one).
    const leave = document.createElement('button');
    leave.type = 'button';
    leave.className = 'leave-game';
    leave.dataset['action'] = 'leave-game';
    leave.textContent = t('lobby.leaveGame');
    leave.addEventListener('click', () => {
      leave.disabled = true;
      this.handlers.leaveGame();
    });
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
    topRow.append(nameRow, this.trackEl, leave);
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
    if (this.garageSlot !== null) return this.openGarage(null);
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
    // A click on the dimmed backdrop around the garage closes it.
    if ((e.target as HTMLElement).classList.contains('garage')) return this.openGarage(null);
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
      case 'garage': return this.openGarage(Number(btn.dataset['slot']));
      case 'garage-close': return this.openGarage(null);
      case 'pick-car': {
        const car = btn.dataset['car'] ?? '';
        if (car !== v.carModels?.[Number(btn.dataset['slot'])]) this.handlers.setCar(Number(btn.dataset['slot']), car);
        return this.openGarage(null);
      }
      case 'honk': return this.handlers.honk?.(btn.dataset['car'] ?? '');
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
    if (!visible) this.garageSlot = null;
    if (visible) this.render(true);
  }

  /** Open your team's garage window (or close it: null). */
  private openGarage(slot: number | null): void {
    this.garageSlot = slot;
    this.render(true);
  }

  /** Whether the garage window is open (tests, shots). */
  get garageOpen(): boolean {
    return this.garageSlot !== null;
  }

  /** Open the garage of the team you sit in (the `carpick` shots scenario). */
  openMyGarage(): void {
    const me = this.view?.players.find((p) => p.id === this.view?.myId);
    if (me && me.slot >= 0) this.openGarage(me.slot);
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
    if ((view.game ?? '') !== this.gameName) {
      this.gameName = view.game ?? '';
      this.title.textContent = this.gameName ? t('lobby.titleGame', { name: this.gameName }) : t('lobby.title');
    }
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
    // The garage closes when you leave that team or the race starts.
    const v = this.view;
    const me = v.players.find((p) => p.id === v.myId);
    if (this.garageSlot !== null && (me?.slot !== this.garageSlot || !canPickCar(v.phase))) this.garageSlot = null;
    const garage = this.garageSlot === null ? '' : garageHtml(v, this.garageSlot, this.limits.maxCars);
    const next = lobbyHtml(v, this.limits) + garage;
    if (next === this.lastHtml) return;
    this.lastHtml = next;
    this.body.innerHTML = next;
    // Car pictures: rendered once per car and color, so they are not part of the compared HTML.
    for (const img of this.body.querySelectorAll<HTMLImageElement>('img[data-pic]')) {
      const [car = '', slot = '0'] = (img.dataset['pic'] ?? '').split('|');
      const url = this.pictures(car, Number(slot));
      if (url) img.src = url;
      else img.hidden = true;
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
