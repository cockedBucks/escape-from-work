// The main menu flow (P8.1): turntable showroom behind the menu, music, HONK, slideshow.
// Resolves when the player presses PLAY (the `menu` scenario never does).
import type { CarDef, QualityPreset, Tuning } from '@escape/shared';
import type { HornPlayer } from './audio/horn';
import { MusicLoop } from './audio/music';
import { MainMenu } from './ui/mainMenu';
import { VolumePanel } from './ui/volumePanel';
import { SettingsScreen } from './ui/settingsScreen';
import { LeagueScreen, type LeagueResponse } from './ui/leagueScreen';
import { loadSeasons, trackName } from './content';
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

export function showMainMenu(opts: MenuOptions): Promise<void> {
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
    const menu = new MainMenu(document.body, {
      onPlay: () => {
        if (done) return;
        done = true;
        cancelAnimationFrame(frame);
        music.dispose();
        volume.dispose();
        settingsScreen.dispose();
        leagueScreen.dispose();
        menu.dispose();
        showroom.dispose();
        stageEl.remove();
        resolve();
      },
      onLeague: () => void leagueScreen.open(),
      onPad: () => {
        window.location.search = '?pad';
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
