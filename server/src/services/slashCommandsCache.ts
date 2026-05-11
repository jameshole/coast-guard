import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const DATA_DIR = path.join(os.homedir(), '.coast-guard');
const CACHE_FILE = path.join(DATA_DIR, 'slash-commands.json');
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const WARMUP_TIMEOUT_MS = 15_000;

interface CacheEntry {
  commands: string[];
  updatedAt: number;
}

type CacheFile = Record<string, CacheEntry>;

function loadAll(): CacheFile {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as CacheFile;
  } catch {
    return {};
  }
}

function saveAll(data: CacheFile): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

export class SlashCommandsCache {
  private inFlight = new Map<string, Promise<string[] | null>>();

  constructor(private projectPath: string) {}

  get(): CacheEntry | null {
    const all = loadAll();
    return all[this.projectPath] ?? null;
  }

  set(commands: string[]): void {
    if (!Array.isArray(commands)) return;
    const filtered = commands.filter((c): c is string => typeof c === 'string');
    const all = loadAll();
    all[this.projectPath] = { commands: filtered, updatedAt: Date.now() };
    saveAll(all);
  }

  // Returns the cached entry, populating it via a warm-up spawn if it's missing.
  // Concurrent calls dedupe to a single warm-up child.
  async getOrWarmup(): Promise<CacheEntry> {
    const existing = this.get();
    if (existing && existing.commands.length > 0) return existing;
    const fresh = await this.startWarmup();
    if (fresh && fresh.length > 0) {
      this.set(fresh);
      return { commands: fresh, updatedAt: Date.now() };
    }
    return existing ?? { commands: [], updatedAt: 0 };
  }

  private startWarmup(): Promise<string[] | null> {
    const inFlight = this.inFlight.get(this.projectPath);
    if (inFlight) return inFlight;
    const p = this.warmup();
    this.inFlight.set(this.projectPath, p);
    p.finally(() => this.inFlight.delete(this.projectPath));
    return p;
  }

  // Spawn claude with a tiny prompt, grab the first system/init event off stdout,
  // then SIGTERM before any model call is made. The init line is emitted by the
  // CLI locally before the LLM request fires, so this costs roughly the CLI
  // startup time and no API tokens.
  private warmup(): Promise<string[] | null> {
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(
          CLAUDE_BIN,
          [
            '-p', 'hi',
            '--output-format', 'stream-json',
            '--verbose',
            '--permission-mode', 'bypassPermissions',
          ],
          {
            cwd: this.projectPath,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
      } catch {
        resolve(null);
        return;
      }

      let settled = false;
      let buf = '';

      const finish = (result: string[] | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try { child.kill('SIGTERM'); } catch { /* noop */ }
        setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* noop */ }
        }, 1000);
        resolve(result);
      };

      child.stdout.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line) as { type?: string; subtype?: string; slash_commands?: unknown };
            if (
              obj.type === 'system' &&
              obj.subtype === 'init' &&
              Array.isArray(obj.slash_commands)
            ) {
              const cmds = obj.slash_commands.filter(
                (c): c is string => typeof c === 'string',
              );
              finish(cmds);
              return;
            }
          } catch {
            // skip parse errors
          }
        }
      });

      child.on('error', () => finish(null));
      child.on('close', () => finish(null));

      const timeout = setTimeout(() => finish(null), WARMUP_TIMEOUT_MS);
    });
  }
}
