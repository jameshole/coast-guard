export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export interface GitStatus {
  modified: string[];
  staged: string[];
  untracked: string[];
  deleted: string[];
  renamed: Array<{ from: string; to: string }>;
}

export interface LineDiff {
  lineNumber: number;
  type: 'add' | 'remove' | 'context';
  content: string;
}

export interface FileDiff {
  staged: {
    additions: number[];
    deletions: number[];
    hunks: LineDiff[][];
  } | null;
  unstaged: {
    additions: number[];
    deletions: number[];
    hunks: LineDiff[][];
  } | null;
}

export interface DiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface BlameHunk {
  sha: string;
  shortSha: string;
  author: string;
  authorTime: number;
  summary: string;
  startLine: number;
  lineCount: number;
  isUncommitted: boolean;
}

export interface FileBlame {
  hunks: BlameHunk[];
  commitUrlBase: string | null;
}

export interface DefinitionResult {
  filePath: string;
  line: number;
  column: number;
  context: string;
}

export interface SearchMatch {
  line: number;
  before: string;
  match: string;
  after: string;
}

export interface SearchFileResult {
  path: string;
  matches: SearchMatch[];
}

export interface SearchResponse {
  results: SearchFileResult[];
  totalMatches: number;
  truncated: boolean;
}

export interface ServerConfig {
  projectPath: string;
  port: number;
}
