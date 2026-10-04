import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@escape/shared';
import { RaceRoom } from './rooms/RaceRoom';

export interface StartOptions {
  port: number;
  /** Interface to bind; `0.0.0.0` for the LAN. */
  host: string;
  /** Built client folder to serve (production). Omit in dev: Vite serves the page. */
  clientDir?: string | undefined;
  /** Install Ctrl+C handlers (the real server yes, tests no). */
  handleSignals?: boolean;
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
  const transport = new WebSocketTransport();
  const server = new Server({
    transport,
    greet: false,
    gracefullyShutdown: opts.handleSignals ?? false,
    express: (app) => {
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
  await matchMaker.createRoom(ROOM_NAME, {});

  const address = transport.server?.address() as AddressInfo | null;
  return {
    port: address?.port ?? opts.port,
    close: () => server.gracefullyShutdown(false),
  };
}
