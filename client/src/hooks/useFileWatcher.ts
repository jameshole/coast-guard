import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface FileChangeEvent {
  type: 'change' | 'gitStatus' | 'connected' | 'shutdown';
  path?: string;
  changedFiles?: string[];
}

export function useFileWatcher(currentFile: string | null): { connected: boolean } {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const currentFileRef = useRef<string | null>(currentFile);
  const [connected, setConnected] = useState(true);

  // Keep ref updated
  currentFileRef.current = currentFile;

  useEffect(() => {
    const connect = () => {
      // Determine WebSocket URL based on current page location
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('File watcher connected');
        setConnected(true);
        // Send current file to watch
        if (currentFileRef.current) {
          ws.send(JSON.stringify({ type: 'watchFile', path: currentFileRef.current }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data: FileChangeEvent = JSON.parse(event.data);

          if (data.type === 'connected') {
            return;
          }

          if (data.type === 'shutdown') {
            window.close();
            return;
          }

          if (data.type === 'change' && data.path) {
            // Specific file changed - invalidate its content and diff
            queryClient.invalidateQueries({ queryKey: ['fileContent', data.path] });
            queryClient.invalidateQueries({ queryKey: ['fileDiff', data.path] });
          }

          if (data.type === 'gitStatus') {
            // Git status changed - invalidate git-related queries
            queryClient.invalidateQueries({ queryKey: ['gitStatus'] });
            queryClient.invalidateQueries({ queryKey: ['changedFiles'] });

            // Invalidate ALL file content/diff queries since any file could have changed
            // This ensures reopening a previously viewed file shows fresh content
            queryClient.invalidateQueries({ queryKey: ['fileContent'] });
            queryClient.invalidateQueries({ queryKey: ['fileDiff'] });

            // Also refresh file tree in case files were added/removed
            queryClient.invalidateQueries({ queryKey: ['fileTree'] });
            queryClient.invalidateQueries({ queryKey: ['allFiles'] });
          }
        } catch (err) {
          console.error('Failed to parse file change event:', err);
        }
      };

      ws.onclose = () => {
        console.log('File watcher disconnected, reconnecting in 2s...');
        setConnected(false);
        // Attempt to reconnect after 2 seconds
        reconnectTimeoutRef.current = window.setTimeout(connect, 2000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [queryClient]);

  // Send watchFile message when current file changes
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'watchFile', path: currentFile }));
    }
  }, [currentFile]);

  return { connected };
}
