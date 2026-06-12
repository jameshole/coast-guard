import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { ThreadStore, AssistantNode, UserNode } from '../services/threadStore.js';
import { SlashCommandsCache } from '../services/slashCommandsCache.js';

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

// The chat UI turns backticked `path:line` references into clickable links, but
// only if the path is complete — an abbreviated path can't be resolved. Claude
// already uses the backtick format reliably; this just stops it shortening paths.
const FILE_REF_SYSTEM_PROMPT =
  'When you reference a file location, write the COMPLETE project-relative path ' +
  'in backticks with a line number — e.g. `src/app/pages/foo/bar.component.ts:42` ' +
  '(or `:42-58` for a range). Never abbreviate the path with `...` or omit ' +
  'directories; always give the full path from the project root. This applies ' +
  'everywhere, including inside tables, lists, and headings — no matter how ' +
  'long the path is or how cramped the layout, never shorten it.';

export function createClaudeRouter(projectPath: string): Router {
  const router = Router();
  const store = new ThreadStore(projectPath);
  const slashCache = new SlashCommandsCache(projectPath);

  router.get('/thread', (_req: Request, res: Response) => {
    res.json(store.get());
  });

  router.post('/thread/reset', (_req: Request, res: Response) => {
    res.json(store.reset());
  });

  // Cached + warmed-up slash commands for this cwd. Used so the composer's
  // autocomplete is populated before the first turn of a session.
  router.get('/slash-commands', async (_req: Request, res: Response) => {
    const entry = await slashCache.getOrWarmup();
    res.json(entry);
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

    const send = (channel: 'local' | 'claude', data: unknown): void => {
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
      '-p', content,
      '--append-system-prompt', FILE_REF_SYSTEM_PROMPT,
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode', 'bypassPermissions',
    ];
    if (thread.turnCount === 0) {
      args.push('--session-id', thread.id);
    } else {
      args.push('--resume', thread.id);
    }

    const cmdDisplay = `${CLAUDE_BIN} ${args
      .map((a) => (/\s/.test(a) ? JSON.stringify(a) : a))
      .join(' ')}`;
    send('local', { type: 'turn_start', cmd: cmdDisplay, cwd: thread.cwd });

    let child;
    try {
      child = spawn(CLAUDE_BIN, args, {
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

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8');
      let nl: number;
      while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, nl);
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as { type?: string; subtype?: string; slash_commands?: unknown };
          turnEvents.push(obj);
          send('claude', obj);
          // Refresh the slash-commands cache whenever an init event lands so
          // it stays current with the user's installed commands.
          if (
            obj.type === 'system' &&
            obj.subtype === 'init' &&
            Array.isArray(obj.slash_commands)
          ) {
            slashCache.set(obj.slash_commands as string[]);
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
