import type { SystemNoteEvent } from './buildBubbles';
import styles from './ClaudeView.module.css';

interface SystemNoteProps {
  event: SystemNoteEvent;
}

export function SystemNote({ event }: SystemNoteProps) {
  const fields: Array<[string, string]> = [];
  if (event.subtype === 'init') {
    if (event.session_id) fields.push(['session', event.session_id.slice(0, 8) + '…']);
    if (event.model) fields.push(['model', event.model]);
    if (event.cwd) fields.push(['cwd', event.cwd]);
    if (Array.isArray(event.tools)) fields.push(['tools', String(event.tools.length)]);
    if (event.permissionMode) fields.push(['perm', event.permissionMode]);
  } else if (event.subtype === 'api_retry') {
    fields.push([
      'api retry',
      `attempt ${event.attempt}/${event.max_retries} · ${event.error || ''}`,
    ]);
  }
  if (fields.length === 0) return null;

  return (
    <div className={styles.sysNote}>
      {fields.map(([k, v], i) => (
        <span key={i} className={styles.sysNoteField}>
          <span className={styles.sysNoteKey}>{k}</span>{' '}
          <span className={styles.sysNoteValue}>{v}</span>
        </span>
      ))}
    </div>
  );
}
