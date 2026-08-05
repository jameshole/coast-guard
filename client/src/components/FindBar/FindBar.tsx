import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import styles from './FindBar.module.css';

// Hard cap so pathological queries (e.g. single char in a huge file) can't
// build an unbounded match list.
export const FIND_MATCH_LIMIT = 5000;

/**
 * Builds a matcher for the current find settings, or null when the query is
 * empty / an invalid regex. The matcher returns [startCol, endCol) pairs for
 * every occurrence in the given text.
 */
export function createFindMatcher(
  query: string,
  caseSensitive: boolean,
  useRegex: boolean,
): ((text: string) => Array<[number, number]>) | null {
  if (query === '') return null;

  if (useRegex) {
    let re: RegExp;
    try {
      re = new RegExp(query, caseSensitive ? 'g' : 'gi');
    } catch {
      return null;
    }
    return (text: string) => {
      re.lastIndex = 0;
      const out: Array<[number, number]> = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m[0] === '') {
          re.lastIndex++;
          continue;
        }
        out.push([m.index, m.index + m[0].length]);
      }
      return out;
    };
  }

  const needle = caseSensitive ? query : query.toLowerCase();
  return (text: string) => {
    const hay = caseSensitive ? text : text.toLowerCase();
    const out: Array<[number, number]> = [];
    let idx = hay.indexOf(needle);
    while (idx !== -1) {
      out.push([idx, idx + needle.length]);
      idx = hay.indexOf(needle, idx + needle.length);
    }
    return out;
  };
}

export interface FindBarState {
  open: boolean;
  query: string;
  setQuery: (query: string) => void;
  caseSensitive: boolean;
  toggleCaseSensitive: () => void;
  useRegex: boolean;
  toggleRegex: () => void;
  activeIndex: number;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  focusToken: number;
  regexInvalid: boolean;
  close: () => void;
}

/**
 * Find-bar state shared by the file viewers. While `enabled`, Cmd/Ctrl+F opens
 * (or refocuses) the bar instead of the browser's page-wide search, which
 * would also match the surrounding app UI.
 */
export function useFindBarState(enabled: boolean): FindBarState {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [focusToken, setFocusToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'f' || e.altKey || e.shiftKey) return;
      e.preventDefault();
      setOpen(true);
      setFocusToken((t) => t + 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);

  const regexInvalid = useMemo(() => {
    if (!useRegex || query === '') return false;
    try {
      new RegExp(query);
      return false;
    } catch {
      return true;
    }
  }, [useRegex, query]);

  const toggleCaseSensitive = useCallback(() => setCaseSensitive((v) => !v), []);
  const toggleRegex = useCallback(() => setUseRegex((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  return {
    open,
    query,
    setQuery,
    caseSensitive,
    toggleCaseSensitive,
    useRegex,
    toggleRegex,
    activeIndex,
    setActiveIndex,
    focusToken,
    regexInvalid,
    close,
  };
}

interface FindBarProps {
  find: FindBarState;
  matchCount: number;
  /** True when the match list was cut off at FIND_MATCH_LIMIT */
  capped?: boolean;
  onNavigate: (dir: 1 | -1) => void;
}

export function FindBar({ find, matchCount, capped = false, onNavigate }: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (find.open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [find.open, find.focusToken]);

  if (!find.open) return null;

  const countText = find.regexInvalid
    ? 'Bad pattern'
    : find.query === ''
      ? ''
      : matchCount === 0
        ? 'No results'
        : `${find.activeIndex + 1}/${matchCount}${capped ? '+' : ''}`;

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onNavigate(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      find.close();
    }
  };

  return (
    <div className={styles.findBar}>
      <Search size={13} className={styles.findIcon} />
      <input
        ref={inputRef}
        className={styles.findInput}
        type="text"
        value={find.query}
        onChange={(e) => find.setQuery(e.target.value)}
        onKeyDown={handleInputKeyDown}
        placeholder="Find in file"
        spellCheck={false}
      />
      <button
        className={`${styles.findToggle} ${find.caseSensitive ? styles.findToggleActive : ''}`}
        onClick={find.toggleCaseSensitive}
        title="Match Case"
      >
        Aa
      </button>
      <button
        className={`${styles.findToggle} ${find.useRegex ? styles.findToggleActive : ''}`}
        onClick={find.toggleRegex}
        title="Use Regular Expression"
      >
        .*
      </button>
      {countText && (
        <span className={`${styles.findCount} ${find.regexInvalid ? styles.findCountError : ''}`}>
          {countText}
        </span>
      )}
      <button
        className={styles.findNavButton}
        onClick={() => onNavigate(-1)}
        disabled={matchCount === 0}
        title="Previous match (Shift+Enter)"
      >
        <ChevronUp size={14} />
      </button>
      <button
        className={styles.findNavButton}
        onClick={() => onNavigate(1)}
        disabled={matchCount === 0}
        title="Next match (Enter)"
      >
        <ChevronDown size={14} />
      </button>
      <button className={styles.findNavButton} onClick={find.close} title="Close (Escape)">
        <X size={14} />
      </button>
    </div>
  );
}
