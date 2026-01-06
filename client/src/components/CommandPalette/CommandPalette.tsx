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

// Normalize text for matching: expand camelCase and treat separators uniformly
function normalizeForSearch(text: string): string {
  // Insert space before uppercase letters (camelCase -> camel Case)
  // Then lowercase and replace all separators with space
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[-_./]/g, ' ');
}

// Fuzzy search with separator/camelCase tolerance
function fuzzyMatch(pattern: string, text: string): { matches: boolean; score: number } {
  const normalizedPattern = normalizeForSearch(pattern);
  const normalizedText = normalizeForSearch(text);

  const patternParts = normalizedPattern.split(/\s+/).filter(Boolean);
  const textLower = text.toLowerCase();

  let score = 0;
  let lastMatchEnd = -1;

  // Check if all pattern parts appear in order in the normalized text
  let searchStart = 0;
  for (const part of patternParts) {
    const idx = normalizedText.indexOf(part, searchStart);
    if (idx === -1) {
      // Try character-by-character fuzzy match as fallback
      let partIdx = 0;
      let found = false;
      for (let i = searchStart; i < normalizedText.length && partIdx < part.length; i++) {
        if (normalizedText[i] === part[partIdx]) {
          partIdx++;
        }
      }
      if (partIdx < part.length) {
        return { matches: false, score: 0 };
      }
      found = true;
      if (!found) return { matches: false, score: 0 };
    } else {
      // Bonus for consecutive/close matches
      if (lastMatchEnd >= 0 && idx <= lastMatchEnd + 2) {
        score += 15;
      }
      searchStart = idx + part.length;
      lastMatchEnd = searchStart;
      score += part.length * 2;
    }
  }

  // Bonus for matching in filename (after last /)
  const lastSlash = text.lastIndexOf('/');
  const filename = textLower.substring(lastSlash + 1);
  const normalizedFilename = normalizeForSearch(filename);

  for (const part of patternParts) {
    if (normalizedFilename.includes(part)) {
      score += 10;
    }
  }

  // Bonus for shorter paths (more specific matches)
  score += Math.max(0, 50 - text.length / 2);

  return { matches: true, score };
}

// Find ALL contiguous substrings to highlight (not just first match)
function findHighlightRanges(query: string, text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const textLower = text.toLowerCase();

  // Split query into parts (by separators)
  const queryParts = query.toLowerCase().split(/[-_.\s/]+/).filter(Boolean);

  for (const part of queryParts) {
    if (part.length === 0) continue;

    // Find ALL occurrences of this part in the text
    let searchStart = 0;
    while (searchStart < textLower.length) {
      const idx = textLower.indexOf(part, searchStart);
      if (idx !== -1) {
        ranges.push([idx, idx + part.length]);
        searchStart = idx + 1;
      } else {
        break;
      }
    }

    // Also try to find camelCase matches (e.g., "join" matches "Join" in "programJoin")
    // Use a regex to find the part with optional lowercase letters before it
    const camelCaseRegex = new RegExp(part, 'gi');
    let match;
    while ((match = camelCaseRegex.exec(text)) !== null) {
      const idx = match.index;
      // Check if already added (from lowercase search)
      const alreadyExists = ranges.some(([start, end]) =>
        start === idx && end === idx + part.length
      );
      if (!alreadyExists) {
        ranges.push([idx, idx + part.length]);
      }
    }
  }

  // Sort and merge overlapping ranges
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    if (merged.length === 0 || merged[merged.length - 1][1] < range[0]) {
      merged.push(range);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], range[1]);
    }
  }

  return merged;
}

// Truncate text from the left, keeping maxLength chars and adjusting highlight ranges
function truncateFromLeft(
  text: string,
  ranges: Array<[number, number]>,
  maxLength: number
): { text: string; ranges: Array<[number, number]> } {
  if (text.length <= maxLength) {
    return { text, ranges };
  }

  const ellipsis = '…';
  const truncateAt = text.length - maxLength + ellipsis.length;

  // Adjust ranges to account for truncation
  const adjustedRanges: Array<[number, number]> = [];
  for (const [start, end] of ranges) {
    if (end <= truncateAt) {
      // Range is entirely in truncated portion, skip it
      continue;
    }
    if (start < truncateAt) {
      // Range starts in truncated portion, clip it
      adjustedRanges.push([ellipsis.length, end - truncateAt + ellipsis.length]);
    } else {
      // Range is after truncation point
      adjustedRanges.push([start - truncateAt + ellipsis.length, end - truncateAt + ellipsis.length]);
    }
  }

  return {
    text: ellipsis + text.substring(truncateAt),
    ranges: adjustedRanges,
  };
}

function HighlightedText({ text, query, maxLength = 60 }: { text: string; query: string; maxLength?: number }) {
  const ranges = query.trim() ? findHighlightRanges(query, text) : [];
  const { text: displayText, ranges: displayRanges } = truncateFromLeft(text, ranges, maxLength);

  if (displayRanges.length === 0) {
    return <>{displayText}</>;
  }

  const parts: JSX.Element[] = [];
  let lastEnd = 0;

  for (let i = 0; i < displayRanges.length; i++) {
    const [start, end] = displayRanges[i];

    // Add non-highlighted part before this range
    if (start > lastEnd) {
      parts.push(<span key={`text-${i}`}>{displayText.substring(lastEnd, start)}</span>);
    }

    // Add highlighted part
    parts.push(
      <mark key={`mark-${i}`} className={styles.highlight}>
        {displayText.substring(start, end)}
      </mark>
    );

    lastEnd = end;
  }

  // Add remaining text
  if (lastEnd < displayText.length) {
    parts.push(<span key="text-last">{displayText.substring(lastEnd)}</span>);
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
      return allFiles.slice(0, 20).map((path) => ({ path, score: 0 }));
    }

    const results: Array<{ path: string; score: number }> = [];

    for (const path of allFiles) {
      const { matches, score } = fuzzyMatch(query, path);
      if (matches) {
        results.push({ path, score });
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
                <HighlightedText text={result.path} query={query} />
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
