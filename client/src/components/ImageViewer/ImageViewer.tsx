import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { api } from '../../services/api';
import { isTypingTarget } from '../../utils/keyboard';
import styles from './ImageViewer.module.css';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 32;
const ZOOM_STEP = 1.25;
/** Past this scale, show hard pixel edges instead of a blurry upscale */
const PIXELATED_FROM = 4;

interface ImageViewerProps {
  filePath: string;
}

export function ImageViewer({ filePath }: ImageViewerProps) {
  // Shares the ['fileContent', path] key prefix so the file watcher's invalidations
  // bump the version and the browser refetches the image when it changes on disk.
  const { data: version } = useQuery({
    queryKey: ['fileContent', filePath, 'imageVersion'],
    queryFn: () => Date.now(),
  });
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  // null = fit to the available space; otherwise a scale factor of the natural size
  const [zoom, setZoom] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setDimensions(null);
    setFailed(false);
  }, [filePath, version]);

  useEffect(() => {
    setZoom(null);
  }, [filePath]);

  const zoomBy = useCallback((factor: number) => {
    setZoom((prev) => {
      let current = prev;
      if (current === null) {
        // Leaving fit mode: start from whatever scale the fitted image is showing at
        const img = imageRef.current;
        if (!img || !img.naturalWidth) return prev;
        current = img.clientWidth / img.naturalWidth;
      }
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * factor));
    });
  }, []);

  // Ctrl/Cmd + wheel (which is also what a trackpad pinch sends) zooms
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.01));
    };

    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, [zoomBy, version, failed]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === '+' || e.key === '=') {
        zoomBy(ZOOM_STEP);
      } else if (e.key === '-') {
        zoomBy(1 / ZOOM_STEP);
      } else if (e.key === '0') {
        setZoom(null);
      } else if (e.key === '1') {
        setZoom(1);
      } else {
        return;
      }
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomBy]);

  if (version === undefined) return null;

  if (failed) {
    return (
      <div className={styles.error}>
        <span>Unable to display image: {filePath}</span>
      </div>
    );
  }

  const zoomedStyle =
    zoom !== null && dimensions
      ? {
          width: dimensions.width * zoom,
          height: dimensions.height * zoom,
          imageRendering: zoom >= PIXELATED_FROM ? ('pixelated' as const) : undefined,
        }
      : undefined;

  return (
    <div className={styles.container}>
      <div className={styles.stage} ref={stageRef}>
        <img
          ref={imageRef}
          className={`${styles.image} ${zoomedStyle ? styles.imageZoomed : ''}`}
          style={zoomedStyle}
          src={`${api.getRawFileUrl(filePath)}&v=${version}`}
          alt={filePath}
          onLoad={(e) =>
            setDimensions({
              width: e.currentTarget.naturalWidth,
              height: e.currentTarget.naturalHeight,
            })
          }
          onError={() => setFailed(true)}
        />
      </div>
      {dimensions && (
        <div className={styles.meta}>
          <span>
            {dimensions.width} × {dimensions.height}
          </span>
          <div className={styles.zoomControls}>
            <button className={styles.zoomButton} onClick={() => zoomBy(1 / ZOOM_STEP)} title="Zoom out (-)">
              <ZoomOut size={14} />
            </button>
            <span className={styles.zoomLevel}>{zoom === null ? 'Fit' : `${Math.round(zoom * 100)}%`}</span>
            <button className={styles.zoomButton} onClick={() => zoomBy(ZOOM_STEP)} title="Zoom in (+)">
              <ZoomIn size={14} />
            </button>
            <button
              className={`${styles.zoomButton} ${zoom === null ? styles.zoomButtonActive : ''}`}
              onClick={() => setZoom(null)}
              title="Fit to window (0)"
            >
              Fit
            </button>
            <button
              className={`${styles.zoomButton} ${zoom === 1 ? styles.zoomButtonActive : ''}`}
              onClick={() => setZoom(1)}
              title="Actual size (1)"
            >
              100%
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
