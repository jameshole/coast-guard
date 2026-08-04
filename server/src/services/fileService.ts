import fs from 'fs/promises';
import path from 'path';
import { simpleGit, SimpleGit } from 'simple-git';
import type { FileNode, SearchFileResult, SearchMatch, SearchResponse } from '../types/index.js';

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
    return IGNORED_PATTERNS.includes(name);
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

  async toggleCheckbox(relativePath: string, checkboxIndex: number): Promise<string> {
    // Only allow markdown files
    if (!relativePath.endsWith('.md') && !relativePath.endsWith('.markdown')) {
      throw new Error('Checkbox toggle only supported for markdown files');
    }

    const absolutePath = this.validatePath(relativePath);
    const content = await fs.readFile(absolutePath, 'utf-8');

    // Find all checkboxes and toggle the one at the given index
    const checkboxPattern = /- \[([ xX])\]/g;
    let currentIndex = 0;
    let newContent = content;

    newContent = content.replace(checkboxPattern, (match, checkState) => {
      if (currentIndex === checkboxIndex) {
        currentIndex++;
        // Toggle: if checked, uncheck; if unchecked, check
        const isChecked = checkState.toLowerCase() === 'x';
        return isChecked ? '- [ ]' : '- [x]';
      }
      currentIndex++;
      return match;
    });

    if (currentIndex <= checkboxIndex) {
      throw new Error(`Checkbox index ${checkboxIndex} not found`);
    }

    await fs.writeFile(absolutePath, newContent, 'utf-8');
    return newContent;
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

  async search(
    query: string,
    options: { regex?: boolean; caseSensitive?: boolean } = {},
  ): Promise<SearchResponse> {
    const MAX_FILE_SIZE = 2 * 1024 * 1024; // skip files over 2MB
    const MAX_TOTAL_MATCHES = 2000;
    const MAX_MATCHES_PER_FILE = 200;
    const BATCH_SIZE = 16;

    const flags = options.caseSensitive ? 'g' : 'gi';
    let pattern: RegExp;
    if (options.regex) {
      try {
        pattern = new RegExp(query, flags);
      } catch {
        throw new Error('Invalid regular expression');
      }
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = new RegExp(escaped, flags);
    }

    const files = await this.getAllFiles();
    const results: SearchFileResult[] = [];
    let totalMatches = 0;
    let truncated = false;

    for (let i = 0; i < files.length && !truncated; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((file) => this.searchFile(file, pattern, MAX_FILE_SIZE, MAX_MATCHES_PER_FILE)),
      );

      for (const result of batchResults) {
        if (!result) continue;
        if (totalMatches + result.matches.length > MAX_TOTAL_MATCHES) {
          result.matches = result.matches.slice(0, MAX_TOTAL_MATCHES - totalMatches);
          truncated = true;
        }
        if (result.matches.length > 0) {
          results.push(result);
          totalMatches += result.matches.length;
        }
      }
    }

    return { results, totalMatches, truncated };
  }

  private async searchFile(
    relativePath: string,
    pattern: RegExp,
    maxSize: number,
    maxMatches: number,
  ): Promise<SearchFileResult | null> {
    let content: string;
    try {
      const absolutePath = this.validatePath(relativePath);
      const stats = await fs.stat(absolutePath);
      if (!stats.isFile() || stats.size > maxSize) return null;
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch {
      // Unreadable or deleted-but-still-listed files are silently skipped
      return null;
    }

    // Skip binary files (NUL byte heuristic)
    if (content.includes('\u0000')) return null;

    const matches: SearchMatch[] = [];
    const lines = content.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length && matches.length < maxMatches; lineIndex++) {
      const line = lines[lineIndex];
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;

      while ((m = pattern.exec(line)) !== null && matches.length < maxMatches) {
        matches.push(buildMatch(line, lineIndex + 1, m.index, m[0].length));
        // Zero-length matches (e.g. regex `a*`) would loop forever otherwise
        if (m[0].length === 0) pattern.lastIndex++;
      }
    }

    return { path: relativePath, matches };
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

// Window the line around a match so previews stay small even on minified lines
function buildMatch(line: string, lineNumber: number, index: number, length: number): SearchMatch {
  const BEFORE_CHARS = 80;
  const AFTER_CHARS = 120;
  const MAX_MATCH_CHARS = 200;

  let before = line.slice(Math.max(0, index - BEFORE_CHARS), index);
  if (index > BEFORE_CHARS) before = '…' + before;

  let match = line.slice(index, index + length);
  if (match.length > MAX_MATCH_CHARS) match = match.slice(0, MAX_MATCH_CHARS) + '…';

  const afterStart = index + length;
  let after = line.slice(afterStart, afterStart + AFTER_CHARS);
  if (line.length > afterStart + AFTER_CHARS) after = after + '…';

  return { line: lineNumber, before, match, after };
}
