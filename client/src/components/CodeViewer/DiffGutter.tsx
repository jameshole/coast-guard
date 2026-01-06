import { Plus, Minus } from 'lucide-react';
import styles from './DiffGutter.module.css';

interface DiffGutterProps {
  diff?: {
    type: 'add' | 'remove';
    isStaged: boolean;
  };
}

export function DiffGutter({ diff }: DiffGutterProps) {
  if (!diff) {
    return <span className={styles.empty} />;
  }

  const Icon = diff.type === 'add' ? Plus : Minus;
  const colorClass = diff.isStaged
    ? diff.type === 'add'
      ? styles.stagedAdd
      : styles.stagedRemove
    : diff.type === 'add'
      ? styles.unstagedAdd
      : styles.unstagedRemove;

  return (
    <span className={`${styles.indicator} ${colorClass}`}>
      <Icon size={12} strokeWidth={2.5} />
    </span>
  );
}
