import { describe, expect, it } from 'vitest';
import realTuning from '../../../../config/tuning.json';
import { parseTuning } from '@escape/shared';
import { FAKE_RECORD, FAKE_TABLES } from '../scenarioLeague';
import { dayLabel, leagueTabHtml } from './leagueScreen';
import { awardsHtml, resultsHtml } from './resultsScreen';

const league = parseTuning(realTuning).league;
const carName = (id: string): string => `car:${id}`;
const trackName = (id: string): string => `track:${id}`;

describe('league screen', () => {
  it('this week: the cup start day and the rows, medals for the top three', () => {
    const html = leagueTabHtml(FAKE_TABLES, 'week', carName, trackName);
    expect(html).toContain('Sun 4 Oct');
    expect(html.indexOf('Dina')).toBeLessThan(html.indexOf('Omar'));
    expect(html).toContain('🥇');
    expect(html).toContain('4.');
  });

  it('duos, lap records (with car and track names; a bot record says beat it) and empty tables', () => {
    expect(leagueTabHtml(FAKE_TABLES, 'duos', carName, trackName)).toContain('Dina &amp; Omar');
    const laps = leagueTabHtml(FAKE_TABLES, 'laps', carName, trackName);
    expect(laps).toContain('track:office');
    expect(laps).toContain('car:hot-fix');
    expect(laps).toContain('0:38.4');
    expect(laps).toContain('beat it');
    const empty = { ...FAKE_TABLES, week: { start: '2026-10-04', rows: [] }, duos: [], laps: [] };
    expect(leagueTabHtml(empty, 'week', carName, trackName)).toContain('No races this week');
    expect(leagueTabHtml(empty, 'duos', carName, trackName)).toContain('No duos');
  });

  it('names escape HTML', () => {
    const evil = { ...FAKE_TABLES, allTime: [{ ...FAKE_TABLES.allTime[0]!, name: '<img onerror=x>' }] };
    expect(leagueTabHtml(evil, 'allTime', carName, trackName)).not.toContain('<img');
  });

  it('labels a week start day', () => {
    expect(dayLabel('2026-10-04')).toBe('Sun 4 Oct');
  });
});

describe('results: points and awards', () => {
  it('shows each award with its icon, who and the line; the duck last', () => {
    const html = awardsHtml(FAKE_RECORD, league, ['A', 'B', 'C', 'D', 'E']);
    expect(html).toContain('🧱');
    expect(html).toContain('bounced off 9 walls');
    expect(html).toContain('Omar &amp; Karim');
    expect(html.lastIndexOf('Rubber Duck of Shame')).toBeGreaterThan(html.indexOf('Drift King'));
    expect(html).toContain('class="award duck"');
  });

  it('a points column only once the record arrived', () => {
    const base = {
      cars: FAKE_RECORD.cars.map((c) => ({ slot: c.slot, place: c.place, finished: c.finished, dnf: c.dnf, finishMs: c.finishMs, bestLapMs: c.bestLapMs, bot: c.bot })),
      players: [], teams: ['A', 'B', 'C', 'D', 'E'], myId: 'me', host: 'me', hostName: 'Me',
    };
    expect(resultsHtml(base)).not.toContain('Points');
    const withRecord = resultsHtml({ ...base, record: FAKE_RECORD, league });
    expect(withRecord).toContain('<th>Points</th>');
    expect(withRecord).toContain('+10');
  });
});
