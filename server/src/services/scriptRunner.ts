import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

export type RunStatus = 'running' | 'done' | 'failed' | 'stopped';

export interface RunState {
  runId: string;
  scriptName: string;
  command: string;
  status: RunStatus;
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
  signal: string | null;
}

interface InternalRun extends RunState {
  child: ChildProcess | null;
  logs: string[];
  logBytes: number;
  killTimer: NodeJS.Timeout | null;
}

export type ScriptKind = 'preset' | 'package';

export interface ScriptDefinition {
  name: string;
  command: string;
  kind: ScriptKind;
}

export interface ScriptOutputEvent {
  runId: string;
  line: string;
}

const MAX_LOG_LINES = 500;
const MAX_LOG_BYTES = 100_000;
const KILL_GRACE_MS = 3000;
const ANSI_PATTERN = /\u001b\[[0-9;?]*[a-zA-Z]/g;

export class ScriptRunner extends EventEmitter {
  private runs = new Map<string, InternalRun>();
  private latestByScript = new Map<string, string>();

  constructor(private projectPath: string) {
    super();
  }

  listScripts(): ScriptDefinition[] {
    let pkgScripts: Record<string, string> = {};
    let hasPackageJson = false;
    try {
      const pkgPath = path.join(this.projectPath, 'package.json');
      const raw = fs.readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
      pkgScripts = pkg.scripts || {};
      hasPackageJson = true;
    } catch {
      // no package.json → no scripts (and no install preset either)
    }

    const result: ScriptDefinition[] = [];

    // Prepend the npm install preset when there's a package.json. Skip if the
    // project happens to define a real `install` script (rare — npm-reserved).
    if (hasPackageJson && !('install' in pkgScripts)) {
      result.push({ name: 'install', command: 'npm install', kind: 'preset' });
    }

    for (const [name, command] of Object.entries(pkgScripts)) {
      result.push({ name, command: String(command), kind: 'package' });
    }
    return result;
  }

  listRuns(): RunState[] {
    return Array.from(this.runs.values()).map((r) => publicState(r));
  }

  getRun(runId: string): RunState | null {
    const r = this.runs.get(runId);
    return r ? publicState(r) : null;
  }

  getLogs(runId: string): string[] {
    const r = this.runs.get(runId);
    return r ? [...r.logs] : [];
  }

  async run(scriptName: string): Promise<RunState> {
    const scripts = this.listScripts();
    const script = scripts.find((s) => s.name === scriptName);
    if (!script) throw new Error(`script not found: ${scriptName}`);

    // If a previous run for this script is still alive, stop it first.
    const existingId = this.latestByScript.get(scriptName);
    if (existingId) {
      const existing = this.runs.get(existingId);
      if (existing && existing.status === 'running') {
        await this.stopAndWait(existing);
      }
    }

    const runId = crypto.randomUUID();
    const spawnArgs =
      script.kind === 'preset' && script.name === 'install'
        ? ['install']
        : ['run', scriptName];
    const child = spawn('npm', spawnArgs, {
      cwd: this.projectPath,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const run: InternalRun = {
      runId,
      scriptName,
      command: script.command,
      status: 'running',
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      signal: null,
      child,
      logs: [],
      logBytes: 0,
      killTimer: null,
    };
    this.runs.set(runId, run);
    this.latestByScript.set(scriptName, runId);

    this.emit('update', publicState(run));

    const ingest = (chunk: Buffer) => {
      const text = chunk.toString('utf8').replace(ANSI_PATTERN, '');
      const parts = text.split('\n');
      for (let i = 0; i < parts.length; i++) {
        const line = parts[i];
        // skip purely-empty trailing fragment from split
        if (i === parts.length - 1 && line === '') continue;
        run.logs.push(line);
        run.logBytes += line.length;
        while (
          run.logs.length > MAX_LOG_LINES ||
          run.logBytes > MAX_LOG_BYTES
        ) {
          const dropped = run.logs.shift();
          if (dropped === undefined) break;
          run.logBytes -= dropped.length;
        }
        const evt: ScriptOutputEvent = { runId, line };
        this.emit('output', evt);
      }
    };

    child.stdout?.on('data', ingest);
    child.stderr?.on('data', ingest);

    child.on('error', (err: Error) => {
      const errLine = `spawn error: ${err.message}`;
      run.logs.push(errLine);
      run.logBytes += errLine.length;
      this.emit('output', { runId, line: errLine });
      run.status = 'failed';
      run.endedAt = Date.now();
      run.exitCode = null;
      run.child = null;
      this.emit('update', publicState(run));
    });

    child.on('close', (code, signal) => {
      if (run.killTimer) {
        clearTimeout(run.killTimer);
        run.killTimer = null;
      }
      run.endedAt = Date.now();
      run.exitCode = code;
      run.signal = signal;
      if (run.status !== 'stopped') {
        run.status = code === 0 ? 'done' : 'failed';
      }
      run.child = null;
      this.emit('update', publicState(run));
    });

    return publicState(run);
  }

  async stop(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    await this.stopAndWait(run);
  }

  private stopAndWait(run: InternalRun): Promise<void> {
    if (!run.child || run.status !== 'running') return Promise.resolve();
    run.status = 'stopped';
    this.emit('update', publicState(run));
    return new Promise<void>((resolve) => {
      const child = run.child;
      if (!child) {
        resolve();
        return;
      }
      const onClose = () => resolve();
      child.once('close', onClose);
      try {
        child.kill('SIGTERM');
      } catch {
        // already dead
        resolve();
        return;
      }
      run.killTimer = setTimeout(() => {
        if (child.exitCode == null) {
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
        }
      }, KILL_GRACE_MS);
    });
  }

  shutdown(): void {
    for (const r of this.runs.values()) {
      if (r.killTimer) {
        clearTimeout(r.killTimer);
        r.killTimer = null;
      }
      if (r.child && r.status === 'running') {
        try {
          r.child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
    }
  }
}

function publicState(r: InternalRun): RunState {
  return {
    runId: r.runId,
    scriptName: r.scriptName,
    command: r.command,
    status: r.status,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    exitCode: r.exitCode,
    signal: r.signal,
  };
}
