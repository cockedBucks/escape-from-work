// League screen (P9.4, GAME_DESIGN §10): this week's cup, the all-time table, best duos and
// lap records. Tables come from the host (`/league/tables.json`); drawn here, pure where it can.
import type { LeagueTables, PlayerRow } from '@escape/shared';
import { escapeHtml } from './html';
import { raceTime } from './scoreboard';

export const LEAGUE_TABS = ['week', 'allTime', 'duos', 'laps'] as const;
export type LeagueTab = (typeof LEAGUE_TABS)[number];
const TAB_LABEL: Record<LeagueTab, string> = { week: 'This week', allTime: 'All time', duos: 'Best duos', laps: 'Lap records' };

/** What the host sends: tables, or `enabled: false` when it keeps no league (dev, tests). */
export type LeagueResponse = ({ enabled: true } & LeagueTables) | { enabled: false };

const medal = (i: number): string => ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`;

function playersHtml(rows: readonly PlayerRow[], empty: string): string {
  if (rows.length === 0) return `<p class="empty">${empty}</p>`;
  const body = rows
    .map((r, i) => `<tr><td class="l-rank">${medal(i)}</td><td class="l-name">${escapeHtml(r.name)}</td><td class="l-pts">${r.points}</td><td>${r.wins}</td><td>${r.podiums}</td><td>${r.races}</td></tr>`)
    .join('');
  return `<table class="league-table"><thead><tr><th></th><th>Player</th><th>Points</th><th>Wins</th><th>Podiums</th><th>Races</th></tr></thead><tbody>${body}</tbody></table>`;
}

/** "2026-10-04" → "Sun 4 Oct" (the week's first day). */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** One tab's HTML. `carName` turns a roster car id into its name; `trackName` likewise. Pure, tested. */
export function leagueTabHtml(t: LeagueTables, tab: LeagueTab, carName: (id: string) => string, trackName: (id: string) => string): string {
  if (tab === 'week') return `<p class="league-note">Weekly cup since ${escapeHtml(dayLabel(t.week.start))}</p>${playersHtml(t.week.rows, 'No races this week yet. Go race!')}`;
  if (tab === 'allTime') return `<p class="league-note">${t.races} races so far</p>${playersHtml(t.allTime, 'No races yet.')}`;
  if (tab === 'duos') {
    if (t.duos.length === 0) return '<p class="empty">No duos yet: share a car with someone!</p>';
    const body = t.duos
      .map((d, i) => `<tr><td class="l-rank">${medal(i)}</td><td class="l-name">${escapeHtml(d.names[0])} &amp; ${escapeHtml(d.names[1])}</td><td>${d.wins}</td><td class="l-pts">${d.points}</td><td>${d.races}</td></tr>`)
      .join('');
    return `<table class="league-table"><thead><tr><th></th><th>Duo</th><th>Wins</th><th>Points</th><th>Races</th></tr></thead><tbody>${body}</tbody></table>`;
  }
  if (t.laps.length === 0) return '<p class="empty">No laps yet.</p>';
  const body = t.laps
    .map((l) => {
      const who = l.bot ? '🤖 a bot (beat it!)' : escapeHtml(l.names.join(' & '));
      return `<tr><td class="l-name">${escapeHtml(trackName(l.track))}</td><td class="l-pts">${raceTime(l.ms)}</td><td>${who}</td><td>${escapeHtml(carName(l.car))}</td></tr>`;
    })
    .join('');
  return `<table class="league-table"><thead><tr><th>Track</th><th>Best lap</th><th>Who</th><th>Car</th></tr></thead><tbody>${body}</tbody></table>`;
}

export class LeagueScreen {
  private readonly root = document.createElement('div');
  private readonly body = document.createElement('div');
  private readonly tabButtons = new Map<LeagueTab, HTMLButtonElement>();
  private tables: LeagueResponse | null = null;
  private tab: LeagueTab = 'week';

  constructor(parent: HTMLElement, private readonly carName: (id: string) => string, private readonly trackName: (id: string) => string) {
    this.root.className = 'modal';
    this.root.hidden = true;
    const box = document.createElement('div');
    box.className = 'modal-box league';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'modal-close';
    close.dataset.action = 'close';
    close.textContent = '×';
    close.addEventListener('click', () => this.close());
    const title = document.createElement('h2');
    title.className = 'league-title';
    title.textContent = '🏆 The League';
    const tabs = document.createElement('div');
    tabs.className = 'tab-row';
    for (const t of LEAGUE_TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.dataset.tab = t;
      b.textContent = TAB_LABEL[t];
      b.addEventListener('click', () => {
        b.blur();
        this.show(t);
      });
      this.tabButtons.set(t, b);
      tabs.appendChild(b);
    }
    this.body.className = 'league-body';
    box.append(close, title, tabs, this.body);
    this.root.appendChild(box);
    this.root.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === this.root) this.close();
    });
    parent.appendChild(this.root);
  }

  /** Open with fresh tables from the host (or the given ones, for screenshots). */
  async open(tables?: LeagueResponse): Promise<void> {
    this.root.hidden = false;
    this.body.innerHTML = '<p class="empty">Asking the host…</p>';
    this.tables = tables ?? (await fetchLeague());
    this.show(this.tab);
  }

  private show(tab: LeagueTab): void {
    this.tab = tab;
    for (const [t, b] of this.tabButtons) b.classList.toggle('on', t === tab);
    const t = this.tables;
    if (!t) this.body.innerHTML = '<p class="empty">Could not reach the host.</p>';
    else if (!t.enabled) this.body.innerHTML = '<p class="empty">This server keeps no league.</p>';
    else this.body.innerHTML = leagueTabHtml(t, tab, this.carName, this.trackName);
  }

  close(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.root.remove();
  }
}

async function fetchLeague(): Promise<LeagueResponse | null> {
  try {
    const res = await fetch('/league/tables.json', { cache: 'no-store' });
    return res.ok ? ((await res.json()) as LeagueResponse) : null;
  } catch {
    return null;
  }
}
