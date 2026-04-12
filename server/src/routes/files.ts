import { Router, Request, Response } from 'express';
import { FileService } from '../services/fileService.js';
import { TypeScriptService } from '../services/typescriptService.js';

export function createFilesRouter(fileService: FileService, tsService: TypeScriptService): Router {
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

  // Go to definition using TypeScript language service
  router.get('/definitions', (req: Request, res: Response) => {
    try {
      const filePath = req.query.filePath as string;
      const offset = parseInt(req.query.offset as string, 10);

      if (!filePath) {
        res.status(400).json({ error: 'filePath is required' });
        return;
      }
      if (isNaN(offset) || offset < 0) {
        res.status(400).json({ error: 'Valid offset is required' });
        return;
      }

      const results = tsService.getDefinition(filePath, offset);
      res.json(results);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Toggle markdown checkbox
  router.put('/checkbox', async (req: Request, res: Response) => {
    try {
      const { path: filePath, index } = req.body;

      if (!filePath || typeof index !== 'number') {
        res.status(400).json({ error: 'Path and index are required' });
        return;
      }

      const newContent = await fileService.toggleCheckbox(filePath, index);
      res.json({ content: newContent });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ error: message });
    }
  });

  return router;
}
