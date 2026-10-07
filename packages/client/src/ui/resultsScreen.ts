// Results (P3.6): positions, race time, best lap; Rematch and Lobby for the host.
// Awards and league points join in P9.
import { awardLine, DUCK_AWARD, pointsFor, type LeagueTuning, type RaceRecord } from '@escape/shared';
import { TEAM_COLORS } from '../render/look';
import { ordinal } from './raceHud';
import { raceTime } from './scoreboard';
import { escapeHtml } from './html';
import { nameOf, t } from '../i18n';

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
  players: { name: string; slot: number; seat: string; face?: string }[];
  teams: readonly string[];
  myId: string;
  host: string;
  hostName: string;
  /** The race's league record (points and awards), once the server sent it. */
  record?: RaceRecord | null;
  league?: LeagueTuning;
}

export interface ResultsHandlers {
  rematch(): void;
  lobby(): void;
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** One bobblehead on the podium: the player's face photo, else a drawn smiley. */
function headHtml(name: string, face: string | undefined, i: number): string {
  const photo = face ? `background-image:url('/faces/${encodeURIComponent(face)}');` : '';
  return `<span class="bobble${face ? ' photo' : ''}" title="${escapeHtml(name)}" style="${photo}--i:${i}">${face ? '' : '🙂'}</span>`;
}

/** The top three on a podium (2nd, 1st, 3rd), heads bobbling on top. Pure, tested. */
export function podiumHtml(v: ResultsView): string {
  const top = v.cars.filter((c) => c.finished && c.place >= 1 && c.place <= 3);
  if (top.length === 0) return '';
  const step = (place: number): string => {
    const c = top.find((x) => x.place === place);
    if (!c) return `<div class="step empty p${place}"></div>`;
    const inCar = v.players.filter((p) => p.slot === c.slot && p.seat !== '');
    const heads = c.bot
      ? ['<span class="bobble">🤖</span>']
      : inCar.map((p, i) => headHtml(p.name, p.face, i));
    if (!c.bot && inCar.length === 1) heads.push('<span class="bobble duck">🦆</span>');
    const team = escapeHtml(v.teams[c.slot] ?? t('team.default', { n: c.slot + 1 }));
    return `<div class="step p${place}" style="--team:${hex(TEAM_COLORS[c.slot % TEAM_COLORS.length]!)}">
      <div class="heads">${heads.join('')}</div><div class="block"><b>${place}</b><span>${team}</span></div></div>`;
  };
  return `<div class="podium">${step(2)}${step(1)}${step(3)}</div>`;
}

/** The awards of the race: icon, title, who and why (up to 3 plus the duck). Pure, tested. */
export function awardsHtml(record: RaceRecord, league: LeagueTuning, teams: readonly string[]): string {
  const items = record.awards.map((a) => {
    const car = record.cars.find((c) => c.slot === a.slot);
    if (!car) return '';
    const rule = a.id === DUCK_AWARD ? null : league.awards.find((r) => r.id === a.id);
    if (a.id !== DUCK_AWARD && !rule) return '';
    const title = rule ? nameOf(`award.${rule.id}.title`, rule.title) : nameOf('award.duck.title', league.duck.title);
    const icon = rule ? rule.icon : league.duck.icon;
    const line = rule ? awardLine({ ...rule, line: nameOf(`award.${rule.id}.line`, rule.line) }, car.counts) : nameOf('award.duck.line', league.duck.line);
    const team = escapeHtml(teams[car.slot] ?? car.team);
    const who = car.bot ? t('board.bot') : escapeHtml(car.players.map((p) => p.name).join(' & '));
    return `<li class="award${a.id === DUCK_AWARD ? ' duck' : ''}" style="--team:${hex(TEAM_COLORS[car.slot % TEAM_COLORS.length]!)}">
      <span class="award-icon">${escapeHtml(icon)}</span><b>${escapeHtml(title)}</b><span class="award-who">${team} · ${who}</span><small>${escapeHtml(line)}</small></li>`;
  });
  const list = items.filter(Boolean).join('');
  return list ? `<ul class="awards">${list}</ul>` : '';
}

/** The results panel HTML (pure, tested). */
export function resultsHtml(v: ResultsView): string {
  const cars = [...v.cars].sort((a, b) => (a.place || 99) - (b.place || 99) || a.slot - b.slot);
  const laps = cars.map((c) => c.bestLapMs).filter((ms) => ms > 0);
  const fastest = laps.length > 0 ? Math.min(...laps) : 0;
  const rows = cars.map((c) => {
    const inCar = v.players.filter((p) => p.slot === c.slot && p.seat !== '');
    const pilot = inCar.find((p) => p.seat === 'pilot' || p.seat === 'solo');
    const engineer = inCar.find((p) => p.seat === 'engineer');
    const who = c.bot ? t('board.bot') : escapeHtml([pilot?.name, engineer?.name].filter(Boolean).join(' & ')) || '—';
    const time = c.finished ? raceTime(c.finishMs) : t('board.dnf');
    const best = c.bestLapMs > 0 ? raceTime(c.bestLapMs) : '—';
    const isFastest = c.bestLapMs > 0 && c.bestLapMs === fastest;
    const recCar = v.record?.cars.find((r) => r.slot === c.slot);
    const points = recCar && v.league ? pointsFor(recCar, v.league) : null;
    const pointsCell = v.record && v.league ? `<td class="r-points">${points ? `+${points}` : c.bot ? '' : '0'}</td>` : '';
    return `<tr class="${c.place === 1 ? 'winner' : ''}" style="--team:${hex(TEAM_COLORS[c.slot % TEAM_COLORS.length]!)}">
      <td class="r-place">${c.place > 0 ? ordinal(c.place) : ''}</td>
      <td class="r-team">${escapeHtml(v.teams[c.slot] ?? t('team.default', { n: c.slot + 1 }))}<small>${who}</small></td>
      <td class="r-time">${time}</td>
      <td class="r-best${isFastest ? ' fastest' : ''}">${best}${isFastest ? ' ⚡' : ''}</td>${pointsCell}</tr>`;
  });
  const actions =
    v.myId === v.host
      ? `<button class="big start" data-action="rematch">${t('lobby.rematch')}</button><button class="big" data-action="lobby">${t('results.lobby')}</button>`
      : `<p class="waiting">${t('results.waiting', { host: escapeHtml(v.hostName) })}</p>`;
  const pointsHead = v.record && v.league ? `<th>${t('results.points')}</th>` : '';
  const awards = v.record && v.league ? awardsHtml(v.record, v.league, v.teams) : '';
  return `${podiumHtml(v)}<table><thead><tr><th></th><th>${t('board.team')}</th><th>${t('results.time')}</th><th>${t('results.bestLap')}</th>${pointsHead}</tr></thead><tbody>${rows.join('')}</tbody></table>${awards}
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
    title.textContent = t('results.title');
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
