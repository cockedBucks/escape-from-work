// Phone controller page (P11.5): `/?pad` (or the menu's "Use this phone as a controller" on a
// touch screen). Joins the race room like a laptop (your seat is held over a reload), sends the
// same input messages, and buzzes the phone when your car is hit. No 3D.
import { MSG, carIdForSlot, type LobbyError, type SimEvent, type Tuning } from '@escape/shared';
import { botSlotsOf, joinOrReconnect } from '../net/connection';
import { hudText } from '../ui/raceHud';
import { savedName } from '../ui/lobbyScreen';
import { PadControls } from './padControls';
import { PadScreen, type PadPlayer, type PadView } from './padScreen';

/** Buzz patterns (ms): hit by an item, a hard wall hit, the swap lane. */
const BUZZ = { hit: 160, wall: 40, swap: [60, 40, 60] } as const;
/** A wall hit at least this fast (m/s) buzzes. */
const BUZZ_WALL_SPEED = 8;

const buzz = (pattern: number | readonly number[]): void => {
  try {
    navigator.vibrate?.(pattern as number | number[]);
  } catch {
    // no vibration motor or not allowed: fine
  }
};

export async function showPad(container: HTMLElement, tuning: Tuning): Promise<void> {
  const room = await joinOrReconnect(tuning);
  for (const type of [MSG.tuning, MSG.reload, MSG.raceRecord]) room.onMessage(type, () => {});
  const controls = new PadControls((msg) => room.send(MSG.input, msg), tuning.net.inputResendMs);
  const name = savedName() ?? '';
  if (name) room.send(MSG.setName, { name });
  const screen = new PadScreen(container, controls, {
    setName: (n) => room.send(MSG.setName, { name: n }),
    setSeat: (slot, seat) => room.send(MSG.setSeat, { slot, seat }),
    setReady: (ready) => room.send(MSG.ready, { ready }),
    start: () => room.send(MSG.hostStart, {}),
  }, name);
  room.onMessage(MSG.lobbyError, (e: LobbyError) => screen.showError(e.reason));
  let myCarId: string | null = null;
  room.onMessage(MSG.events, (events: SimEvent[]) => {
    for (const e of events) {
      if (e.type === 'itemHit' && e.car === myCarId && !e.blocked) buzz(BUZZ.hit);
      else if (e.type === 'wallHit' && e.car === myCarId && e.speed >= BUZZ_WALL_SPEED) buzz(BUZZ.wall);
      else if (e.type === 'swap' && e.car === myCarId) buzz(BUZZ.swap);
    }
  });
  room.onStateChange((state) => {
    const me = state.players.get(room.sessionId);
    const slot = me?.slot ?? -1;
    myCarId = slot >= 0 ? carIdForSlot(slot) : null;
    const car = myCarId === null ? undefined : state.cars.get(myCarId);
    const players: PadPlayer[] = [];
    state.players.forEach((p, id) => players.push({ id, name: p.name, slot: p.slot, seat: p.seat, ready: p.ready }));
    const view: PadView = {
      phase: state.phase,
      myId: room.sessionId,
      host: state.host,
      players,
      teams: [...state.teams],
      botSlots: botSlotsOf(state),
      maxCars: tuning.race.maxCars,
      role: me?.role ?? '',
      hud: hudText({
        phase: state.phase, tick: state.tick, phaseTick: state.phaseTick, dt: tuning.sim.dt,
        countdownSeconds: tuning.race.countdownSeconds, laps: state.laps, cars: state.cars.size,
        me: car ? { lapsDone: car.lapsDone, place: car.place, finished: car.finished, dnf: car.dnf, wrongWay: car.wrongWay, lives: car.lives, out: car.out } : null,
        mode: state.mode,
      }),
      car: car ? { speed: car.speed, heat: car.heat, nitro: car.nitro, item: car.item, stalled: car.stallLeft > 0 } : null,
    };
    screen.update(view);
  });
  // A hidden page (screen off, app switch) must not leave the gas held down.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) controls.releaseAll();
  });
  // Keep the screen on where the browser allows it (HTTPS or localhost only; on the office
  // LAN's http the tip on the seat page says to raise the screen timeout instead).
  try {
    await (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<unknown> } }).wakeLock?.request('screen');
  } catch {
    // not allowed here
  }
}
