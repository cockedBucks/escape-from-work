import { Room, type Client } from '@colyseus/core';
import { loadTuningFile } from '../config';
import { PlayerState, RaceState } from '../schema/RaceState';

/** The one room of the server: for now it only tracks who is connected. */
export class RaceRoom extends Room<{ state: RaceState }> {
  // The server creates this room at startup; it must survive being empty.
  override autoDispose = false;
  override state = new RaceState();

  override onCreate(): void {
    // Read from disk here, never from client-supplied options.
    const tuning = loadTuningFile();
    this.setPatchRate(tuning.net.patchRateMs);
  }

  override onJoin(client: Client): void {
    this.state.players.set(client.sessionId, new PlayerState());
    console.log(`[room] join  ${client.sessionId} (${this.state.players.size} connected)`);
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    console.log(`[room] leave ${client.sessionId} (${this.state.players.size} connected)`);
  }
}
