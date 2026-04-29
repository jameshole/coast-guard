import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export function useGitCheck() {
  return useQuery({
    queryKey: ['gitCheck'],
    queryFn: api.checkGitRepo,
    staleTime: Infinity,
  });
}

export function useGitBranch() {
  return useQuery({
    queryKey: ['gitBranch'],
    queryFn: api.getGitBranch,
    staleTime: 30000, // 30 seconds
  });
}

export function useGitBranches() {
  return useQuery({
    queryKey: ['gitBranches'],
    queryFn: api.getGitBranches,
    staleTime: 60000,
  });
}

export function useGitStatus() {
  return useQuery({
    queryKey: ['gitStatus'],
    queryFn: api.getGitStatus,
    staleTime: 10000, // 10 seconds - git status can change frequently
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });
}

export function useChangedFiles(baseRef: string = 'HEAD') {
  return useQuery({
    queryKey: ['changedFiles', baseRef],
    queryFn: () => api.getChangedFiles(baseRef),
    staleTime: 10000,
    refetchInterval: 30000,
  });
}

export function useDiffStats(baseRef: string = 'HEAD') {
  return useQuery({
    queryKey: ['diffStats', baseRef],
    queryFn: () => api.getDiffStats(baseRef),
    staleTime: 10000,
    refetchInterval: 30000,
  });
}

export function useFileDiff(
  path: string | null,
  ignoreWhitespace: boolean = false,
  baseRef: string = 'HEAD',
) {
  return useQuery({
    queryKey: ['fileDiff', path, ignoreWhitespace, baseRef],
    queryFn: () =>
      path
        ? api.getFileDiff(path, ignoreWhitespace, baseRef)
        : Promise.resolve({ staged: null, unstaged: null }),
    enabled: !!path,
    staleTime: 10000,
  });
}
