export interface UserNode {
  id: string;
  role: 'user';
  content: string;
  ts: number;
}

export interface AssistantNode {
  id: string;
  role: 'assistant';
  events: ClaudeEvent[];
  ts: number;
  exitCode: number | null;
  signal: string | null;
}

export type ThreadNode = UserNode | AssistantNode;

export interface Thread {
  id: string;
  cwd: string;
  createdAt: number;
  turnCount: number;
  nodes: ThreadNode[];
}

interface ContentBlockText {
  type: 'text';
  text: string;
}
interface ContentBlockToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}
interface ContentBlockToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}
interface ContentBlockThinking {
  type: 'thinking';
  thinking: string;
}
type ContentBlock =
  | ContentBlockText
  | ContentBlockToolUse
  | ContentBlockToolResult
  | ContentBlockThinking;

export interface AssistantEvent {
  type: 'assistant';
  message: { id: string; content: ContentBlock[] };
}
export interface UserEvent {
  type: 'user';
  message: { content: ContentBlock[] };
}
export interface SystemEvent {
  type: 'system';
  subtype?: string;
  [k: string]: unknown;
}
export interface ResultEvent {
  type: 'result';
  is_error?: boolean;
  result?: string;
  error?: string;
}

export type ClaudeEvent = AssistantEvent | UserEvent | SystemEvent | ResultEvent | { type: string; [k: string]: unknown };
