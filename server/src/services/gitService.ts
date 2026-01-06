import { simpleGit, SimpleGit, StatusResult } from 'simple-git';
import type { GitStatus, FileDiff, LineDiff } from '../types/index.js';

export class GitService {
  private git: SimpleGit;

  constructor(projectPath: string) {
    this.git = simpleGit(projectPath);
  }

  async isGitRepo(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }

  async getBranch(): Promise<string | null> {
    try {
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      return branch.trim();
    } catch {
      return null;
    }
  }

  async getStatus(): Promise<GitStatus> {
    try {
      const status: StatusResult = await this.git.status();

      return {
        modified: status.modified,
        staged: status.staged,
        untracked: status.not_added,
        deleted: status.deleted,
        renamed: status.renamed.map((r) => ({ from: r.from, to: r.to })),
      };
    } catch {
      return {
        modified: [],
        staged: [],
        untracked: [],
        deleted: [],
        renamed: [],
      };
    }
  }

  async getFileDiff(filePath: string): Promise<FileDiff> {
    const result: FileDiff = {
      staged: null,
      unstaged: null,
    };

    try {
      // Get staged diff
      const stagedRaw = await this.git.diff(['--cached', '--', filePath]);
      if (stagedRaw) {
        result.staged = this.parseDiff(stagedRaw);
      }

      // Get unstaged diff
      const unstagedRaw = await this.git.diff(['--', filePath]);
      if (unstagedRaw) {
        result.unstaged = this.parseDiff(unstagedRaw);
      }
    } catch (error) {
      console.error('Error getting diff for', filePath, error);
    }

    return result;
  }

  private parseDiff(diffOutput: string): {
    additions: number[];
    deletions: number[];
    hunks: LineDiff[][];
  } {
    const additions: number[] = [];
    const deletions: number[] = [];
    const hunks: LineDiff[][] = [];

    const lines = diffOutput.split('\n');
    let currentHunk: LineDiff[] = [];
    let newLineNum = 0;
    let oldLineNum = 0;

    for (const line of lines) {
      // Parse hunk header: @@ -start,count +start,count @@
      const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);

      if (hunkMatch) {
        if (currentHunk.length > 0) {
          hunks.push(currentHunk);
          currentHunk = [];
        }
        oldLineNum = parseInt(hunkMatch[1], 10);
        newLineNum = parseInt(hunkMatch[2], 10);
        continue;
      }

      // Skip diff headers
      if (
        line.startsWith('diff ') ||
        line.startsWith('index ') ||
        line.startsWith('--- ') ||
        line.startsWith('+++ ')
      ) {
        continue;
      }

      // Parse diff content
      if (line.startsWith('+')) {
        additions.push(newLineNum);
        currentHunk.push({
          lineNumber: newLineNum,
          type: 'add',
          content: line.substring(1),
        });
        newLineNum++;
      } else if (line.startsWith('-')) {
        deletions.push(oldLineNum);
        currentHunk.push({
          lineNumber: oldLineNum,
          type: 'remove',
          content: line.substring(1),
        });
        oldLineNum++;
      } else if (line.startsWith(' ') || line === '') {
        currentHunk.push({
          lineNumber: newLineNum,
          type: 'context',
          content: line.substring(1) || '',
        });
        oldLineNum++;
        newLineNum++;
      }
    }

    if (currentHunk.length > 0) {
      hunks.push(currentHunk);
    }

    return { additions, deletions, hunks };
  }

  async getAllChangedFiles(): Promise<Map<string, 'modified' | 'staged' | 'untracked'>> {
    const status = await this.getStatus();
    const fileMap = new Map<string, 'modified' | 'staged' | 'untracked'>();

    for (const file of status.staged) {
      fileMap.set(file, 'staged');
    }

    for (const file of status.modified) {
      if (!fileMap.has(file)) {
        fileMap.set(file, 'modified');
      }
    }

    for (const file of status.untracked) {
      fileMap.set(file, 'untracked');
    }

    return fileMap;
  }
}
