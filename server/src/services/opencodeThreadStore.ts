import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const DATA_DIR = path.join(os.homedir(), '.coast-guard');
const THREADS_FILE = path.join(DATA_DIR, 'opencode-threads.json');

export interface UserNode {
  id: string;
  role: 'user';
  content: string;
  ts: number;
}

export interface AssistantNode {
  id: string;
  role: 'assistant';
  events: unknown[];
  ts: number;
  exitCode: number | null;
  signal: string | null;
}

export type ThreadNode = UserNode | AssistantNode;

export interface OpenCodeThread {
  id: string;
  backendSessionId: string | null;
  cwd: string;
  createdAt: number;
  turnCount: number;
  nodes: ThreadNode[];
}

type ThreadsFile = Record<string, OpenCodeThread>;

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load(): ThreadsFile {
  try {
    return JSON.parse(fs.readFileSync(THREADS_FILE, 'utf8')) as ThreadsFile;
  } catch {
    return {};
  }
}

function save(data: ThreadsFile): void {
  ensureDir();
  fs.writeFileSync(THREADS_FILE, JSON.stringify(data, null, 2));
}

export class OpenCodeThreadStore {
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = path.resolve(cwd);
  }

  get(): OpenCodeThread {
    const all = load();
    let thread = all[this.cwd];
    if (!thread) {
      thread = {
        id: crypto.randomUUID(),
        backendSessionId: null,
        cwd: this.cwd,
        createdAt: Date.now(),
        turnCount: 0,
        nodes: [],
      };
      all[this.cwd] = thread;
      save(all);
    }
    return thread;
  }

  reset(): OpenCodeThread {
    const all = load();
    const fresh: OpenCodeThread = {
      id: crypto.randomUUID(),
      backendSessionId: null,
      cwd: this.cwd,
      createdAt: Date.now(),
      turnCount: 0,
      nodes: [],
    };
    all[this.cwd] = fresh;
    save(all);
    return fresh;
  }

  appendNode(node: ThreadNode, opts: { incrementTurn?: boolean } = {}): OpenCodeThread {
    const all = load();
    const thread = all[this.cwd] ?? this.get();
    thread.nodes.push(node);
    if (opts.incrementTurn) thread.turnCount += 1;
    all[this.cwd] = thread;
    save(all);
    return thread;
  }

  updateBackendSessionId(sessionId: string): void {
    const all = load();
    const thread = all[this.cwd];
    if (thread) {
      thread.backendSessionId = sessionId;
      all[this.cwd] = thread;
      save(all);
    }
  }
}
