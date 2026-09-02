import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { useGitWatchEnabled } from './useSettings';

export function useGitCheck() {
  return useQuery({
    queryKey: ['gitCheck'],
    queryFn: api.checkGitRepo,
    staleTime: Infinity,
  });
}

/**
 * Whether the project is a git repository. False while the check is loading,
 * so every git query below stays idle until we know git is usable at all —
 * outside a repo none of them are ever fetched.
 */
export function useIsGitRepo(): boolean {
  const { data } = useGitCheck();
  return data?.isGitRepo ?? false;
}

export function useGitBranch() {
  const isGitRepo = useIsGitRepo();
  return useQuery({
    queryKey: ['gitBranch'],
    queryFn: api.getGitBranch,
    enabled: isGitRepo,
    staleTime: 30000, // 30 seconds
  });
}

export function useGitBranches() {
  const isGitRepo = useIsGitRepo();
  return useQuery({
    queryKey: ['gitBranches'],
    queryFn: api.getGitBranches,
    enabled: isGitRepo,
    staleTime: 60000,
  });
}

export function useGitStatus() {
  const isGitRepo = useIsGitRepo();
  const gitWatchEnabled = useGitWatchEnabled();
  return useQuery({
    queryKey: ['gitStatus'],
    queryFn: api.getGitStatus,
    enabled: isGitRepo,
    staleTime: 10000, // 10 seconds - git status can change frequently
    // Auto-refresh every 30 seconds, unless git watching is turned off
    refetchInterval: gitWatchEnabled ? 30000 : false,
  });
}

export function useChangedFiles(baseRef: string = 'HEAD') {
  const isGitRepo = useIsGitRepo();
  const gitWatchEnabled = useGitWatchEnabled();
  return useQuery({
    queryKey: ['changedFiles', baseRef],
    queryFn: () => api.getChangedFiles(baseRef),
    enabled: isGitRepo,
    staleTime: 10000,
    refetchInterval: gitWatchEnabled ? 30000 : false,
  });
}

export function useDiffStats(baseRef: string = 'HEAD') {
  const isGitRepo = useIsGitRepo();
  const gitWatchEnabled = useGitWatchEnabled();
  return useQuery({
    queryKey: ['diffStats', baseRef],
    queryFn: () => api.getDiffStats(baseRef),
    enabled: isGitRepo,
    staleTime: 10000,
    refetchInterval: gitWatchEnabled ? 30000 : false,
  });
}

// Blame for the working-tree version of a file. Pass null to disable the
// query entirely (blame is only fetched while the blame column is visible).
export function useFileBlame(path: string | null) {
  const isGitRepo = useIsGitRepo();
  return useQuery({
    queryKey: ['fileBlame', path],
    queryFn: () => api.getFileBlame(path!),
    enabled: !!path && isGitRepo,
    staleTime: 10000,
  });
}

export function useFileDiff(
  path: string | null,
  ignoreWhitespace: boolean = false,
  baseRef: string = 'HEAD',
) {
  const isGitRepo = useIsGitRepo();
  return useQuery({
    queryKey: ['fileDiff', path, ignoreWhitespace, baseRef],
    queryFn: () =>
      path
        ? api.getFileDiff(path, ignoreWhitespace, baseRef)
        : Promise.resolve({ staged: null, unstaged: null }),
    enabled: !!path && isGitRepo,
    staleTime: 10000,
  });
}
