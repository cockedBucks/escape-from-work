// Scoreboard (P3.5): hold Tab. Place, team, players, lap and gap to the leader.
import type { RacePhase } from '@escape/shared';
import { TEAM_COLORS } from '../render/look';
import { escapeHtml } from './html';

export interface BoardCar {
  slot: number;
  place: number;
  lapsDone: number;
  finished: boolean;
  dnf: boolean;
  gapMs: number;
  finishMs: number;
  bestLapMs: number;
  bot: boolean;
}

export interface BoardPlayer {
  name: string;
  slot: number;
  seat: string;
}

export interface BoardRow {
  place: string;
  team: string;
  color: string;
  players: string;
  lap: string;
  gap: string;
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** 72345 ms → "1:12.3". */
export function raceTime(ms: number): string {
  const tenths = Math.round(ms / 100);
  const min = Math.floor(tenths / 600);
  const sec = (tenths % 600) / 10;
  return `${min}:${sec.toFixed(1).padStart(4, '0')}`;
}

export function boardRows(cars: BoardCar[], players: BoardPlayer[], teams: readonly string[], laps: number, phase: RacePhase): BoardRow[] {
  const racing = phase === 'racing' || phase === 'results';
  const sorted = [...cars].sort((a, b) =>
    racing && a.place > 0 && b.place > 0 ? a.place - b.place : a.slot - b.slot,
  );
  return sorted.map((c) => {
    const inCar = players.filter((p) => p.slot === c.slot && p.seat !== '');
    const pilot = inCar.find((p) => p.seat === 'pilot' || p.seat === 'solo');
    const engineer = inCar.find((p) => p.seat === 'engineer');
    const names = c.bot ? '🤖 Bot' : [pilot?.name, engineer?.name].filter(Boolean).join(' & ') || '—';
    let lap = '';
    let gap = '';
    if (racing) {
      lap = c.dnf ? 'DNF' : c.finished ? 'FIN' : `${Math.min(c.lapsDone + 1, laps)}/${laps}`;
      gap = c.finished ? raceTime(c.finishMs) : c.place === 1 ? 'leader' : c.dnf || c.gapMs === 0 ? '' : `+${(c.gapMs / 1000).toFixed(1)}s`;
    }
    return {
      place: racing && c.place > 0 ? String(c.place) : '',
      team: teams[c.slot] ?? `Team ${c.slot + 1}`,
      color: hex(TEAM_COLORS[c.slot % TEAM_COLORS.length]!),
      players: names,
      lap,
      gap,
    };
  });
}

/** Hold Tab to see it. Updates only while visible, and only when the rows change. */
export class Scoreboard {
  private readonly el = document.createElement('div');
  private rows: BoardRow[] = [];
  private lastHtml = '';

  constructor(parent: HTMLElement) {
    this.el.className = 'scoreboard';
    this.el.hidden = true;
    parent.appendChild(this.el);
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  private readonly onDown = (e: KeyboardEvent): void => {
    // In a text field Tab keeps its normal job (next field).
    if (e.code !== 'Tab' || e.target instanceof HTMLInputElement) return;
    e.preventDefault(); // Tab must not move focus around the page
    this.el.hidden = false;
    this.render();
  };

  private readonly onUp = (e: KeyboardEvent): void => {
    if (e.code === 'Tab') this.el.hidden = true;
  };

  private readonly onBlur = (): void => {
    this.el.hidden = true;
  };

  update(rows: BoardRow[]): void {
    this.rows = rows;
    if (!this.el.hidden) this.render();
  }

  private render(): void {
    const body = this.rows
      .map(
        (r) => `<tr style="--team:${r.color}"><td class="sb-place">${r.place}</td><td class="sb-team">${escapeHtml(r.team)}</td>` +
          `<td>${escapeHtml(r.players)}</td><td>${r.lap}</td><td class="sb-gap">${r.gap}</td></tr>`,
      )
      .join('');
    const html = `<table><thead><tr><th>#</th><th>Team</th><th>Players</th><th>Lap</th><th>Gap</th></tr></thead><tbody>${body}</tbody></table>`;
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.el.innerHTML = html;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
    this.el.remove();
  }
}
