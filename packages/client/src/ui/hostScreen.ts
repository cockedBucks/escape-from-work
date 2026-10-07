// Host a game (P12.1): name it, pick the track (cards with mini maps), Race or Battle, laps,
// bots and chaos, then CREATE GAME. The creator lands in the new game's lobby as its host.
import { DEFAULT_TRACK, GAME_NAME_MAX_LENGTH, type CreateGame, type RaceMode } from '@escape/shared';
import { t } from '../i18n';
import { escapeHtml } from './html';

export interface HostOptions {
  /** Tracks to offer, in order, with their names and mini maps (SVG). */
  tracks: readonly { id: string; name: string; map: string }[];
  minLaps: number;
  maxLaps: number;
  defaultLaps: number;
  /** Suggested game name ("Dina's game"). */
  defaultName: string;
}

/** The form's HTML for these settings (pure, tested). */
export function hostFormHtml(o: HostOptions, s: CreateGame, busy: boolean): string {
  const battle = s.mode === 'battle';
  const tracks = o.tracks
    .map((tr) => `<button type="button" class="track-card${tr.id === s.track ? ' on' : ''}" data-track="${escapeHtml(tr.id)}">${tr.map}<span>${escapeHtml(tr.name)}</span></button>`)
    .join('');
  const mode = (m: RaceMode, label: string): string =>
    `<button type="button" class="choice mode-card${s.mode === m ? ' on' : ''}" data-mode="${m}">${label}</button>`;
  const laps = battle
    ? ''
    : `<div class="host-laps"><b>${t('host.laps')}</b><div class="stepper"><button type="button" data-action="laps-down" ${s.laps <= o.minLaps ? 'disabled' : ''}>−</button><strong>${s.laps}</strong><button type="button" data-action="laps-up" ${s.laps >= o.maxLaps ? 'disabled' : ''}>+</button></div></div>`;
  const toggle = (key: 'bots' | 'chaos', label: string): string =>
    `<label class="check"><input type="checkbox" data-key="${key}" ${s[key] ? 'checked' : ''}> ${label}</label>`;
  return `<section><h3>${t('host.name')}</h3><input class="host-name" data-key="name" dir="auto" maxlength="${GAME_NAME_MAX_LENGTH}" value="${escapeHtml(s.name)}"></section>
    <section><h3>${t('host.track')}</h3><div class="track-cards">${tracks}</div></section>
    <section><h3>${t('host.mode')}</h3><div class="choice-row">${mode('race', `${t('mode.race')}`)}${mode('battle', `${t('mode.battle')}`)}</div><p class="note">${t('mode.title')}</p></section>
    <section class="host-row">${laps}<div class="host-toggles">${toggle('bots', t('host.bots'))}${battle ? '' : toggle('chaos', t('host.chaos'))}</div></section>
    <button type="button" class="big start host-create" data-action="create" ${busy || s.name.trim() === '' ? 'disabled' : ''}>${busy ? t('host.creating') : t('host.create')}</button>`;
}

export class HostScreen {
  private readonly root = document.createElement('div');
  private readonly form = document.createElement('div');
  private readonly error = document.createElement('p');
  private settings: CreateGame;
  private busy = false;

  /** `create` hosts the game and resolves with an error to show, or null when it worked. */
  constructor(parent: HTMLElement, private readonly o: HostOptions, private readonly create: (s: CreateGame) => Promise<string | null>) {
    const track = o.tracks.find((tr) => tr.id === DEFAULT_TRACK)?.id ?? o.tracks[0]?.id ?? '';
    this.settings = { name: o.defaultName, track, mode: 'race', laps: o.defaultLaps, bots: true, chaos: true };
    this.root.className = 'modal';
    this.root.hidden = true;
    const box = document.createElement('div');
    box.className = 'modal-box host-box';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'modal-close';
    close.textContent = '×';
    close.addEventListener('click', () => this.close());
    const title = document.createElement('h2');
    title.textContent = t('host.title');
    this.error.className = 'join-error';
    this.form.className = 'host-form';
    box.append(close, title, this.form, this.error);
    this.root.appendChild(box);
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    this.form.addEventListener('click', this.onClick);
    this.form.addEventListener('input', this.onInput);
    parent.appendChild(this.root);
  }

  open(): void {
    this.root.hidden = false;
    this.error.textContent = '';
    this.render();
  }

  close(): void {
    this.root.hidden = true;
  }

  private render(): void {
    const focused = document.activeElement === this.form.querySelector('.host-name');
    this.form.innerHTML = hostFormHtml(this.o, this.settings, this.busy);
    if (focused) {
      const input = this.form.querySelector<HTMLInputElement>('.host-name');
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }
  }

  private readonly onInput = (e: Event): void => {
    const el = e.target as HTMLInputElement;
    const key = el.dataset['key'];
    if (key === 'name') {
      this.settings = { ...this.settings, name: el.value };
      // Only the Create button depends on the name: no full redraw while typing.
      const create = this.form.querySelector<HTMLButtonElement>('.host-create');
      if (create) create.disabled = this.busy || el.value.trim() === '';
    } else if (key === 'bots' || key === 'chaos') {
      this.settings = { ...this.settings, [key]: el.checked };
    }
  };

  private readonly onClick = (e: MouseEvent): void => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn || btn.disabled || this.busy) return;
    const s = this.settings;
    if (btn.dataset['track']) this.settings = { ...s, track: btn.dataset['track'] };
    else if (btn.dataset['mode']) this.settings = { ...s, mode: btn.dataset['mode'] as RaceMode };
    else if (btn.dataset['action'] === 'laps-down') this.settings = { ...s, laps: Math.max(this.o.minLaps, s.laps - 1) };
    else if (btn.dataset['action'] === 'laps-up') this.settings = { ...s, laps: Math.min(this.o.maxLaps, s.laps + 1) };
    else if (btn.dataset['action'] === 'create') {
      void this.submit();
      return;
    } else return;
    this.render();
  };

  private async submit(): Promise<void> {
    this.busy = true;
    this.error.textContent = '';
    this.render();
    const problem = await this.create({ ...this.settings, name: this.settings.name.trim() });
    this.busy = false;
    if (problem) {
      this.error.textContent = t('host.failed', { reason: problem });
      this.render();
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
