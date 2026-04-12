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

export interface DefinitionResult {
  filePath: string;
  line: number;
  column: number;
  context: string;
}
