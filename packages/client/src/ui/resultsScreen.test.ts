import { describe, expect, it } from 'vitest';
import { resultsHtml, type ResultsView } from './resultsScreen';

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
    const order = ['Ctrl Freaks', '404 Not Found', 'Merge Conflict'].map((t) => html.indexOf(t));
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
});
