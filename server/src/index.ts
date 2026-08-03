import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createHttpServer, Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { FileService } from './services/fileService.js';
import { GitService } from './services/gitService.js';
import { TypeScriptService } from './services/typescriptService.js';
import { WatchService, FileChangeEvent } from './services/watchService.js';
import { createFilesRouter } from './routes/files.js';
import { createGitRouter } from './routes/git.js';
import { createClaudeRouter } from './routes/claude.js';
import { createScriptsRouter } from './routes/scripts.js';
import { createSettingsRouter } from './routes/settings.js';
import { SettingsStore } from './services/settingsStore.js';
import { ScriptRunner, RunState, ScriptOutputEvent } from './services/scriptRunner.js';
import type { ServerConfig } from './types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CreateServerResult {
  app: Express;
  scriptRunner: ScriptRunner;
  watchService: WatchService;
  settingsStore: SettingsStore;
  /** Wired up once the WebSocket server exists, so settings changes can be pushed to clients */
  setBroadcast: (fn: (payload: unknown) => void) => void;
}

export function createServer(config: ServerConfig): CreateServerResult {
  const app = express();

  // Initialize services
  const fileService = new FileService(config.projectPath);
  const gitService = new GitService(config.projectPath);
  const tsService = new TypeScriptService(config.projectPath);
  const scriptRunner = new ScriptRunner(config.projectPath);
  const settingsStore = new SettingsStore(config.projectPath);
  const watchService = new WatchService(config.projectPath);

  let broadcast: ((payload: unknown) => void) | null = null;
  const setBroadcast = (fn: (payload: unknown) => void) => {
    broadcast = fn;
  };

  // Middleware
  app.use(cors());
  app.use(express.json());

  // API Routes
  app.use('/api/files', createFilesRouter(fileService, tsService));
  app.use('/api/git', createGitRouter(gitService));
  app.use('/api/claude', createClaudeRouter(config.projectPath));
  app.use('/api/scripts', createScriptsRouter(scriptRunner));
  app.use(
    '/api/settings',
    createSettingsRouter(settingsStore, watchService, (settings) =>
      broadcast?.({ type: 'settings', ...settings }),
    ),
  );

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

  return { app, scriptRunner, watchService, settingsStore, setBroadcast };
}

interface StartServerResult {
  server: HttpServer;
  port: number;
  wss: WebSocketServer;
  watchService: WatchService;
  scriptRunner: ScriptRunner;
}

export async function startServer(config: ServerConfig): Promise<StartServerResult> {
  const { app, scriptRunner, watchService, settingsStore, setBroadcast } = createServer(config);
  const httpServer = createHttpServer(app);

  // Find an available port first
  const maxAttempts = 20;
  let currentPort = config.port;
  let boundPort: number | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      boundPort = await tryListen(httpServer, currentPort);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        currentPort++;
        continue;
      }
      throw error;
    }
  }

  if (boundPort === null) {
    throw new Error(`Could not find an available port after ${maxAttempts} attempts`);
  }

  console.log(`Coast Guard server running on http://localhost:${boundPort}`);
  console.log(`Browsing: ${config.projectPath}`);

  // Create WebSocket server after port is successfully bound
  const wss = new WebSocketServer({ server: httpServer });

  const broadcast = (payload: unknown) => {
    const msg = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  };
  setBroadcast(broadcast);

  // Start the file watcher, honouring the persisted git-watch preference
  watchService.start(settingsStore.get().gitWatchEnabled);

  // Broadcast file changes to all connected clients
  watchService.on('change', (event: FileChangeEvent) => {
    broadcast(event);
  });
  scriptRunner.on('update', (state: RunState) => {
    broadcast({ type: 'scriptUpdate', state });
  });
  scriptRunner.on('output', (event: ScriptOutputEvent) => {
    broadcast({ type: 'scriptOutput', runId: event.runId, line: event.line });
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

  return { server: httpServer, port: boundPort, wss, watchService, scriptRunner };
}

function tryListen(httpServer: HttpServer, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      httpServer.removeListener('error', onError);
      reject(error);
    };
    httpServer.on('error', onError);

    httpServer.listen(port, () => {
      httpServer.removeListener('error', onError);
      resolve(port);
    });
  });
}

// Run server if executed directly
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const projectPath = process.argv[2] || process.cwd();
  const port = parseInt(process.argv[3] || '3847', 10);

  startServer({ projectPath, port }).then(({ server, wss, watchService, scriptRunner }) => {
    // Graceful shutdown handler
    const shutdown = () => {
      console.log('\nShutting down...');

      // Stop the file watcher (clears intervals and file watchers)
      watchService.stop();

      // Kill any running script children
      scriptRunner.shutdown();

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
