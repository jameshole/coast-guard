import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export function useFileTree(path: string = '') {
  return useQuery({
    queryKey: ['fileTree', path],
    queryFn: () => api.getFileTree(path, 1),
    staleTime: 30000, // 30 seconds
  });
}

export function useProjectInfo() {
  return useQuery({
    queryKey: ['projectInfo'],
    queryFn: api.getProjectInfo,
    staleTime: Infinity, // Project info doesn't change
  });
}
