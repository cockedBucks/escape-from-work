import express, { type Application } from 'express';
import { TuningPostSchema } from '@escape/shared';
import type { LiveConfig } from '../liveConfig';

/** Request body limit: tuning.json is a few KB. */
const BODY_LIMIT = '256kb';

/**
 * Dev-only endpoints for the F2 tuning panel. Never installed in production.
 * - POST /dev/tuning `{ tuning, save }`: apply live (and write tuning.json when `save`).
 * - POST /dev/tuning/revert: throw away unsaved changes, reload tuning.json from disk.
 */
export function installTuningRoutes(app: Application, live: LiveConfig): void {
  app.use('/dev', express.json({ limit: BODY_LIMIT }));

  app.post('/dev/tuning', (req, res) => {
    const body = TuningPostSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ ok: false, error: 'expected { tuning, save }' });
      return;
    }
    try {
      if (body.data.save) live.saveTuning(body.data.tuning);
      else live.setTuning(body.data.tuning);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ ok: false, error: String(err instanceof Error ? err.message : err) });
    }
  });

  app.post('/dev/tuning/revert', (_req, res) => {
    try {
      live.reloadTuning();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err instanceof Error ? err.message : err) });
    }
  });
}
