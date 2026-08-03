import { Router, Request, Response } from 'express';
import { SettingsStore } from '../services/settingsStore.js';
import { WatchService } from '../services/watchService.js';

export function createSettingsRouter(
  settingsStore: SettingsStore,
  watchService: WatchService,
  onChange?: (settings: { gitWatchEnabled: boolean }) => void,
): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json({ gitWatchEnabled: watchService.isGitPollingEnabled() });
  });

  router.put('/git-watch', (req: Request, res: Response) => {
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled (boolean) is required' });
      return;
    }

    settingsStore.update({ gitWatchEnabled: enabled });
    watchService.setGitPollingEnabled(enabled);
    onChange?.({ gitWatchEnabled: enabled });

    res.json({ gitWatchEnabled: enabled });
  });

  return router;
}
