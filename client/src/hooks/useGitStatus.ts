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

export function useGitStatus() {
  return useQuery({
    queryKey: ['gitStatus'],
    queryFn: api.getGitStatus,
    staleTime: 10000, // 10 seconds - git status can change frequently
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });
}

export function useChangedFiles() {
  return useQuery({
    queryKey: ['changedFiles'],
    queryFn: api.getChangedFiles,
    staleTime: 10000,
    refetchInterval: 30000,
  });
}

export function useFileDiff(path: string | null) {
  return useQuery({
    queryKey: ['fileDiff', path],
    queryFn: () => (path ? api.getFileDiff(path) : Promise.resolve({ staged: null, unstaged: null })),
    enabled: !!path,
    staleTime: 10000,
  });
}
