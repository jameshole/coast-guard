import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const DATA_DIR = path.join(os.homedir(), '.coast-guard');
const THREADS_FILE = path.join(DATA_DIR, 'threads.json');

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
  signal: NodeJS.Signals | null;
}

export type ThreadNode = UserNode | AssistantNode;

export interface Thread {
  id: string;
  cwd: string;
  createdAt: number;
  turnCount: number;
  nodes: ThreadNode[];
}

type ThreadsFile = Record<string, Thread>;

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

export class ThreadStore {
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = path.resolve(cwd);
  }

  get(): Thread {
    const all = load();
    let thread = all[this.cwd];
    if (!thread) {
      thread = {
        id: crypto.randomUUID(),
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

  reset(): Thread {
    const all = load();
    const fresh: Thread = {
      id: crypto.randomUUID(),
      cwd: this.cwd,
      createdAt: Date.now(),
      turnCount: 0,
      nodes: [],
    };
    all[this.cwd] = fresh;
    save(all);
    return fresh;
  }

  appendNode(node: ThreadNode, opts: { incrementTurn?: boolean } = {}): Thread {
    const all = load();
    const thread = all[this.cwd] ?? this.get();
    thread.nodes.push(node);
    if (opts.incrementTurn) thread.turnCount += 1;
    all[this.cwd] = thread;
    save(all);
    return thread;
  }
}
