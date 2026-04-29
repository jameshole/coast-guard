import { simpleGit, SimpleGit, StatusResult } from 'simple-git';
import { promises as fs } from 'fs';
import path from 'path';
import type { GitStatus, FileDiff, LineDiff, DiffStats } from '../types/index.js';

export class GitService {
  private git: SimpleGit;
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
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

  async listBranches(): Promise<string[]> {
    try {
      const result = await this.git.branchLocal();
      return result.all;
    } catch {
      return [];
    }
  }

  async verifyRef(ref: string): Promise<boolean> {
    // Handle range syntax (a..b, a...b) - validate each side; empty side defaults to HEAD
    const rangeMatch = ref.match(/^(.*?)(\.\.\.?)(.*)$/);
    if (rangeMatch) {
      const [, left, , right] = rangeMatch;
      const leftOk = left === '' ? true : await this.verifyRef(left);
      const rightOk = right === '' ? true : await this.verifyRef(right);
      return leftOk && rightOk;
    }
    try {
      const sha = await this.git.revparse(['--verify', '--quiet', `${ref}^{commit}`]);
      return sha.trim().length > 0;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<GitStatus> {
    try {
      const status: StatusResult = await this.git.status();

      // simple-git puts `git add -N` (intent-to-add) files in `created` but leaves
      // them out of `staged` and `not_added`, so treat them as untracked.
      const stagedSet = new Set(status.staged);
      const intentToAdd = status.created.filter((f) => !stagedSet.has(f));

      return {
        modified: status.modified,
        staged: status.staged,
        untracked: [...status.not_added, ...intentToAdd],
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

  async getFileDiff(
    filePath: string,
    ignoreWhitespace: boolean = false,
    baseRef: string = 'HEAD',
  ): Promise<FileDiff> {
    const result: FileDiff = {
      staged: null,
      unstaged: null,
    };

    try {
      const baseArgs = ignoreWhitespace ? ['-w'] : [];

      if (baseRef === 'HEAD') {
        // Default behavior: split staged vs unstaged
        const stagedRaw = await this.git.diff([...baseArgs, '--cached', '--', filePath]);
        if (stagedRaw) {
          result.staged = this.parseDiff(stagedRaw);
        }

        const unstagedRaw = await this.git.diff([...baseArgs, '--', filePath]);
        if (unstagedRaw) {
          result.unstaged = this.parseDiff(unstagedRaw);
        }
      } else {
        // Custom base: combined diff from base → working tree (no staged/unstaged split)
        const combinedRaw = await this.git.diff([...baseArgs, baseRef, '--', filePath]);
        if (combinedRaw) {
          result.unstaged = this.parseDiff(combinedRaw);
        }
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

  async getDiffStats(baseRef: string = 'HEAD'): Promise<DiffStats> {
    let insertions = 0;
    let deletions = 0;
    let filesChanged = 0;

    try {
      const summary = await this.git.diffSummary([baseRef]);
      insertions = summary.insertions;
      deletions = summary.deletions;
      filesChanged = summary.changed;
    } catch {
      // ignore — diff summary failed (e.g. invalid ref)
    }

    // simple-git's diff covers tracked + intent-to-add changes. Pure untracked
    // files (`not_added`) are listed in the changed-files panel but not in the
    // diff, so count their lines manually to keep the totals consistent.
    try {
      const status = await this.git.status();
      for (const file of status.not_added) {
        try {
          const content = await fs.readFile(path.join(this.projectPath, file), 'utf-8');
          if (content.length === 0) {
            filesChanged += 1;
            continue;
          }
          const lineCount = content.endsWith('\n')
            ? content.split('\n').length - 1
            : content.split('\n').length;
          insertions += lineCount;
          filesChanged += 1;
        } catch {
          // unreadable / binary — skip
        }
      }
    } catch {
      // status failed
    }

    return { filesChanged, insertions, deletions };
  }

  async getAllChangedFiles(
    baseRef: string = 'HEAD',
  ): Promise<Map<string, 'modified' | 'staged' | 'untracked'>> {
    const fileMap = new Map<string, 'modified' | 'staged' | 'untracked'>();

    if (baseRef === 'HEAD') {
      const status = await this.getStatus();

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

    // Custom base: combined changes since base + untracked
    const diffOutput = await this.git.diff(['--name-only', baseRef]);
    const changedPaths = diffOutput
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    for (const file of changedPaths) {
      fileMap.set(file, 'modified');
    }

    const status = await this.getStatus();
    for (const file of status.untracked) {
      fileMap.set(file, 'untracked');
    }

    return fileMap;
  }
}
