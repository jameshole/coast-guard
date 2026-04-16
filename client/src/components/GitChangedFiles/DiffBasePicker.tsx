import { useEffect, useRef, useState } from 'react';
import { ChevronDown, RotateCcw, Check, X } from 'lucide-react';
import { useDiffBase } from '../../hooks/useDiffBase';
import { useGitBranch, useGitBranches } from '../../hooks/useGitStatus';
import { api } from '../../services/api';
import styles from './DiffBasePicker.module.css';

const DEFAULT_BASE = 'HEAD';

export function DiffBasePicker() {
  const { baseRef, setBaseRef, resetBaseRef } = useDiffBase();
  const { data: branchesData } = useGitBranches();
  const { data: currentBranch } = useGitBranch();
  const [menuOpen, setMenuOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const branches = branchesData?.branches ?? [];
  const isCustom = baseRef !== DEFAULT_BASE;

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setCustomOpen(false);
        setCustomError(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  useEffect(() => {
    if (customOpen) {
      customInputRef.current?.focus();
    }
  }, [customOpen]);

  const selectBranch = (branch: string) => {
    setBaseRef(branch);
    setMenuOpen(false);
    setCustomOpen(false);
  };

  const submitCustom = async () => {
    const trimmed = customValue.trim();
    if (!trimmed) {
      setCustomError('Enter a ref');
      return;
    }
    setValidating(true);
    setCustomError(null);
    try {
      const { valid } = await api.verifyGitRef(trimmed);
      if (!valid) {
        setCustomError(`Unknown ref: ${trimmed}`);
        return;
      }
      setBaseRef(trimmed);
      setMenuOpen(false);
      setCustomOpen(false);
      setCustomValue('');
    } catch {
      setCustomError('Failed to verify ref');
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className={styles.container} ref={wrapperRef}>
      <button
        className={`${styles.picker} ${isCustom ? styles.pickerActive : ''}`}
        onClick={() => setMenuOpen((v) => !v)}
        title={`Comparing against: ${baseRef}`}
      >
        <span className={styles.label}>Base:</span>
        <span className={styles.value}>{baseRef}</span>
        <ChevronDown size={12} className={styles.chevron} />
      </button>
      {isCustom && (
        <button
          className={styles.reset}
          onClick={resetBaseRef}
          title="Reset to HEAD (working tree)"
        >
          <RotateCcw size={12} />
        </button>
      )}

      {menuOpen && (
        <div className={styles.menu}>
          <button
            className={`${styles.menuItem} ${baseRef === DEFAULT_BASE ? styles.menuItemActive : ''}`}
            onClick={() => selectBranch(DEFAULT_BASE)}
          >
            <span>HEAD</span>
            <span className={styles.menuHint}>working tree</span>
          </button>
          {branches.includes('main') && (
            <button
              className={`${styles.menuItem} ${baseRef === 'main...' ? styles.menuItemActive : ''}`}
              onClick={() => selectBranch('main...')}
            >
              <span>main...</span>
              <span className={styles.menuHint}>since branch point</span>
            </button>
          )}
          {branches.length > 0 && <div className={styles.divider} />}
          {branches.map((branch) => {
            const isCurrent = branch === currentBranch?.branch;
            return (
              <button
                key={branch}
                className={`${styles.menuItem} ${baseRef === branch ? styles.menuItemActive : ''}`}
                onClick={() => selectBranch(branch)}
              >
                <span>{branch}</span>
                {isCurrent && <span className={styles.menuHint}>current</span>}
              </button>
            );
          })}
          <div className={styles.divider} />
          {!customOpen ? (
            <button
              className={styles.menuItem}
              onClick={() => {
                setCustomOpen(true);
                setCustomValue(isCustom ? baseRef : '');
                setCustomError(null);
              }}
            >
              <span>Custom ref…</span>
              <span className={styles.menuHint}>e.g. HEAD~2</span>
            </button>
          ) : (
            <div className={styles.customForm}>
              <input
                ref={customInputRef}
                className={styles.customInput}
                placeholder="HEAD~2, abc123, origin/main…"
                value={customValue}
                onChange={(e) => {
                  setCustomValue(e.target.value);
                  setCustomError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitCustom();
                  if (e.key === 'Escape') {
                    setCustomOpen(false);
                    setCustomError(null);
                  }
                }}
                disabled={validating}
              />
              <button
                className={styles.customAction}
                onClick={submitCustom}
                disabled={validating}
                title="Apply"
              >
                <Check size={14} />
              </button>
              <button
                className={styles.customAction}
                onClick={() => {
                  setCustomOpen(false);
                  setCustomError(null);
                }}
                title="Cancel"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {customError && <div className={styles.error}>{customError}</div>}
        </div>
      )}
    </div>
  );
}
