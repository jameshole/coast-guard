import type { FileNode, GitStatus, FileDiff, ProjectInfo, GitFileStatus, DefinitionResult } from '../types';

const API_BASE = '/api';

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || 'Request failed');
  }
  return response.json();
}

async function putJSON<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || 'Request failed');
  }
  return response.json();
}

export const api = {
  // Project
  getProjectInfo: (): Promise<ProjectInfo> => fetchJSON('/project'),

  // Files
  getFileTree: (path: string = '', depth: number = 1): Promise<FileNode[]> =>
    fetchJSON(`/files/tree?path=${encodeURIComponent(path)}&depth=${depth}`),

  getFileContent: (path: string): Promise<{ content: string }> =>
    fetchJSON(`/files/content?path=${encodeURIComponent(path)}`),

  getAllFiles: (): Promise<string[]> => fetchJSON('/files/all'),

  // Git
  checkGitRepo: (): Promise<{ isGitRepo: boolean }> => fetchJSON('/git/check'),

  getGitBranch: (): Promise<{ branch: string | null }> => fetchJSON('/git/branch'),

  getGitBranches: (): Promise<{ branches: string[] }> => fetchJSON('/git/branches'),

  verifyGitRef: (ref: string): Promise<{ valid: boolean }> =>
    fetchJSON(`/git/verify-ref?ref=${encodeURIComponent(ref)}`),

  getGitStatus: (): Promise<GitStatus> => fetchJSON('/git/status'),

  getFileDiff: (
    file: string,
    ignoreWhitespace: boolean = false,
    baseRef: string = 'HEAD',
  ): Promise<FileDiff> =>
    fetchJSON(
      `/git/diff?file=${encodeURIComponent(file)}&ignoreWhitespace=${ignoreWhitespace}&baseRef=${encodeURIComponent(baseRef)}`,
    ),

  getChangedFiles: (baseRef: string = 'HEAD'): Promise<Record<string, GitFileStatus>> =>
    fetchJSON(`/git/changed-files?baseRef=${encodeURIComponent(baseRef)}`),

  // Definitions
  getDefinition: (filePath: string, offset: number): Promise<DefinitionResult[]> =>
    fetchJSON(`/files/definitions?filePath=${encodeURIComponent(filePath)}&offset=${offset}`),

  // Markdown
  toggleCheckbox: (path: string, index: number): Promise<{ content: string }> =>
    putJSON('/files/checkbox', { path, index }),
};
