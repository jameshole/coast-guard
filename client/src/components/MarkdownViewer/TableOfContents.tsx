import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ChevronsLeft, ListTree } from 'lucide-react';
import styles from './MarkdownViewer.module.css';

export interface TocHeading {
  /** 1-based source line of the heading, matching the rendered data-start-line */
  line: number;
  /** ATX level, 1-6 */
  level: number;
  text: string;
}

/** Strips the inline markdown syntax that would otherwise show up as literal characters */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/(\*\*\*|___)(.+?)\1/g, '$2')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Pulls ATX headings (`# ...`) out of the markdown source, ignoring anything
 * inside a fenced code block so shell comments don't become contents entries.
 */
export function extractHeadings(source: string): TocHeading[] {
  const headings: TocHeading[] = [];
  let fence: string | null = null;

  source.split('\n').forEach((line, i) => {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);

    if (fence) {
      // A closing fence must use the same character and be at least as long
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      return;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      return;
    }

    const heading = line.match(/^ {0,3}(#{1,6})(?:\s+(.*?))?\s*$/);
    if (!heading) return;
    // Trailing closing hashes (`## Title ##`) aren't part of the text
    const text = stripInlineMarkdown((heading[2] ?? '').replace(/\s+#+$/, ''));
    if (!text) return;
    headings.push({ line: i + 1, level: heading[1].length, text });
  });

  return headings;
}

/** A heading counts as current once it scrolls within this many px of the top */
const ACTIVATION_OFFSET = 28;

interface TableOfContentsProps {
  headings: TocHeading[];
  /** The markdown scroll container, which holds the rendered [data-start-line] blocks */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Changes when the rendered content does, so the active heading is recomputed */
  contentVersion: string;
  open: boolean;
  onToggle: (open: boolean) => void;
}

export function TableOfContents({
  headings,
  containerRef,
  contentVersion,
  open,
  onToggle,
}: TableOfContentsProps) {
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Heading the reader last clicked, until the scroll actually arrives there
  const pendingJump = useRef<number | null>(null);
  // Set by the scroll effect so a jump can ask for a settle check of its own
  const settleRef = useRef<(() => void) | null>(null);
  const scrollbarTimer = useRef(0);

  // Indent relative to the shallowest heading, so a file whose headings all
  // start at h2 doesn't render with a permanent left margin.
  const baseLevel = useMemo(
    () => headings.reduce((min, h) => Math.min(min, h.level), 6),
    [headings]
  );

  // Track the heading the reader is currently under. Recomputed on scroll and
  // whenever the rendered height changes (code blocks highlight asynchronously,
  // which shifts everything below them).
  useEffect(() => {
    const root = containerRef.current;
    if (!open || !root || headings.length === 0) return;

    let frame = 0;
    let settle = 0;

    /** The last heading to have scrolled past the activation line */
    const headingAtTop = () => {
      const threshold = root.getBoundingClientRect().top + ACTIVATION_OFFSET;
      let current = headings[0].line;

      for (const heading of headings) {
        const el = root.querySelector(`[data-start-line="${heading.line}"]`);
        if (!el) continue;
        if (el.getBoundingClientRect().top > threshold) break;
        current = heading.line;
      }
      return current;
    };

    const update = () => {
      frame = 0;
      setActiveLine(headingAtTop());
    };

    // Once the scrolling stops, a jump to a heading near the end of the file
    // still counts as arriving: the document can't scroll far enough to lift it
    // to the activation line, so otherwise those entries could never light up.
    const settleCheck = () => {
      const target = pendingJump.current;
      pendingJump.current = null;
      const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 2;
      setActiveLine(target !== null && atBottom ? target : headingAtTop());
    };

    const scheduleSettle = () => {
      window.clearTimeout(settle);
      settle = window.setTimeout(settleCheck, 150);
    };
    settleRef.current = scheduleSettle;

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
      if (pendingJump.current !== null) scheduleSettle();
    };

    // Scrolling by hand abandons a jump still in flight
    const cancelJump = () => {
      pendingJump.current = null;
    };

    update();
    root.addEventListener('scroll', schedule, { passive: true });
    root.addEventListener('wheel', cancelJump, { passive: true });
    const article = root.firstElementChild;
    const resizeObserver = article ? new ResizeObserver(schedule) : null;
    if (article) resizeObserver?.observe(article);

    return () => {
      settleRef.current = null;
      root.removeEventListener('scroll', schedule);
      root.removeEventListener('wheel', cancelJump);
      resizeObserver?.disconnect();
      window.clearTimeout(settle);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [open, headings, containerRef, contentVersion]);

  const showScrollbar = () => {
    const list = listRef.current;
    if (!list) return;
    list.classList.add(styles.tocListScrolling);
    window.clearTimeout(scrollbarTimer.current);
    scrollbarTimer.current = window.setTimeout(
      () => list.classList.remove(styles.tocListScrolling),
      700
    );
  };

  useEffect(() => () => window.clearTimeout(scrollbarTimer.current), []);

  // Keep the active entry visible in a long contents list
  useEffect(() => {
    if (!open || activeLine === null) return;
    const el = listRef.current?.querySelector(`[data-toc-line="${activeLine}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, activeLine]);

  if (headings.length < 2) return null;

  if (!open) {
    return (
      <button
        className={styles.tocOpenButton}
        onClick={() => onToggle(true)}
        title="Show contents"
        aria-label="Show contents"
      >
        <ListTree size={14} />
      </button>
    );
  }

  const jumpTo = (line: number) => {
    const el = containerRef.current?.querySelector(`[data-start-line="${line}"]`);
    if (!el) return;
    // Deliberately no optimistic setActiveLine: the scroll handler picks the
    // active entry up as the smooth scroll passes each section, and setting it
    // here flashes the target before that travel starts.
    pendingJump.current = line;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Covers the case where the view is already where it needs to be and no
    // scroll event ever fires
    settleRef.current?.();
  };

  return (
    <nav className={styles.toc} aria-label="Table of contents">
      <div className={styles.tocHeader}>
        <span className={styles.tocTitle}>Contents</span>
        <button
          className={styles.tocCollapse}
          onClick={() => onToggle(false)}
          title="Hide contents"
          aria-label="Hide contents"
        >
          <ChevronsLeft size={14} />
        </button>
      </div>
      <ul className={styles.tocList} ref={listRef} onScroll={showScrollbar}>
        {headings.map((heading) => (
          <li key={heading.line}>
            <button
              data-toc-line={heading.line}
              className={`${styles.tocItem} ${heading.line === activeLine ? styles.tocItemActive : ''}`}
              style={{ paddingLeft: 8 + (heading.level - baseLevel) * 12 }}
              onClick={() => jumpTo(heading.line)}
              aria-current={heading.line === activeLine ? 'true' : undefined}
              title={heading.text}
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
