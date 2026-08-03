import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

interface Settings {
  gitWatchEnabled: boolean;
}

export function useSettings() {
  return useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: api.getSettings,
    staleTime: Infinity,
  });
}

/**
 * Whether git watching (server-side status polling + client auto-refetch) is on.
 * Defaults to true while the setting is loading so nothing changes on first paint.
 */
export function useGitWatchEnabled(): boolean {
  const { data } = useSettings();
  return data?.gitWatchEnabled ?? true;
}

export function useToggleGitWatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (enabled: boolean) => api.setGitWatchEnabled(enabled),
    onSuccess: (settings) => {
      queryClient.setQueryData(['settings'], settings);
      if (settings.gitWatchEnabled) {
        // Re-enabled: catch up on anything that changed while we weren't watching
        for (const key of ['gitStatus', 'changedFiles', 'diffStats', 'fileDiff', 'fileBlame']) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
      }
    },
  });
}
