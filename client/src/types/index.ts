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

export interface DiffData {
  additions: number[];
  deletions: number[];
  hunks: LineDiff[][];
}

export interface FileDiff {
  staged: DiffData | null;
  unstaged: DiffData | null;
}

export interface ProjectInfo {
  path: string;
  name: string;
}

export type GitFileStatus = 'modified' | 'staged' | 'untracked';

export interface DiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface DefinitionResult {
  filePath: string;
  line: number;
  column: number;
  context: string;
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
