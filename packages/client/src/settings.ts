// Player settings (P8.2), per browser: picture quality and the FPS counter. Volumes live in the
// mixer (`efw.volumes`) and the default camera in `efw.camera`; this file brings them together
// for the settings screen. Everything falls back to defaults when storage is blocked or junk.
import type { QualityLevel } from '@escape/shared';

/** `auto` = the server config's default preset (`quality.default`). */
export type QualitySetting = 'auto' | QualityLevel;
export const QUALITY_SETTINGS = ['auto', 'low', 'medium', 'high'] as const satisfies readonly QualitySetting[];

export interface Settings {
  quality: QualitySetting;
  showFps: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = { quality: 'auto', showFps: false };

const KEY = 'efw.settings';

export function parseSettings(raw: string | null): Settings {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>;
  } catch {
    // corrupt: defaults
  }
  const quality = (QUALITY_SETTINGS as readonly unknown[]).includes(data.quality) ? (data.quality as QualitySetting) : DEFAULT_SETTINGS.quality;
  const showFps = typeof data.showFps === 'boolean' ? data.showFps : DEFAULT_SETTINGS.showFps;
  return { quality, showFps };
}

export function loadSettings(): Settings {
  try {
    return parseSettings(window.localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage blocked: applies until the page reloads
  }
}
