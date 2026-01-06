import fs from 'fs/promises';
import path from 'path';
import { simpleGit, SimpleGit } from 'simple-git';
import type { FileNode } from '../types/index.js';

// Files/directories to ignore
const IGNORED_PATTERNS = [
  'node_modules',
  '.git',
  '.DS_Store',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'coverage',
  '.nyc_output',
];

export class FileService {
  private projectPath: string;
  private git: SimpleGit;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.git = simpleGit(projectPath);
  }

  private isIgnored(name: string): boolean {
    return IGNORED_PATTERNS.includes(name) || name.startsWith('.');
  }

  private validatePath(requestedPath: string): string {
    const absolutePath = path.resolve(this.projectPath, requestedPath);

    // Prevent directory traversal attacks
    if (!absolutePath.startsWith(this.projectPath)) {
      throw new Error('Access denied: path outside project directory');
    }

    return absolutePath;
  }

  async getTree(relativePath: string = '', depth: number = 1): Promise<FileNode[]> {
    const absolutePath = this.validatePath(relativePath);

    try {
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });
      const nodes: FileNode[] = [];

      for (const entry of entries) {
        if (this.isIgnored(entry.name)) continue;

        const entryRelativePath = path.join(relativePath, entry.name);

        if (entry.isDirectory()) {
          const node: FileNode = {
            name: entry.name,
            path: entryRelativePath,
            type: 'directory',
          };

          // Recursively load children if depth > 1
          if (depth > 1) {
            node.children = await this.getTree(entryRelativePath, depth - 1);
          }

          nodes.push(node);
        } else if (entry.isFile()) {
          nodes.push({
            name: entry.name,
            path: entryRelativePath,
            type: 'file',
          });
        }
      }

      // Sort: directories first, then files, alphabetically within each group
      return nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Path not found: ${relativePath}`);
      }
      throw error;
    }
  }

  async getContent(relativePath: string): Promise<string> {
    const absolutePath = this.validatePath(relativePath);

    try {
      const stats = await fs.stat(absolutePath);

      // Limit file size to prevent memory issues (10MB max)
      if (stats.size > 10 * 1024 * 1024) {
        throw new Error('File too large to display');
      }

      const content = await fs.readFile(absolutePath, 'utf-8');
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${relativePath}`);
      }
      throw error;
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      const absolutePath = this.validatePath(relativePath);
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  async getAllFiles(relativePath: string = ''): Promise<string[]> {
    // Try to use git ls-files first (respects .gitignore)
    try {
      const isGitRepo = await this.git.checkIsRepo();
      if (isGitRepo) {
        // Get tracked files
        const trackedOutput = await this.git.raw(['ls-files']);
        const trackedFiles = trackedOutput.trim().split('\n').filter(Boolean);

        // Get untracked files that aren't ignored
        const untrackedOutput = await this.git.raw(['ls-files', '--others', '--exclude-standard']);
        const untrackedFiles = untrackedOutput.trim().split('\n').filter(Boolean);

        const allFiles = [...trackedFiles, ...untrackedFiles];

        // Filter by relativePath if specified
        if (relativePath) {
          const prefix = relativePath.endsWith('/') ? relativePath : relativePath + '/';
          return allFiles.filter(f => f.startsWith(prefix));
        }

        return allFiles.sort();
      }
    } catch {
      // Fall through to manual scan if git fails
    }

    // Fallback: manual directory scan
    return this.scanDirectory(relativePath);
  }

  private async scanDirectory(relativePath: string = ''): Promise<string[]> {
    const absolutePath = this.validatePath(relativePath);
    const files: string[] = [];

    const scan = async (dir: string, relativeDir: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (this.isIgnored(entry.name)) continue;

          const entryPath = path.join(dir, entry.name);
          const entryRelativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;

          if (entry.isDirectory()) {
            await scan(entryPath, entryRelativePath);
          } else if (entry.isFile()) {
            files.push(entryRelativePath);
          }
        }
      } catch {
        // Skip directories we can't read
      }
    };

    await scan(absolutePath, relativePath);
    return files;
  }
}
