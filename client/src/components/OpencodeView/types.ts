export interface UserNode {
  id: string;
  role: 'user';
  content: string;
  ts: number;
}

export interface AssistantNode {
  id: string;
  role: 'assistant';
  events: OpenCodeEvent[];
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

export interface OpenCodeEvent {
  type: string;
  timestamp?: number;
  sessionID?: string;
  part?: {
    type?: string;
    text?: string;
    id?: string;
    messageID?: string;
    reason?: string;
    tokens?: unknown;
    cost?: number;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
