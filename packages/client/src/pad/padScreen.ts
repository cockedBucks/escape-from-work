// Phone controller screen (P11.5): pick a seat, then big touch buttons for your role and a
// status line (lap, place, speed, heat, nitro, item). DOM only, no 3D: the teammate's laptop
// shows the race. The controls are rebuilt only when your role changes (the swap lane).
import { NAME_MAX_LENGTH, type RacePhase, type Seat } from '@escape/shared';
import { escapeHtml } from '../ui/html';
import { itemIcon } from '../ui/itemIcons';
import { itemName } from '../ui/items';
import type { HudText } from '../ui/raceHud';
import { TEAM_COLORS } from '../render/look';
import { t } from '../i18n';
import { padButtons } from './padLayout';
import type { PadControls } from './padControls';

export interface PadPlayer {
  id: string;
  name: string;
  slot: number;
  seat: string;
  ready: boolean;
}

/** Everything the pad shows. */
export interface PadView {
  phase: RacePhase;
  myId: string;
  host: string;
  players: PadPlayer[];
  teams: readonly string[];
  /** Cars driven by server bots, and the number of car slots. */
  botSlots: readonly number[];
  maxCars: number;
  /** What you control now ('' = not in a car). */
  role: string;
  hud: HudText;
  /** Your car (null when not in one). */
  car: { speed: number; heat: number; nitro: number; item: string; stalled: boolean } | null;
}

export interface PadHandlers {
  setName(name: string): void;
  setSeat(slot: number, seat: Seat): void;
  setReady(ready: boolean): void;
  /** Host only: start (or rematch). */
  start(): void;
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const SEATS: readonly Seat[] = ['pilot', 'engineer', 'solo'];

/** The seat list: every car, who sits where, and a button per free seat. Pure, tested. */
export function padSeatsHtml(v: PadView): string {
  const rows: string[] = [];
  for (let slot = 0; slot < v.maxCars; slot++) {
    const inCar = v.players.filter((p) => p.slot === slot && p.seat !== '');
    const team = escapeHtml(v.teams[slot] ?? t('team.default', { n: slot + 1 }));
    const bot = v.botSlots.includes(slot);
    const seats = SEATS.map((seat) => {
      const who = inCar.find((p) => p.seat === seat) ?? (seat !== 'solo' ? inCar.find((p) => p.seat === 'solo') : undefined);
      const mine = who?.id === v.myId;
      const taken = (who !== undefined && !mine) || (seat === 'solo' && inCar.some((p) => p.id !== v.myId));
      const label = who ? escapeHtml(who.name) : bot && seat !== 'solo' ? t('lobby.bot') : t('lobby.free');
      return `<button class="pad-seat${mine ? ' mine' : ''}" data-slot="${slot}" data-seat="${seat}" ${taken ? 'disabled' : ''}><b>${t(`seat.${seat}`)}</b><span>${label}</span></button>`;
    }).join('');
    rows.push(`<div class="pad-car" style="--team:${hex(TEAM_COLORS[slot % TEAM_COLORS.length]!)}"><div class="pad-car-name">${t('lobby.car', { n: slot + 1 })} · <bdi>${team}</bdi></div><div class="pad-seats">${seats}</div></div>`);
  }
  return rows.join('');
}

/** The status line over the buttons. Pure, tested. */
export function padStatusHtml(v: PadView): string {
  const parts: string[] = [`<b class="pad-role">${escapeHtml(roleTitle(v.role))}</b>`];
  if (v.hud.countdown) parts.push(`<b class="pad-count">${escapeHtml(v.hud.countdown)}</b>`);
  if (v.hud.banner) parts.push(`<b>${escapeHtml(v.hud.banner)}</b>`);
  else {
    if (v.hud.lap) parts.push(`<span>${escapeHtml(v.hud.lap)}</span>`);
    if (v.hud.place) parts.push(`<span>${escapeHtml(v.hud.place)}</span>`);
  }
  if (v.hud.wrongWay) parts.push(`<b class="pad-warn">${t('hud.wrongWay')}</b>`);
  if (v.car) {
    parts.push(`<span>${t('pad.speed', { n: Math.round(Math.abs(v.car.speed) * 3.6) })}</span>`);
    parts.push(`<span class="pad-bar heat${v.car.stalled ? ' stalled' : ''}">${v.car.stalled ? t('gauge.stall') : t('gauge.heat')}<i style="width:${Math.round(v.car.heat * 100)}%"></i></span>`);
    parts.push(`<span class="pad-bar nitro">${t('gauge.nitro')}<i style="width:${Math.round(v.car.nitro * 100)}%"></i></span>`);
    parts.push(`<span>${v.car.item ? `${itemIcon(v.car.item)} ${escapeHtml(itemName(v.car.item))}` : `${t('gauge.item')} —`}</span>`);
  }
  if (v.phase === 'lobby' || v.phase === 'results') parts.push(`<span>${t('pad.lobby')}</span>`);
  return parts.join('');
}

const roleTitle = (role: string): string => (role === 'pilot' || role === 'engineer' || role === 'solo' ? t(`role.${role}`) : t('role.watching'));

export class PadScreen {
  private readonly root = document.createElement('div');
  private readonly status = document.createElement('div');
  private readonly seatsBox = document.createElement('div');
  private readonly seats = document.createElement('div');
  private readonly actions = document.createElement('div');
  private readonly pad = document.createElement('div');
  private readonly error = document.createElement('p');
  private readonly nameInput = document.createElement('input');
  private view: PadView | null = null;
  private role: string | null = null;
  /** You asked to see the seat list although you are seated. */
  private wantSeats = false;
  private last = { seats: '', status: '', actions: '' };

  constructor(parent: HTMLElement, private readonly controls: PadControls, private readonly h: PadHandlers, name: string) {
    this.root.className = 'pad-screen';
    this.status.className = 'pad-status';
    this.seatsBox.className = 'pad-seats-box';
    const title = document.createElement('h2');
    title.textContent = t('pad.title');
    const hint = document.createElement('p');
    hint.className = 'pad-hint';
    hint.textContent = t('pad.pickSeat');
    const nameRow = document.createElement('label');
    nameRow.className = 'pad-name';
    nameRow.textContent = t('lobby.yourName');
    this.nameInput.value = name;
    this.nameInput.dir = 'auto';
    this.nameInput.maxLength = NAME_MAX_LENGTH;
    this.nameInput.addEventListener('change', () => {
      const v = this.nameInput.value.trim();
      if (v) this.h.setName(v);
    });
    nameRow.appendChild(this.nameInput);
    const awake = document.createElement('p');
    awake.className = 'pad-hint small';
    awake.textContent = t('pad.awake');
    this.seats.className = 'pad-car-list';
    this.seats.addEventListener('click', this.onSeatClick);
    this.error.className = 'join-error';
    this.seatsBox.append(title, hint, nameRow, this.seats, this.error, awake);
    this.actions.className = 'pad-actions';
    this.actions.addEventListener('click', this.onAction);
    this.pad.className = 'pad-buttons';
    const rotate = document.createElement('p');
    rotate.className = 'pad-rotate';
    rotate.textContent = t('pad.rotate');
    this.root.append(this.status, this.actions, this.seatsBox, this.pad, rotate);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault()); // long press must not open a menu
    parent.appendChild(this.root);
  }

  showError(reason: string): void {
    this.error.textContent = t('lobby.notPossible', { reason });
  }

  update(v: PadView): void {
    this.view = v;
    const seated = v.role !== '';
    const between = v.phase === 'lobby' || v.phase === 'results';
    if (!between) this.wantSeats = false;
    const showSeats = !seated || (this.wantSeats && between);
    this.seatsBox.hidden = !showSeats;
    this.pad.hidden = showSeats;
    if (showSeats) this.set('seats', this.seats, padSeatsHtml(v));
    this.set('status', this.status, padStatusHtml(v));
    this.set('actions', this.actions, this.actionsHtml(v, seated, between));
    if (v.role !== this.role) this.buildButtons(v.role);
  }

  private set(key: keyof PadScreen['last'], el: HTMLElement, html: string): void {
    if (this.last[key] === html) return;
    this.last[key] = html;
    el.innerHTML = html;
  }

  /** Ready / change seat / start, between races. */
  private actionsHtml(v: PadView, seated: boolean, between: boolean): string {
    if (!between) return '';
    const me = v.players.find((p) => p.id === v.myId);
    const out: string[] = [];
    if (seated) {
      out.push(`<button data-action="ready" class="${me?.ready ? 'on' : ''}">${me?.ready ? t('lobby.ready') : t('lobby.notReady')}</button>`);
      out.push(`<button data-action="seats">${this.wantSeats ? t('pad.backToPad') : t('pad.changeSeat')}</button>`);
    }
    if (v.host === v.myId) out.push(`<button data-action="start" class="start">${v.phase === 'results' ? t('lobby.rematch') : t('lobby.start')}</button>`);
    return out.join('');
  }

  /** New role: new buttons (and let go of whatever the old ones held). */
  private buildButtons(role: string): void {
    this.role = role;
    this.controls.releaseAll();
    this.pad.innerHTML = '';
    const zones = { left: document.createElement('div'), middle: document.createElement('div'), right: document.createElement('div') };
    for (const [zone, el] of Object.entries(zones)) {
      el.className = `pad-zone ${zone}`;
      this.pad.appendChild(el);
    }
    this.pad.dataset['role'] = role;
    for (const b of padButtons(role)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pad-btn ${b.action}`;
      btn.dataset['action'] = b.action;
      btn.textContent = b.label === '◀' || b.label === '▶' ? b.label : t(b.label);
      const up = (e: PointerEvent): void => {
        btn.classList.remove('down');
        this.controls.release(b.action, e.pointerId);
      };
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try {
          btn.setPointerCapture(e.pointerId); // the finger may slide a little: keep the button held until it lifts
        } catch {
          // some browsers refuse capture for this pointer: the button still works
        }
        btn.classList.add('down');
        this.controls.press(b.action, e.pointerId);
      });
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      zones[b.zone].appendChild(btn);
    }
  }

  private readonly onSeatClick = (e: MouseEvent): void => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn || btn.disabled || !btn.dataset['seat']) return;
    this.error.textContent = '';
    const name = this.nameInput.value.trim();
    if (name) this.h.setName(name);
    this.wantSeats = false;
    this.h.setSeat(Number(btn.dataset['slot']), btn.dataset['seat'] as Seat);
  };

  private readonly onAction = (e: MouseEvent): void => {
    const action = (e.target as HTMLElement).closest('button')?.dataset['action'];
    const v = this.view;
    if (!v) return;
    if (action === 'ready') this.h.setReady(!(v.players.find((p) => p.id === v.myId)?.ready ?? false));
    else if (action === 'start') this.h.start();
    else if (action === 'seats') {
      this.wantSeats = !this.wantSeats;
      this.update(v);
    }
  };

  dispose(): void {
    this.root.remove();
  }
}
