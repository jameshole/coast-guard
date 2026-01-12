import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { Tree, NodeRendererProps, NodeApi, TreeApi } from 'react-arborist';
import { ChevronRight, ChevronDown, Circle } from 'lucide-react';
import { useFileTree } from '../../hooks/useFileTree';
import { useChangedFiles } from '../../hooks/useGitStatus';
import { getFileIcon, getFileIconColor } from './fileIcons';
import type { FileNode, GitFileStatus } from '../../types';
import styles from './FileTree.module.css';

interface TreeNode {
  id: string;
  name: string;
  isDirectory: boolean;
  children?: TreeNode[];
  gitStatus?: GitFileStatus;
}

interface FileTreeProps {
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
}

function Node({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const Icon = getFileIcon(node.data.name, node.data.isDirectory, node.isOpen);
  const iconColor = getFileIconColor(node.data.name, node.data.isDirectory);

  const gitStatusColor = useMemo(() => {
    switch (node.data.gitStatus) {
      case 'staged':
        return 'var(--git-staged)';
      case 'modified':
        return 'var(--git-modified)';
      case 'untracked':
        return 'var(--git-untracked)';
      default:
        return undefined;
    }
  }, [node.data.gitStatus]);

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`${styles.node} ${node.isSelected ? styles.selected : ''}`}
      onClick={() => node.isInternal ? node.toggle() : node.select()}
    >
      <span className={styles.arrow}>
        {node.data.isDirectory && (
          node.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
        )}
      </span>
      <Icon size={16} style={{ color: iconColor }} className={styles.icon} />
      <span className={styles.name}>{node.data.name}</span>
      {gitStatusColor && (
        <Circle
          size={8}
          fill={gitStatusColor}
          stroke="none"
          className={styles.gitIndicator}
        />
      )}
    </div>
  );
}

export function FileTree({ onFileSelect, selectedFile }: FileTreeProps) {
  const [childrenCache, setChildrenCache] = useState<Record<string, FileNode[]>>({});
  const childrenCacheRef = useRef(childrenCache);
  childrenCacheRef.current = childrenCache;
  const treeRef = useRef<TreeApi<TreeNode> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastExpandedFile = useRef<string | null>(null);
  const [treeHeight, setTreeHeight] = useState(500);

  // Fetch root level
  const { data: rootNodes, isLoading: rootLoading } = useFileTree('');
  const { data: changedFiles } = useChangedFiles();

  // Measure container height
  useEffect(() => {
    let rafId: number;

    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newHeight = window.innerHeight - rect.top;
        if (newHeight > 0) {
          setTreeHeight(newHeight);
        }
      }
    };

    // Use multiple RAF calls to ensure layout is complete
    const scheduleUpdate = () => {
      rafId = requestAnimationFrame(() => {
        rafId = requestAnimationFrame(updateHeight);
      });
    };

    scheduleUpdate();
    window.addEventListener('resize', updateHeight);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateHeight);
    };
  }, [rootNodes]); // Re-run when data loads

  // Fetch children for expanded directories
  const loadChildren = useCallback(async (path: string) => {
    if (childrenCache[path]) return;

    try {
      const response = await fetch(`/api/files/tree?path=${encodeURIComponent(path)}&depth=1`);
      const children = await response.json();
      setChildrenCache((prev) => ({ ...prev, [path]: children }));
    } catch (error) {
      console.error('Failed to load children for', path, error);
    }
  }, [childrenCache]);

  // Calculate cascaded git status for directories
  const getGitStatus = useCallback((nodePath: string, isDirectory: boolean): GitFileStatus | undefined => {
    if (!changedFiles) return undefined;

    // Direct match for files
    if (changedFiles[nodePath]) {
      return changedFiles[nodePath];
    }

    // For directories, check if any changed file is inside this directory
    if (isDirectory) {
      const prefix = nodePath + '/';
      for (const filePath of Object.keys(changedFiles)) {
        if (filePath.startsWith(prefix)) {
          // Return the "highest priority" status (staged > modified > untracked)
          const status = changedFiles[filePath];
          if (status === 'staged') return 'staged';
          if (status === 'modified') return 'modified';
          return 'untracked';
        }
      }
    }

    return undefined;
  }, [changedFiles]);

  // Build tree data with cached children
  const treeData = useMemo(() => {
    if (!rootNodes) return [];

    const buildTree = (nodes: FileNode[]): TreeNode[] => {
      return nodes.map((node) => {
        const isDir = node.type === 'directory';
        const cached = childrenCache[node.path];

        return {
          id: node.path,
          name: node.name,
          isDirectory: isDir,
          children: isDir
            ? cached
              ? buildTree(cached)
              : [] // Empty array = expandable
            : undefined,
          gitStatus: getGitStatus(node.path, isDir),
        };
      });
    };

    return buildTree(rootNodes);
  }, [rootNodes, childrenCache, getGitStatus]);

  const handleToggle = useCallback((id: string) => {
    loadChildren(id);
  }, [loadChildren]);

  const handleSelect = useCallback((nodes: NodeApi<TreeNode>[]) => {
    const node = nodes[0];
    if (node && !node.data.isDirectory) {
      onFileSelect(node.data.id);
    }
  }, [onFileSelect]);

  // Expand parent directories when a file is selected (e.g., from command palette)
  useEffect(() => {
    if (!selectedFile) return;
    if (lastExpandedFile.current === selectedFile) return;

    // Get all parent directory paths
    const parts = selectedFile.split('/');
    const parentPaths: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      parentPaths.push(parts.slice(0, i).join('/'));
    }

    let cancelled = false;

    const expandPath = async () => {
      // Process each parent directory sequentially
      for (const parentPath of parentPaths) {
        if (cancelled) return;

        // First ensure the data is cached
        if (!childrenCacheRef.current[parentPath]) {
          try {
            const response = await fetch(
              `/api/files/tree?path=${encodeURIComponent(parentPath)}&depth=1`
            );
            const children = await response.json();
            setChildrenCache((prev) => ({ ...prev, [parentPath]: children }));
            // Wait for React to process the state update
            await new Promise((resolve) => setTimeout(resolve, 50));
          } catch (error) {
            console.error('Failed to load children for', parentPath, error);
            return;
          }
        }

        // Wait for the node to be available in the tree, then open it
        let attempts = 0;
        while (attempts < 20 && !cancelled) {
          if (treeRef.current) {
            const node = treeRef.current.get(parentPath);
            if (node) {
              if (!node.isOpen) {
                node.open();
                // Wait for the tree to process the open
                await new Promise((resolve) => setTimeout(resolve, 50));
              }
              break;
            }
          }
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }

      if (!cancelled) {
        lastExpandedFile.current = selectedFile;
      }
    };

    expandPath();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile]);

  if (rootLoading) {
    return (
      <div className={styles.loading}>
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={styles.container}>
      <Tree
        ref={treeRef}
        data={treeData}
        openByDefault={false}
        width="100%"
        height={treeHeight}
        indent={16}
        rowHeight={24}
        overscanCount={5}
        onToggle={handleToggle}
        onSelect={handleSelect}
        selection={selectedFile || undefined}
        disableMultiSelection
      >
        {Node}
      </Tree>
    </div>
  );
}
