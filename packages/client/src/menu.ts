// The main menu flow (P8.1): turntable showroom behind the menu, music, HONK, slideshow.
// HOST and JOIN (P12.1) open their windows; resolves with the game you got into (the `menu`
// scenario never does).
import type { Room } from '@colyseus/sdk';
import type { CarDef, GameListing, QualityPreset, Tuning } from '@escape/shared';
import type { HornPlayer } from './audio/horn';
import { MusicLoop } from './audio/music';
import { MainMenu } from './ui/mainMenu';
import { VolumePanel } from './ui/volumePanel';
import { SettingsScreen } from './ui/settingsScreen';
import { LeagueScreen, type LeagueResponse } from './ui/leagueScreen';
import { loadSeasons, loadTrack, pickableTracks, trackName } from './content';
import { HostScreen } from './ui/hostScreen';
import { JoinScreen } from './ui/joinScreen';
import { trackMapSvg } from './ui/trackMap';
import { savedName } from './ui/lobbyScreen';
import { fetchGames, hostGame, joinGame, type RaceStateView } from './net/connection';
import { t } from './i18n';
import { loadCameraMode, saveCameraMode } from './input/cameraPref';
import { loadSettings, saveSettings } from './settings';
import { Showroom } from './render/showroom';

export interface MenuOptions {
  tuning: Tuning;
  quality: QualityPreset;
  roster: readonly CarDef[];
  horns: HornPlayer;
  /** Called once the first frame is drawn (screenshot hooks). */
  onShown?: () => void;
  /** `league` scenario: open the League screen at once with these tables. */
  leagueTables?: LeagueResponse;
  /** `host` / `join` scenarios: open that window at once (`join` lists `games`). */
  open?: 'host' | 'join';
  games?: GameListing[];
}

/** Company images for the slideshow (an empty list when there are none or no server). */
async function fetchMenuImages(): Promise<string[]> {
  try {
    const res = await fetch('/menu/menu.json');
    if (!res.ok) return [];
    const data = (await res.json()) as { images?: unknown };
    return Array.isArray(data.images)
      ? data.images.filter((f): f is string => typeof f === 'string').map((f) => `/menu/${encodeURIComponent(f)}`)
      : [];
  } catch {
    return [];
  }
}

/** A track's mini map, '' for a track this page does not know (another server version). */
export function trackMap(id: string, tuning: Tuning): string {
  try {
    return trackMapSvg(loadTrack(id, tuning));
  } catch {
    return '';
  }
}

/** Why a host/join failed, in one short line. */
export const reasonOf = (err: unknown): string => String(err instanceof Error ? err.message : err).split('\n')[0] ?? '';

export function showMainMenu(opts: MenuOptions): Promise<Room<unknown, RaceStateView>> {
  return new Promise((resolve) => {
    const stageEl = document.createElement('div');
    stageEl.className = 'menu-stage';
    document.body.appendChild(stageEl);
    const showroom = new Showroom(stageEl, opts.tuning, opts.quality, opts.roster);
    const music = new MusicLoop(() => opts.horns.context, () => opts.horns.bus('music'));
    const settingsScreen = new SettingsScreen(document.body, {
      settings: loadSettings(),
      volumes: () => opts.horns.volumes,
      camera: loadCameraMode,
      inRace: false,
      seasons: loadSeasons().seasons,
      onSettings: (s) => saveSettings(s),
      onVolumes: (v) => opts.horns.setVolumes(v),
      onCamera: (mode) => saveCameraMode(mode),
    });
    const carName = (id: string): string => opts.roster.find((d) => d.id === id)?.name ?? id;
    const leagueScreen = new LeagueScreen(document.body, carName, trackName);
    const volume = new VolumePanel(document.body, () => opts.horns.volumes, (v) => opts.horns.setVolumes(v), () => settingsScreen.open('settings'));
    let frame = 0;
    let done = false;
    /** In a game: tear the menu down and hand the room over. */
    const enter = (room: Room<unknown, RaceStateView>): void => {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      music.dispose();
      volume.dispose();
      settingsScreen.dispose();
      leagueScreen.dispose();
      hostScreen.dispose();
      joinScreen.dispose();
      menu.dispose();
      showroom.dispose();
      stageEl.remove();
      resolve(room);
    };
    /** Host/join worked: no error to show. */
    const entered = (room: Room<unknown, RaceStateView>): null => {
      enter(room);
      return null;
    };
    const race = opts.tuning.race;
    const hostScreen = new HostScreen(
      document.body,
      {
        tracks: pickableTracks().map((tr) => ({ ...tr, map: trackMap(tr.id, opts.tuning) })),
        minLaps: race.minLaps,
        maxLaps: race.maxLaps,
        defaultLaps: race.defaultLaps,
        defaultName: savedName() ? t('host.defaultName', { name: savedName() ?? '' }) : t('host.defaultNameNoName'),
      },
      (settings) => hostGame(opts.tuning, settings).then(entered, reasonOf),
    );
    const fakeGames = opts.games;
    const joinScreen = new JoinScreen(document.body, {
      fetchGames: fakeGames ? () => Promise.resolve(fakeGames) : fetchGames,
      trackName,
      trackMap: (id) => trackMap(id, opts.tuning),
      join: (id) => joinGame(opts.tuning, id).then(entered, reasonOf),
      host: () => hostScreen.open(),
    });
    const menu = new MainMenu(document.body, {
      onHost: () => hostScreen.open(),
      onJoin: () => joinScreen.open(),
      onLeague: () => void leagueScreen.open(),
      onPad: () => {
        const params = new URLSearchParams(window.location.search);
        params.set('pad', '');
        window.location.search = params.toString();
      },
      onSettings: () => settingsScreen.open('settings'),
      onKeys: () => settingsScreen.open('keys'),
      onHonk: () => {
        const car = showroom.current;
        if (car) opts.horns.play(car.horn, 0);
      },
    });
    void fetchMenuImages().then((urls) => menu.setImages(urls));
    if (opts.leagueTables) void leagueScreen.open(opts.leagueTables);
    if (opts.open === 'host') hostScreen.open();
    if (opts.open === 'join') joinScreen.open();
    // Music starts once the browser allows sound (first click or key); retried each frame.
    let first = true;
    const loop = (now: number): void => {
      showroom.render(now);
      menu.setCar(showroom.current?.name ?? '');
      menu.update(now);
      music.setPlaying(true);
      if (first) {
        first = false;
        opts.onShown?.();
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
  });
}
