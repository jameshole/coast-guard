import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { FileService } from './services/fileService.js';
import { GitService } from './services/gitService.js';
import { createFilesRouter } from './routes/files.js';
import { createGitRouter } from './routes/git.js';
import type { ServerConfig } from './types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createServer(config: ServerConfig): Express {
  const app = express();

  // Initialize services
  const fileService = new FileService(config.projectPath);
  const gitService = new GitService(config.projectPath);

  // Middleware
  app.use(cors());
  app.use(express.json());

  // API Routes
  app.use('/api/files', createFilesRouter(fileService));
  app.use('/api/git', createGitRouter(gitService));

  // Project info endpoint
  app.get('/api/project', (_req, res) => {
    res.json({
      path: config.projectPath,
      name: path.basename(config.projectPath),
    });
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Serve static files from client build in production
  const clientDistPath = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDistPath));

  // SPA fallback - serve index.html for any non-API route
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });

  return app;
}

interface StartServerResult {
  server: ReturnType<Express['listen']>;
  port: number;
}

export async function startServer(config: ServerConfig): Promise<StartServerResult> {
  const app = createServer(config);
  const maxAttempts = 20;
  let currentPort = config.port;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await tryPort(app, currentPort, config.projectPath);
      return result;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        currentPort++;
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Could not find an available port after ${maxAttempts} attempts`);
}

function tryPort(app: Express, port: number, projectPath: string): Promise<StartServerResult> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`Coast Guard server running on http://localhost:${port}`);
      console.log(`Browsing: ${projectPath}`);
      resolve({ server, port });
    });

    server.on('error', (error) => {
      reject(error);
    });
  });
}

// Run server if executed directly
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const projectPath = process.argv[2] || process.cwd();
  const port = parseInt(process.argv[3] || '3847', 10);

  startServer({ projectPath, port });
}
