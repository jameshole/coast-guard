import { Router, Request, Response } from 'express';
import { GitService } from '../services/gitService.js';

export function createGitRouter(gitService: GitService): Router {
  const router = Router();

  // Check if directory is a git repo
  router.get('/check', async (_req: Request, res: Response) => {
    try {
      const isRepo = await gitService.isGitRepo();
      res.json({ isGitRepo: isRepo });
    } catch (error) {
      res.json({ isGitRepo: false });
    }
  });

  // Get current branch
  router.get('/branch', async (_req: Request, res: Response) => {
    try {
      const branch = await gitService.getBranch();
      res.json({ branch });
    } catch (error) {
      res.json({ branch: null });
    }
  });

  // Get git status (modified, staged, untracked files)
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const status = await gitService.getStatus();
      res.json(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get diff for a specific file
  router.get('/diff', async (req: Request, res: Response) => {
    try {
      const file = req.query.file as string;

      if (!file) {
        res.status(400).json({ error: 'File path is required' });
        return;
      }

      const ignoreWhitespace = req.query.ignoreWhitespace === 'true';
      const diff = await gitService.getFileDiff(file, ignoreWhitespace);
      res.json(diff);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get all changed files with their status
  router.get('/changed-files', async (_req: Request, res: Response) => {
    try {
      const changedFiles = await gitService.getAllChangedFiles();
      res.json(Object.fromEntries(changedFiles));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
