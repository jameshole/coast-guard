import { Router, Request, Response } from 'express';
import { ScriptRunner } from '../services/scriptRunner.js';

export function createScriptsRouter(runner: ScriptRunner): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json(runner.listScripts());
  });

  router.get('/runs', (_req: Request, res: Response) => {
    res.json(runner.listRuns());
  });

  router.post('/:name/run', async (req: Request, res: Response) => {
    try {
      const state = await runner.run(req.params.name);
      res.json(state);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/runs/:runId/stop', async (req: Request, res: Response) => {
    try {
      await runner.stop(req.params.runId);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/runs/:runId/logs', (req: Request, res: Response) => {
    const logs = runner.getLogs(req.params.runId);
    res.json({ logs });
  });

  return router;
}
