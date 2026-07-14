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

  // List local branches (for the diff-base dropdown)
  router.get('/branches', async (_req: Request, res: Response) => {
    try {
      const branches = await gitService.listBranches();
      res.json({ branches });
    } catch (error) {
      res.json({ branches: [] });
    }
  });

  // Verify a ref exists (used to validate custom diff base input)
  router.get('/verify-ref', async (req: Request, res: Response) => {
    const ref = req.query.ref as string;
    if (!ref) {
      res.status(400).json({ error: 'ref is required' });
      return;
    }
    const valid = await gitService.verifyRef(ref);
    res.json({ valid });
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
      const baseRef = (req.query.baseRef as string) || 'HEAD';

      if (baseRef !== 'HEAD') {
        const valid = await gitService.verifyRef(baseRef);
        if (!valid) {
          res.status(400).json({ error: `Invalid git ref: ${baseRef}` });
          return;
        }
      }

      const diff = await gitService.getFileDiff(file, ignoreWhitespace, baseRef);
      res.json(diff);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get aggregate diff stats (insertions/deletions/files) for a base ref
  router.get('/diff-stats', async (req: Request, res: Response) => {
    try {
      const baseRef = (req.query.baseRef as string) || 'HEAD';

      if (baseRef !== 'HEAD') {
        const valid = await gitService.verifyRef(baseRef);
        if (!valid) {
          res.status(400).json({ error: `Invalid git ref: ${baseRef}` });
          return;
        }
      }

      const stats = await gitService.getDiffStats(baseRef);
      res.json(stats);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get per-line blame info for a file (working tree)
  router.get('/blame', async (req: Request, res: Response) => {
    try {
      const file = req.query.file as string;

      if (!file) {
        res.status(400).json({ error: 'File path is required' });
        return;
      }

      const blame = await gitService.getFileBlame(file);
      res.json(blame);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Get all changed files with their status
  router.get('/changed-files', async (req: Request, res: Response) => {
    try {
      const baseRef = (req.query.baseRef as string) || 'HEAD';

      if (baseRef !== 'HEAD') {
        const valid = await gitService.verifyRef(baseRef);
        if (!valid) {
          res.status(400).json({ error: `Invalid git ref: ${baseRef}` });
          return;
        }
      }

      const changedFiles = await gitService.getAllChangedFiles(baseRef);
      res.json(Object.fromEntries(changedFiles));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
