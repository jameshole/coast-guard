import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Drag-to-resize state for the sidebar content pane. Returns the current width,
 * whether a drag is in flight (to disable the width transition), and the
 * mousedown handler for the resize handle.
 */
export function useSidebarResize(initialWidth = 260) {
  const [contentWidth, setContentWidth] = useState(initialWidth);
  const [resizing, setResizing] = useState(false);
  const dragging = useRef(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    setResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      // 44px is approximately the tab bar width
      const newWidth = Math.max(150, Math.min(600, e.clientX - 44));
      setContentWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (dragging.current) {
        dragging.current = false;
        setResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return { contentWidth, resizing, handleResizeStart };
}
