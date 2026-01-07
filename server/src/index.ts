import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createHttpServer, Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { FileService } from './services/fileService.js';
import { GitService } from './services/gitService.js';
import { WatchService, FileChangeEvent } from './services/watchService.js';
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
  server: HttpServer;
  port: number;
  wss: WebSocketServer;
  watchService: WatchService;
}

export async function startServer(config: ServerConfig): Promise<StartServerResult> {
  const app = createServer(config);
  const httpServer = createHttpServer(app);

  // Create WebSocket server
  const wss = new WebSocketServer({ server: httpServer });

  // Create and start file watcher
  const watchService = new WatchService(config.projectPath);
  watchService.start();

  // Broadcast file changes to all connected clients
  watchService.on('change', (event: FileChangeEvent) => {
    const message = JSON.stringify(event);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  // WebSocket connection handling
  wss.on('connection', (ws) => {
    // Send initial connection confirmation
    ws.send(JSON.stringify({ type: 'connected' }));

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'watchFile') {
          // Client is requesting to watch a specific file
          watchService.watchFile(message.path || null);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  const maxAttempts = 20;
  let currentPort = config.port;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await tryPort(httpServer, currentPort, config.projectPath, wss, watchService);
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

function tryPort(
  httpServer: HttpServer,
  port: number,
  projectPath: string,
  wss: WebSocketServer,
  watchService: WatchService
): Promise<StartServerResult> {
  return new Promise((resolve, reject) => {
    httpServer.listen(port, () => {
      console.log(`Coast Guard server running on http://localhost:${port}`);
      console.log(`Browsing: ${projectPath}`);
      resolve({ server: httpServer, port, wss, watchService });
    });

    httpServer.on('error', (error) => {
      reject(error);
    });
  });
}

// Run server if executed directly
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const projectPath = process.argv[2] || process.cwd();
  const port = parseInt(process.argv[3] || '3847', 10);

  startServer({ projectPath, port }).then(({ server, wss, watchService }) => {
    // Graceful shutdown handler
    const shutdown = () => {
      console.log('\nShutting down...');

      // Stop the file watcher (clears intervals and file watchers)
      watchService.stop();

      // Close all WebSocket connections
      wss.clients.forEach((client) => {
        client.close();
      });

      // Close WebSocket server
      wss.close(() => {
        // Close HTTP server
        server.close(() => {
          console.log('Server closed');
          process.exit(0);
        });
      });

      // Force exit after 3 seconds if graceful shutdown fails
      setTimeout(() => {
        console.log('Forcing exit...');
        process.exit(1);
      }, 3000);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
