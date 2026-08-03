import chokidar, { FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import { simpleGit, SimpleGit, StatusResult } from 'simple-git';

export interface FileChangeEvent {
  type: 'change' | 'gitStatus';
  path?: string; // For file changes
  changedFiles?: string[]; // For git status changes
}

export class WatchService extends EventEmitter {
  private fileWatcher: FSWatcher | null = null;
  private currentWatchedFile: string | null = null;
  private rootDir: string;
  private git: SimpleGit;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastGitStatus: string | null = null; // Serialized status for comparison
  private debounceTimer: NodeJS.Timeout | null = null;
  private gitPollingEnabled = true;

  constructor(rootDir: string) {
    super();
    this.rootDir = rootDir;
    this.git = simpleGit(rootDir);
  }

  start(gitPollingEnabled: boolean = true): void {
    this.gitPollingEnabled = gitPollingEnabled;
    if (gitPollingEnabled) {
      this.startGitPolling();
    }
    console.log(
      `File watcher started (single file watch${gitPollingEnabled ? ' + git polling' : ', git polling disabled'})`,
    );
  }

  isGitPollingEnabled(): boolean {
    return this.gitPollingEnabled;
  }

  /**
   * Turn git status polling on/off at runtime. Polling shells out to `git status`
   * and stats every changed file every 2s, which is wasteful (and memory-hungry)
   * in large or rarely-changing repos.
   */
  setGitPollingEnabled(enabled: boolean): void {
    if (enabled === this.gitPollingEnabled) return;
    this.gitPollingEnabled = enabled;

    if (enabled) {
      this.startGitPolling();
    } else if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      // Drop the baseline so re-enabling doesn't fire a stale change event
      this.lastGitStatus = null;
    }
  }

  private startGitPolling(): void {
    if (this.pollInterval) return;

    // Poll git status every 2 seconds
    const poll = async () => {
      if (!this.gitPollingEnabled) return;
      try {
        const status = await this.git.status();
        const changedFiles = this.getChangedFiles(status);

        // Get mtimes for changed files to detect content changes
        // This catches edits even when the same lines are modified multiple times
        const mtimes = await this.getFileMtimes(changedFiles);

        const statusKey = this.serializeGitStatus(status, mtimes);

        // Polling may have been turned off while this pass was in flight
        if (!this.gitPollingEnabled) return;

        if (this.lastGitStatus !== null && this.lastGitStatus !== statusKey) {
          // Status changed - emit event with changed files
          this.emit('change', {
            type: 'gitStatus',
            changedFiles,
          } as FileChangeEvent);
        }

        this.lastGitStatus = statusKey;
      } catch (error) {
        // Silently ignore git errors (might not be a git repo)
      }
    };

    // Initial poll
    poll();

    // Set up interval
    this.pollInterval = setInterval(poll, 2000);
  }

  private async getFileMtimes(files: string[]): Promise<Record<string, number>> {
    const mtimes: Record<string, number> = {};
    for (const file of files) {
      try {
        const stat = await fs.stat(path.join(this.rootDir, file));
        mtimes[file] = stat.mtimeMs;
      } catch {
        // File might not exist (deleted), skip it
      }
    }
    return mtimes;
  }

  private serializeGitStatus(status: StatusResult, mtimes: Record<string, number>): string {
    // Create a string that represents the current git status
    // Include file mtimes so we detect any file saves, not just file list changes
    const files = [
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.renamed.map((r) => r.to),
      ...status.not_added,
      ...status.staged,
    ].sort();
    return JSON.stringify({ files, mtimes });
  }

  private getChangedFiles(status: StatusResult): string[] {
    return [
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.renamed.map((r) => r.to),
      ...status.not_added,
      ...status.staged,
    ];
  }

  /**
   * Watch a specific file for changes (instant feedback for currently viewed file)
   */
  watchFile(relativePath: string | null): void {
    // Stop watching previous file
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }

    if (!relativePath) {
      this.currentWatchedFile = null;
      return;
    }

    const absolutePath = path.join(this.rootDir, relativePath);
    this.currentWatchedFile = relativePath;

    this.fileWatcher = chokidar.watch(absolutePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.fileWatcher.on('change', () => {
      // Debounce rapid changes
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        this.emit('change', {
          type: 'change',
          path: relativePath,
        } as FileChangeEvent);
      }, 100);
    });

    this.fileWatcher.on('error', (error) => {
      console.error('File watch error:', error);
    });
  }

  stop(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
