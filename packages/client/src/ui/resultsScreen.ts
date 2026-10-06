// Results (P3.6): positions, race time, best lap; Rematch and Lobby for the host.
// Awards and league points join in P9.
import { TEAM_COLORS } from '../render/look';
import { ordinal } from './raceHud';
import { raceTime } from './scoreboard';
import { escapeHtml } from './html';

export interface ResultCar {
  slot: number;
  place: number;
  finished: boolean;
  dnf: boolean;
  finishMs: number;
  bestLapMs: number;
  bot: boolean;
}

export interface ResultsView {
  cars: ResultCar[];
  players: { name: string; slot: number; seat: string }[];
  teams: readonly string[];
  myId: string;
  host: string;
  hostName: string;
}

export interface ResultsHandlers {
  rematch(): void;
  lobby(): void;
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** The results panel HTML (pure, tested). */
export function resultsHtml(v: ResultsView): string {
  const cars = [...v.cars].sort((a, b) => (a.place || 99) - (b.place || 99) || a.slot - b.slot);
  const laps = cars.map((c) => c.bestLapMs).filter((ms) => ms > 0);
  const fastest = laps.length > 0 ? Math.min(...laps) : 0;
  const rows = cars.map((c) => {
    const inCar = v.players.filter((p) => p.slot === c.slot && p.seat !== '');
    const pilot = inCar.find((p) => p.seat === 'pilot' || p.seat === 'solo');
    const engineer = inCar.find((p) => p.seat === 'engineer');
    const who = c.bot ? '🤖 Bot' : escapeHtml([pilot?.name, engineer?.name].filter(Boolean).join(' & ')) || '—';
    const time = c.finished ? raceTime(c.finishMs) : 'DNF';
    const best = c.bestLapMs > 0 ? raceTime(c.bestLapMs) : '—';
    const isFastest = c.bestLapMs > 0 && c.bestLapMs === fastest;
    return `<tr class="${c.place === 1 ? 'winner' : ''}" style="--team:${hex(TEAM_COLORS[c.slot % TEAM_COLORS.length]!)}">
      <td class="r-place">${c.place > 0 ? ordinal(c.place) : ''}</td>
      <td class="r-team">${escapeHtml(v.teams[c.slot] ?? `Team ${c.slot + 1}`)}<small>${who}</small></td>
      <td class="r-time">${time}</td>
      <td class="r-best${isFastest ? ' fastest' : ''}">${best}${isFastest ? ' ⚡' : ''}</td></tr>`;
  });
  const actions =
    v.myId === v.host
      ? '<button class="big start" data-action="rematch">REMATCH</button><button class="big" data-action="lobby">Back to lobby</button>'
      : `<p class="waiting">Waiting for <strong>${escapeHtml(v.hostName)}</strong>: rematch or lobby</p>`;
  return `<table><thead><tr><th></th><th>Team</th><th>Time</th><th>Best lap</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    <div class="lobby-actions">${actions}</div>`;
}

export class ResultsScreen {
  private readonly root = document.createElement('div');
  private readonly body = document.createElement('div');
  private lastHtml = '';

  constructor(parent: HTMLElement, private readonly handlers: ResultsHandlers) {
    this.root.className = 'join results';
    this.root.hidden = true;
    const panel = document.createElement('div');
    panel.className = 'join-panel';
    const title = document.createElement('h2');
    title.textContent = 'Results — clocked out!';
    panel.append(title, this.body);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
    this.body.addEventListener('click', this.onClick);
  }

  private readonly onClick = (e: MouseEvent): void => {
    const action = (e.target as HTMLElement).closest('button')?.dataset['action'];
    if (action === 'rematch') this.handlers.rematch();
    else if (action === 'lobby') this.handlers.lobby();
  };

  /** Show (with the latest results) or hide. Redraws only when the content changes. */
  update(visible: boolean, view: ResultsView | null): void {
    this.root.hidden = !visible;
    if (!visible || !view) return;
    const html = resultsHtml(view);
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.body.innerHTML = html;
  }

  dispose(): void {
    this.root.remove();
  }
}
