import { Router, Request, Response } from 'express';
import { FileService } from '../services/fileService.js';

export function createFilesRouter(fileService: FileService): Router {
  const router = Router();

  // Get directory tree
  router.get('/tree', async (req: Request, res: Response) => {
    try {
      const path = (req.query.path as string) || '';
      const depth = parseInt(req.query.depth as string) || 1;

      const tree = await fileService.getTree(path, depth);
      res.json(tree);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ error: message });
    }
  });

  // Get file content
  router.get('/content', async (req: Request, res: Response) => {
    try {
      const path = req.query.path as string;

      if (!path) {
        res.status(400).json({ error: 'Path is required' });
        return;
      }

      const content = await fileService.getContent(path);
      res.json({ content });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ error: message });
    }
  });

  // Get all files (for search)
  router.get('/all', async (_req: Request, res: Response) => {
    try {
      const files = await fileService.getAllFiles();
      res.json(files);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
