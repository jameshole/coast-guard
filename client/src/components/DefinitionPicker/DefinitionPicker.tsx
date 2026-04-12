import { useCallback, useEffect, useRef, useState } from 'react';
import { Code } from 'lucide-react';
import type { DefinitionResult } from '../../types';
import styles from './DefinitionPicker.module.css';

interface DefinitionPickerProps {
  results: DefinitionResult[];
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (result: DefinitionResult) => void;
}

export function DefinitionPicker({ results, symbol, isOpen, onClose, onSelect }: DefinitionPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
      containerRef.current?.focus();
    }
  }, [isOpen]);

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
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            onSelect(results[selectedIndex]);
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, selectedIndex, onSelect, onClose]
  );

  if (!isOpen || results.length === 0) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={containerRef}
        className={styles.picker}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <span className={styles.title}>
            Definitions of <strong>{symbol}</strong>
          </span>
          <span className={styles.count}>{results.length} results</span>
        </div>

        <div ref={listRef} className={styles.list}>
          {results.map((result, index) => (
            <div
              key={`${result.filePath}:${result.line}`}
              className={`${styles.item} ${index === selectedIndex ? styles.selected : ''}`}
              onClick={() => {
                onSelect(result);
                onClose();
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <Code size={14} className={styles.icon} />
              <div className={styles.itemContent}>
                <span className={styles.filePath}>
                  {result.filePath}
                  <span className={styles.lineNum}>:{result.line}</span>
                </span>
                <span className={styles.context}>{result.context}</span>
              </div>
            </div>
          ))}
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
