import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronRight, ChevronDown, Search } from 'lucide-react';
import { getFileIcon, getFileIconColor } from '../FileTree/fileIcons';
import { api } from '../../services/api';
import styles from './SearchPanel.module.css';

interface SearchPanelProps {
  onOpenAtLine: (path: string, line: number) => void;
  /** Incremented by the parent to pull focus back to the query input. */
  focusToken: number;
}

export function SearchPanel({ onOpenAtLine, focusToken }: SearchPanelProps) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  // Debounce keystrokes so we don't hammer the server while typing
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const enabled = query.length >= 2;
  const { data, error, isFetching } = useQuery({
    queryKey: ['search', query, useRegex, caseSensitive],
    queryFn: () => api.searchFiles(query, useRegex, caseSensitive),
    enabled,
    staleTime: 10000,
    retry: false,
    placeholderData: keepPreviousData,
  });

  // Collapse state resets whenever a new result set arrives
  useEffect(() => {
    setCollapsedFiles(new Set());
  }, [data]);

  const toggleFile = (path: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const summary = useMemo(() => {
    if (!data) return null;
    if (data.totalMatches === 0) return 'No results';
    const files = data.results.length;
    return `${data.totalMatches}${data.truncated ? '+' : ''} result${data.totalMatches === 1 ? '' : 's'} in ${files} file${files === 1 ? '' : 's'}`;
  }, [data]);

  return (
    <div className={styles.container}>
      <div className={styles.searchRow}>
        <div className={styles.inputWrapper}>
          <Search size={13} className={styles.searchIcon} />
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search"
            spellCheck={false}
          />
          <button
            className={`${styles.toggle} ${caseSensitive ? styles.toggleActive : ''}`}
            onClick={() => setCaseSensitive((v) => !v)}
            title="Match Case"
          >
            Aa
          </button>
          <button
            className={`${styles.toggle} ${useRegex ? styles.toggleActive : ''}`}
            onClick={() => setUseRegex((v) => !v)}
            title="Use Regular Expression"
          >
            .*
          </button>
        </div>
      </div>

      {error && enabled && (
        <div className={styles.error}>{error instanceof Error ? error.message : 'Search failed'}</div>
      )}

      {!error && summary && enabled && (
        <div className={`${styles.summary} ${isFetching ? styles.stale : ''}`}>
          {summary}
          {data?.truncated && <span className={styles.truncatedNote}> (truncated)</span>}
        </div>
      )}

      <div className={styles.results}>
        {enabled && !error && data?.results.map((file) => {
          const name = file.path.split('/').pop() || file.path;
          const dir = file.path.split('/').slice(0, -1).join('/');
          const Icon = getFileIcon(name, false, false);
          const iconColor = getFileIconColor(name, false);
          const collapsed = collapsedFiles.has(file.path);

          return (
            <div key={file.path}>
              <div className={styles.fileHeader} onClick={() => toggleFile(file.path)} title={file.path}>
                {collapsed ? <ChevronRight size={14} className={styles.chevron} /> : <ChevronDown size={14} className={styles.chevron} />}
                <Icon size={14} style={{ color: iconColor }} className={styles.fileIcon} />
                <span className={styles.fileName}>{name}</span>
                {dir && <span className={styles.filePath}>{dir}</span>}
                <span className={styles.count}>{file.matches.length}</span>
              </div>
              {!collapsed && file.matches.map((m, i) => (
                <div
                  key={`${m.line}-${i}`}
                  className={styles.match}
                  onClick={() => onOpenAtLine(file.path, m.line)}
                >
                  <span className={styles.lineNumber}>{m.line}</span>
                  <span className={styles.preview}>
                    {m.before}
                    <mark className={styles.highlight}>{m.match}</mark>
                    {m.after}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
        {!enabled && input.trim().length < 2 && (
          <div className={styles.hint}>Type at least 2 characters to search</div>
        )}
      </div>
    </div>
  );
}
