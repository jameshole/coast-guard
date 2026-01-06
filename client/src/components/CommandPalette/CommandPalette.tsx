import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { File, Search } from 'lucide-react';
import { api } from '../../services/api';
import styles from './CommandPalette.module.css';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFile: (path: string) => void;
}

// Simple fuzzy search implementation
function fuzzyMatch(pattern: string, text: string): { matches: boolean; score: number; indices: number[] } {
  const patternLower = pattern.toLowerCase();
  const textLower = text.toLowerCase();
  const indices: number[] = [];

  let patternIdx = 0;
  let score = 0;
  let lastMatchIdx = -1;

  for (let i = 0; i < textLower.length && patternIdx < patternLower.length; i++) {
    if (textLower[i] === patternLower[patternIdx]) {
      indices.push(i);

      // Bonus for consecutive matches
      if (lastMatchIdx === i - 1) {
        score += 10;
      }

      // Bonus for matching at start of word
      if (i === 0 || text[i - 1] === '/' || text[i - 1] === '.' || text[i - 1] === '-' || text[i - 1] === '_') {
        score += 5;
      }

      // Bonus for matching filename (after last /)
      const lastSlash = text.lastIndexOf('/');
      if (i > lastSlash) {
        score += 2;
      }

      lastMatchIdx = i;
      patternIdx++;
      score += 1;
    }
  }

  return {
    matches: patternIdx === patternLower.length,
    score,
    indices,
  };
}

function HighlightedText({ text, indices }: { text: string; indices: number[] }) {
  const indicesSet = new Set(indices);
  const parts: JSX.Element[] = [];
  let currentPart = '';
  let isHighlighted = false;

  for (let i = 0; i < text.length; i++) {
    const shouldHighlight = indicesSet.has(i);

    if (shouldHighlight !== isHighlighted) {
      if (currentPart) {
        parts.push(
          isHighlighted ? (
            <mark key={i} className={styles.highlight}>{currentPart}</mark>
          ) : (
            <span key={i}>{currentPart}</span>
          )
        );
      }
      currentPart = text[i];
      isHighlighted = shouldHighlight;
    } else {
      currentPart += text[i];
    }
  }

  if (currentPart) {
    parts.push(
      isHighlighted ? (
        <mark key="last" className={styles.highlight}>{currentPart}</mark>
      ) : (
        <span key="last">{currentPart}</span>
      )
    );
  }

  return <>{parts}</>;
}

export function CommandPalette({ isOpen, onClose, onSelectFile }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch all files
  const { data: allFiles } = useQuery({
    queryKey: ['allFiles'],
    queryFn: api.getAllFiles,
    staleTime: 60000, // 1 minute
    enabled: isOpen,
  });

  // Filter and sort files based on query
  const filteredFiles = useMemo(() => {
    if (!allFiles) return [];
    if (!query.trim()) {
      // Show first 20 files when no query
      return allFiles.slice(0, 20).map((path) => ({ path, score: 0, indices: [] as number[] }));
    }

    const results: Array<{ path: string; score: number; indices: number[] }> = [];

    for (const path of allFiles) {
      const { matches, score, indices } = fuzzyMatch(query, path);
      if (matches) {
        results.push({ path, score, indices });
      }
    }

    // Sort by score (highest first)
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, 50);
  }, [allFiles, query]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredFiles.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredFiles[selectedIndex]) {
            onSelectFile(filteredFiles[selectedIndex].path);
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredFiles, selectedIndex, onSelectFile, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.palette} onClick={(e) => e.stopPropagation()}>
        <div className={styles.inputWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files..."
            className={styles.input}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>

        <div ref={listRef} className={styles.list}>
          {filteredFiles.map((result, index) => (
            <div
              key={result.path}
              className={`${styles.item} ${index === selectedIndex ? styles.selected : ''}`}
              onClick={() => {
                onSelectFile(result.path);
                onClose();
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <File size={14} className={styles.fileIcon} />
              <span className={styles.fileName}>
                <HighlightedText text={result.path} indices={result.indices} />
              </span>
            </div>
          ))}

          {filteredFiles.length === 0 && query && (
            <div className={styles.empty}>No files found</div>
          )}
        </div>

        <div className={styles.footer}>
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
