import { useCallback, useMemo, useState } from 'react';
import { Tree, NodeRendererProps, NodeApi } from 'react-arborist';
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

  // Fetch root level
  const { data: rootNodes, isLoading: rootLoading } = useFileTree('');
  const { data: changedFiles } = useChangedFiles();

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

  if (rootLoading) {
    return (
      <div className={styles.loading}>
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span>EXPLORER</span>
      </div>
      <Tree
        data={treeData}
        openByDefault={false}
        width="100%"
        height={800}
        indent={16}
        rowHeight={24}
        overscanCount={5}
        onToggle={handleToggle}
        onSelect={handleSelect}
        selection={selectedFile || undefined}
      >
        {Node}
      </Tree>
    </div>
  );
}
