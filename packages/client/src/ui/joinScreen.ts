// Join a game (P12.1): every game on the server, refreshed while the window is open — its
// mini map, name, host, track, mode, players and whether it is racing — with a JOIN button.
import type { GameListing } from '@escape/shared';
import { t } from '../i18n';
import { MENU } from '../render/look';
import { escapeHtml } from './html';

export interface JoinDeps {
  /** The games now (null = server unreachable). */
  fetchGames(): Promise<GameListing[] | null>;
  trackName(id: string): string;
  /** The track's mini map (SVG), '' if unknown. */
  trackMap(id: string): string;
  /** Join it; resolves with an error to show, or null when it worked. */
  join(id: string): Promise<string | null>;
  /** "Host one" from an empty list (absent on the phone pad). */
  host?: () => void;
}

/** The list's HTML (pure, tested). `joining` = the game being joined right now. */
export function gameListHtml(games: readonly GameListing[] | null, d: Pick<JoinDeps, 'trackName' | 'trackMap'>, joining: string | null, canHost: boolean): string {
  if (games === null) return `<p class="empty">${t('join.unreachable')}</p>`;
  const hostBtn = canHost ? `<button type="button" class="big start" data-action="host">${t('join.host')}</button>` : '';
  if (games.length === 0) return `<p class="empty">${t('join.none')}</p>${hostBtn}`;
  const status = (phase: string): string => (phase === 'racing' || phase === 'countdown' ? t('join.racing') : phase === 'results' ? t('join.results') : t('join.inLobby'));
  const rows = games.map((g) => {
    const name = g.isDefault ? t('join.officeGame') : `<bdi>${escapeHtml(g.name)}</bdi>`;
    const host = g.host ? `<span>${t('join.by', { host: `<bdi>${escapeHtml(g.host)}</bdi>` })}</span>` : '';
    const full = g.players >= g.maxPlayers;
    const busy = joining === g.id;
    return `<li class="game-row${g.phase === 'lobby' ? '' : ' playing'}">
      <span class="game-map">${d.trackMap(g.track)}</span>
      <span class="game-info"><b>${name}</b>${host}<span>${escapeHtml(d.trackName(g.track))} · ${g.mode === 'battle' ? t('mode.battle') : t('mode.race')}</span><small>${status(g.phase)}</small></span>
      <span class="game-players">${t('join.players', { n: g.players, max: g.maxPlayers })}</span>
      <button type="button" class="big start" data-join="${escapeHtml(g.id)}" ${full || joining !== null ? 'disabled' : ''}>${busy ? t('join.joining') : t('join.join')}</button>
    </li>`;
  });
  return `<ul class="game-list">${rows.join('')}</ul>${hostBtn}`;
}

export class JoinScreen {
  private readonly root = document.createElement('div');
  private readonly list = document.createElement('div');
  private readonly error = document.createElement('p');
  private games: GameListing[] | null = [];
  private loaded = false;
  private joining: string | null = null;
  private timer = 0;
  private last = '';
  /** A list request is on its way (a slow reply must not overwrite a newer one). */
  private fetching = false;

  constructor(parent: HTMLElement, private readonly d: JoinDeps, fullScreen = false) {
    this.root.className = fullScreen ? 'modal join-page' : 'modal';
    this.root.hidden = true;
    const box = document.createElement('div');
    box.className = 'modal-box join-box';
    const title = document.createElement('h2');
    title.textContent = t('join.title');
    if (!fullScreen) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'modal-close';
      close.textContent = '×';
      close.addEventListener('click', () => this.close());
      box.appendChild(close);
      this.root.addEventListener('click', (e) => {
        if (e.target === this.root) this.close();
      });
    }
    this.error.className = 'join-error';
    box.append(title, this.list, this.error);
    this.root.appendChild(box);
    this.list.addEventListener('click', this.onClick);
    parent.appendChild(this.root);
  }

  open(): void {
    this.root.hidden = false;
    this.error.textContent = '';
    this.render();
    void this.refresh();
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.refresh(), MENU.gamesPollMs);
  }

  close(): void {
    this.root.hidden = true;
    window.clearInterval(this.timer);
  }

  private async refresh(): Promise<void> {
    if (this.fetching) return;
    this.fetching = true;
    try {
      this.games = await this.d.fetchGames();
    } finally {
      this.fetching = false;
    }
    this.loaded = true;
    this.render();
  }

  private render(): void {
    const html = this.loaded ? gameListHtml(this.games, this.d, this.joining, this.d.host !== undefined) : `<p class="empty">${t('join.loading')}</p>`;
    if (html === this.last) return;
    this.last = html;
    this.list.innerHTML = html;
  }

  private readonly onClick = (e: MouseEvent): void => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn || btn.disabled) return;
    if (btn.dataset['action'] === 'host') {
      this.close();
      this.d.host?.();
      return;
    }
    const id = btn.dataset['join'];
    if (!id || this.joining) return;
    this.joining = id;
    this.error.textContent = '';
    this.render();
    void this.d.join(id).then((problem) => {
      this.joining = null;
      if (problem) this.error.textContent = t('join.failed', { reason: problem });
      this.render();
    });
  };

  dispose(): void {
    window.clearInterval(this.timer);
    this.root.remove();
  }
}
