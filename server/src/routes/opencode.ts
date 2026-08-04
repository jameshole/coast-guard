import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { OpenCodeThreadStore, AssistantNode, UserNode } from '../services/opencodeThreadStore.js';

const OPENCODE_BIN = process.env.OPENCODE_BIN || 'opencode';

export function createOpencodeRouter(projectPath: string): Router {
  const router = Router();
  const store = new OpenCodeThreadStore(projectPath);

  router.get('/thread', (_req: Request, res: Response) => {
    res.json(store.get());
  });

  router.post('/thread/reset', (_req: Request, res: Response) => {
    res.json(store.reset());
  });

  router.post('/thread/message', (req: Request, res: Response) => {
    const { content } = (req.body || {}) as { content?: string };
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'content required' });
      return;
    }

    const thread = store.get();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (channel: 'local' | 'opencode', data: unknown): void => {
      res.write(`event: ${channel}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const userNode: UserNode = {
      id: `u${Date.now()}`,
      role: 'user',
      content,
      ts: Date.now(),
    };
    store.appendNode(userNode);
    send('local', { type: 'user_message', node: userNode });

    const args = [
      'run', content,
      '--format', 'json',
      '--auto',
      '--dir', projectPath,
    ];
    if (thread.backendSessionId && thread.turnCount > 0) {
      args.push('--session', thread.backendSessionId, '--continue');
    }

    const cmdDisplay = `${OPENCODE_BIN} ${args
      .map((a) => (/\s/.test(a) ? JSON.stringify(a) : a))
      .join(' ')}`;
    send('local', { type: 'turn_start', cmd: cmdDisplay, cwd: thread.cwd });

    let child;
    try {
      child = spawn(OPENCODE_BIN, args, {
        cwd: thread.cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send('local', { type: 'error', message: `spawn failed: ${message}` });
      res.end();
      return;
    }

    const turnEvents: unknown[] = [];
    let stdoutBuf = '';
    let stderrBuf = '';
    let finished = false;
    let sessionCaptured = false;

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8');
      let nl: number;
      while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, nl);
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as { type?: string; sessionID?: string };
          turnEvents.push(obj);
          send('opencode', obj);

          // Capture the session ID from the first event on the first turn
          if (!sessionCaptured && !(thread.backendSessionId) && obj.sessionID) {
            sessionCaptured = true;
            store.updateBackendSessionId(obj.sessionID);
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          send('local', { type: 'parse_error', line, message });
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderrBuf += text;
      send('local', { type: 'stderr', text });
    });

    child.on('error', (err: Error) => {
      send('local', { type: 'error', message: err.message });
    });

    child.on('close', (code, signal) => {
      if (finished) return;
      finished = true;
      const assistantNode: AssistantNode = {
        id: `a${Date.now()}`,
        role: 'assistant',
        events: turnEvents,
        ts: Date.now(),
        exitCode: code,
        signal,
      };
      store.appendNode(assistantNode, { incrementTurn: true });
      send('local', {
        type: 'turn_end',
        node: assistantNode,
        code,
        signal,
        stderr: stderrBuf,
      });
      res.end();
    });

    res.on('close', () => {
      if (!finished && child && child.exitCode == null) {
        child.kill('SIGTERM');
      }
    });
  });

  return router;
}
