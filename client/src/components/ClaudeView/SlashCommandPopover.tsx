import { useEffect, useMemo, useRef } from 'react';
import styles from './ClaudeView.module.css';

interface SlashCommandPopoverProps {
  query: string;            // current partial command without the leading slash
  commands: string[];        // all available commands (no leading slash)
  selectedIndex: number;
  onSelect: (command: string) => void;
  onHoverIndex: (index: number) => void;
}

export function SlashCommandPopover({ query, commands, selectedIndex, onSelect, onHoverIndex }: SlashCommandPopoverProps) {
  const filtered = useMemo(() => filterCommands(commands, query), [commands, query]);
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll the selected item into view as selection moves
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (filtered.length === 0) return null;

  return (
    <div className={styles.slashPopover} ref={listRef}>
      <div className={styles.slashPopoverHeader}>
        <span>slash commands</span>
        <span className={styles.slashPopoverCount}>{filtered.length}</span>
      </div>
      <div className={styles.slashPopoverList}>
        {filtered.map((cmd, idx) => (
          <button
            key={cmd}
            type="button"
            data-index={idx}
            className={`${styles.slashPopoverItem} ${idx === selectedIndex ? styles.slashPopoverItemActive : ''}`}
            onMouseDown={(e) => {
              // mousedown (not click) so the textarea doesn't lose focus + blur before we run
              e.preventDefault();
              onSelect(cmd);
            }}
            onMouseEnter={() => onHoverIndex(idx)}
          >
            <span className={styles.slashPopoverCmd}>/{cmd}</span>
          </button>
        ))}
      </div>
      <div className={styles.slashPopoverFooter}>
        <span><kbd>tab</kbd> insert</span>
        <span><kbd>↑↓</kbd> navigate</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </div>
  );
}

// Sort: exact start with prefix first, then substring matches, both alphabetically.
export function filterCommands(all: string[], query: string): string[] {
  const q = query.toLowerCase();
  if (q === '') return all.slice().sort((a, b) => a.localeCompare(b));
  const startsWith: string[] = [];
  const contains: string[] = [];
  for (const c of all) {
    const lc = c.toLowerCase();
    if (lc.startsWith(q)) startsWith.push(c);
    else if (lc.includes(q)) contains.push(c);
  }
  startsWith.sort((a, b) => a.localeCompare(b));
  contains.sort((a, b) => a.localeCompare(b));
  return [...startsWith, ...contains];
}
