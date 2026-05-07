#!/usr/bin/env node

import { program } from 'commander';
import open from 'open';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

program
  .name('coast-guard')
  .description('A lightweight code browsing tool with syntax highlighting and git diff visualization')
  .argument('[path]', 'Path to project directory', '.')
  .option('-p, --port <number>', 'Port to run on', '3847')
  .option('--no-open', 'Do not open browser automatically')
  .action(async (projectPath, options) => {
    const absolutePath = path.resolve(projectPath);

    // Validate path exists
    if (!fs.existsSync(absolutePath)) {
      console.error(`Error: Path does not exist: ${absolutePath}`);
      process.exit(1);
    }

    // Validate it's a directory
    if (!fs.statSync(absolutePath).isDirectory()) {
      console.error(`Error: Path is not a directory: ${absolutePath}`);
      process.exit(1);
    }

    const port = parseInt(options.port, 10);

    // Dynamically import the server (ESM)
    const serverPath = path.resolve(__dirname, '../server/dist/index.js');

    let startServer;
    try {
      const serverModule = await import(serverPath);
      startServer = serverModule.startServer;
    } catch (error) {
      // Fallback to dev mode - try loading from src with tsx
      console.error('Production build not found, trying development mode...');
      console.error('Run "npm run build" to create a production build.');
      process.exit(1);
    }

    // Start server (auto-finds available port)
    const { server, port: actualPort, wss, watchService, scriptRunner } = await startServer({
      projectPath: absolutePath,
      port,
    });

    const url = `http://localhost:${actualPort}`;

    console.log('');
    console.log('  🏖️  Coast Guard');
    console.log('  ────────────────');
    console.log(`  📂 Project: ${absolutePath}`);
    console.log(`  🌐 URL: ${url}`);
    console.log('');
    console.log('  Press Ctrl+C to stop');
    console.log('');

    // Open browser
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
