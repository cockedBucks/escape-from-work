// Shared browser launcher for shots/jitter. Tries the installed Chrome, then Edge, then a
// plain Chromium binary: BROWSER_PATH if set, else the Playwright bundle under
// PLAYWRIGHT_BROWSERS_PATH (cloud/CI containers have no Chrome but ship that one).
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const CHANNELS = ['chrome', 'msedge'];

/** Where the Chromium program sits inside a Playwright `chromium-<version>` folder, per OS. */
const BUNDLE_EXES = [
  ['chrome-linux', 'chrome'],
  ['chrome-win', 'chrome.exe'],
  ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
];

function chromiumBinaries() {
  const out = [];
  if (process.env.BROWSER_PATH) out.push(process.env.BROWSER_PATH);
  const bundles = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (bundles && existsSync(bundles)) {
    // Some containers link `chromium` straight to the program; otherwise look in chromium-<version>/.
    out.push(path.join(bundles, 'chromium'));
    for (const dir of readdirSync(bundles).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
      for (const parts of BUNDLE_EXES) out.push(path.join(bundles, dir, ...parts));
    }
  }
  return out.filter((p) => existsSync(p) && statSync(p).isFile());
}

/** Returns { browser, channel } or throws listing every attempt. */
export async function launchBrowser({ headless = true, args = [] } = {}) {
  const errors = [];
  for (const channel of CHANNELS) {
    try {
      return { browser: await chromium.launch({ channel, headless, args }), channel };
    } catch (err) {
      errors.push(`${channel}: ${String(err).split('\n')[0]}`);
    }
  }
  for (const executablePath of chromiumBinaries()) {
    try {
      return { browser: await chromium.launch({ executablePath, headless, args }), channel: 'chromium' };
    } catch (err) {
      errors.push(`${executablePath}: ${String(err).split('\n')[0]}`);
    }
  }
  throw new Error(`no Chrome, Edge or Chromium found:\n${errors.join('\n')}`);
}
