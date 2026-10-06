// Shared browser launcher for shots/jitter. Tries the installed Chrome, then Edge, then a
// plain Chromium binary: BROWSER_PATH if set, else the Playwright bundle under
// PLAYWRIGHT_BROWSERS_PATH (cloud/CI containers have no Chrome but ship that one).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const CHANNELS = ['chrome', 'msedge'];

function chromiumBinaries() {
  const out = [];
  if (process.env.BROWSER_PATH) out.push(process.env.BROWSER_PATH);
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    out.push(path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium'));
  }
  return out.filter((p) => existsSync(p));
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
