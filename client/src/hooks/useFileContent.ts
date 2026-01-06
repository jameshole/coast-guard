import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export function useFileContent(path: string | null) {
  return useQuery({
    queryKey: ['fileContent', path],
    queryFn: () => (path ? api.getFileContent(path) : Promise.resolve({ content: '' })),
    enabled: !!path,
    staleTime: 60000, // 1 minute
  });
}
