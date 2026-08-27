#!/usr/bin/env node

import { program } from 'commander';
import open from 'open';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

program
  .name('scout')
  .description('Coast Guard lite — a single-file reader with syntax highlighting, markdown rendering, and review comments')
  .argument('<file>', 'Path to the file to view')
  .option('-p, --port <number>', 'Port to run on', '3847')
  .option('--no-open', 'Do not open browser automatically')
  .action(async (filePath, options) => {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      console.error(`Error: File does not exist: ${absolutePath}`);
      process.exit(1);
    }

    if (!fs.statSync(absolutePath).isFile()) {
      console.error(`Error: Path is not a file: ${absolutePath}`);
      console.error('For browsing a directory, use coast-guard instead.');
      process.exit(1);
    }

    const projectPath = path.dirname(absolutePath);
    const initialFile = path.basename(absolutePath);
    const port = parseInt(options.port, 10);

    // Dynamically import the server (ESM)
    const serverPath = path.resolve(__dirname, '../server/dist/index.js');

    let startServer;
    try {
      const serverModule = await import(serverPath);
      startServer = serverModule.startServer;
    } catch (error) {
      console.error('Production build not found, trying development mode...');
      console.error('Run "npm run build" to create a production build.');
      process.exit(1);
    }

    // Start server (auto-finds available port)
    const { server, port: actualPort, wss, watchService, scriptRunner } = await startServer({
      projectPath,
      port,
      lite: true,
      initialFile,
    });

    const url = `http://localhost:${actualPort}`;

    console.log('');
    console.log('  🧭 Scout');
    console.log('  ────────────');
    console.log(`  📄 File: ${absolutePath}`);
    console.log(`  🌐 URL: ${url}`);
    console.log('');
    console.log('  Press Ctrl+C to stop');
    console.log('');

    if (options.open !== false) {
      await open(url);
    }

    // Handle shutdown gracefully
    const shutdown = () => {
      console.log('\nShutting down...');

      watchService.stop();
      scriptRunner.shutdown();

      // Notify clients of shutdown so they can close their tabs
      const shutdownMessage = JSON.stringify({ type: 'shutdown' });
      wss.clients.forEach((client) => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(shutdownMessage);
        }
        client.close();
      });

      wss.close(() => {
        server.close(() => {
          process.exit(0);
        });
      });

      // Force exit if graceful shutdown stalls
      setTimeout(() => {
        process.exit(1);
      }, 3000);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

program.parse();
