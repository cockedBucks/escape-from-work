import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { leagueTables, ROOM_NAME } from '@escape/shared';
import { watchConfig } from './dev/configWatcher';
import { FACES_DIR } from './faces';
import { league, setLeague } from './league/league';
import { localIso } from './league/record';
import { LeagueStore } from './league/store';
import { listMenuImages, MENU_DIR } from './menuImages';
import { installTuningRoutes } from './dev/tuningRoutes';
import { LiveConfig, setLiveConfig } from './liveConfig';
import { RaceRoom, SERVER_ROOM_KEY } from './rooms/RaceRoom';

export interface StartOptions {
  port: number;
  /** Interface to bind; `0.0.0.0` for the LAN. */
  host: string;
  /** Built client folder to serve (production). Omit in dev: Vite serves the page. */
  clientDir?: string | undefined;
  /** Install Ctrl+C handlers (the real server yes, tests no). */
  handleSignals?: boolean;
  /** Dev tools: the F2 tuning endpoints. Never in production. */
  dev?: boolean;
  /** Dev: watch the config folder and hot-reload edits. */
  watchConfig?: boolean;
  /** Config folder (tests use a temporary copy). Default: the repo's config/. */
  configDir?: string | undefined;
  /** League file to record races into (the real server: data/league.json). Omit = no league (tests). */
  leagueFile?: string | undefined;
}

export interface GameServer {
  /** Actual bound port (useful when started with port 0 in tests). */
  port: number;
  close(): Promise<void>;
}

/**
 * Colyseus only attaches its 'error' listener after a successful listen, so a busy port
 * (EADDRINUSE) would become an uncaught exception and hang the process. Catch it ourselves.
 */
function listenOrFail(server: Server, transport: WebSocketTransport, opts: StartOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const http = transport.server;
    http?.once('error', reject);
    server.listen(opts.port, opts.host).then(() => {
      http?.off('error', reject);
      resolve();
    }, reject);
  });
}

/** Start Express + Colyseus and create the one `race` room. Used by index.ts and tests. */
export async function startServer(opts: StartOptions): Promise<GameServer> {
  const live = new LiveConfig(opts.configDir);
  setLiveConfig(live);
  setLeague(opts.leagueFile === undefined ? null : new LeagueStore(opts.leagueFile));
  const dev = (opts.dev ?? false) && process.env['NODE_ENV'] !== 'production';
  const transport = new WebSocketTransport();
  const server = new Server({
    transport,
    greet: false,
    gracefullyShutdown: opts.handleSignals ?? false,
    express: (app) => {
      // Bobblehead faces (coworker photos on this PC) for the page, dev and production.
      app.use('/faces', express.static(FACES_DIR, { index: false }));
      // A short 404/403, never Express's default error page (it shows local paths in dev).
      app.use('/faces', (_req, res) => {
        res.status(404).type('text').send('no such face');
      });
      // League tables for the League screen (P9.4), computed from the history on each request.
      app.get('/league/tables.json', (_req, res) => {
        const store = league();
        res.set('Cache-Control', 'no-store');
        res.json(store ? { enabled: true, ...leagueTables(store.data, live.tuning.league, localIso(new Date())) } : { enabled: false });
      });
      // Main menu slideshow (P8.1): the list is read on every request, so new images just appear.
      app.get('/menu/menu.json', (_req, res) => {
        res.json({ images: listMenuImages() });
      });
      app.use('/menu', express.static(MENU_DIR, { index: false }));
      app.use('/menu', (_req, res) => {
        res.status(404).type('text').send('no such image');
      });
      if (dev) installTuningRoutes(app, live);
      const dir = opts.clientDir;
      if (dir !== undefined && existsSync(dir)) {
        app.use(express.static(dir));
      } else {
        app.get('/', (_req, res) => {
          res.type('text/plain').send('Game server is running. In dev, open the page from the Vite URL.');
        });
      }
    },
  });
  server.define(ROOM_NAME, RaceRoom);
  await listenOrFail(server, transport, opts);
  await matchMaker.createRoom(ROOM_NAME, { key: SERVER_ROOM_KEY });
  const watcher = dev && opts.watchConfig ? watchConfig(live) : null;

  const address = transport.server?.address() as AddressInfo | null;
  return {
    port: address?.port ?? opts.port,
    close: () => {
      watcher?.close();
      return server.gracefullyShutdown(false);
    },
  };
}
