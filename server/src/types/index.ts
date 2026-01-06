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

export interface ServerConfig {
  projectPath: string;
  port: number;
}
