import { describe, expect, it } from 'vitest';
import { podiumHtml, resultsHtml, type ResultsView } from './resultsScreen';

const view = (over: Partial<ResultsView> = {}): ResultsView => ({
  cars: [
    { slot: 1, place: 2, finished: true, dnf: false, finishMs: 110500, bestLapMs: 35100, bot: false },
    { slot: 0, place: 1, finished: true, dnf: false, finishMs: 108200, bestLapMs: 35400, bot: false },
    { slot: 2, place: 3, finished: false, dnf: true, finishMs: 0, bestLapMs: 0, bot: true },
  ],
  players: [
    { name: 'Dina', slot: 0, seat: 'pilot' },
    { name: 'Omar', slot: 0, seat: 'engineer' },
    { name: 'Sara', slot: 1, seat: 'solo' },
  ],
  teams: ['Ctrl Freaks', '404 Not Found', 'Merge Conflict'],
  myId: 'me',
  host: 'me',
  hostName: 'Me',
  ...over,
});

describe('results', () => {
  it('lists places in order with times, DNF and the fastest lap marked', () => {
    const html = resultsHtml(view());
    const table = html.slice(html.indexOf('<table')); // the podium above shows 2nd, 1st, 3rd
    const order = ['Ctrl Freaks', '404 Not Found', 'Merge Conflict'].map((t) => table.indexOf(t));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain('1:48.2');
    expect(html).toContain('DNF');
    expect(html).toMatch(/fastest">0:35.1 ⚡/);
    expect(html).toContain('Dina &amp; Omar');
    expect(html).toContain('🤖 Bot');
  });

  it('host gets Rematch and Lobby; others wait', () => {
    expect(resultsHtml(view())).toContain('REMATCH');
    const guest = resultsHtml(view({ myId: 'x' }));
    expect(guest).not.toContain('REMATCH');
    expect(guest).toContain('Waiting for <strong>Me</strong>');
  });

  it('puts the top three on a podium (2nd, 1st, 3rd) with their heads; a solo car gets the duck', () => {
    const v = view({
      cars: [
        { slot: 0, place: 1, finished: true, dnf: false, finishMs: 100000, bestLapMs: 33000, bot: false },
        { slot: 1, place: 2, finished: true, dnf: false, finishMs: 101000, bestLapMs: 33500, bot: false },
        { slot: 2, place: 3, finished: true, dnf: false, finishMs: 102000, bestLapMs: 34000, bot: true },
      ],
      players: [
        { name: 'Dina', slot: 0, seat: 'pilot', face: 'dina photo.jpg' },
        { name: 'Omar', slot: 0, seat: 'engineer' },
        { name: 'Sara', slot: 1, seat: 'solo' },
      ],
    });
    const html = podiumHtml(v);
    expect(html.indexOf('class="step p2"')).toBeLessThan(html.indexOf('class="step p1"'));
    expect(html.indexOf('class="step p1"')).toBeLessThan(html.indexOf('class="step p3"'));
    expect(html).toContain("url('/faces/dina%20photo.jpg')");
    expect(html).toContain('🦆'); // Sara drives solo
    expect(html).toContain('🤖'); // the bot car
    expect(resultsHtml(v)).toContain('class="podium"');
  });

  it('no podium when nobody finished', () => {
    expect(podiumHtml(view({ cars: [{ slot: 0, place: 1, finished: false, dnf: true, finishMs: 0, bestLapMs: 0, bot: false }] }))).toBe('');
  });
});
