'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ViewportResult } from '@techtester/contracts';
import { screenshotUrl } from '@/lib/api';
import { ChevronDown, ChevronLeft, ChevronRight, Maximize2, Monitor, Smartphone, Tablet, X } from './icons';
import { ScoreBadge } from './ScoreBadge';

const DEVICE_ICON = { mobile: Smartphone, tablet: Tablet, desktop: Monitor } as const;

export function ViewportGallery({ scanId, viewports }: { scanId: string; viewports: ViewportResult[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return (
    <>
      <div className="viewportGrid">
        {viewports.map((v, i) => (
          <ViewportCard key={v.label} scanId={scanId} viewport={v} onExpand={v.screenshotKey ? () => setLightboxIndex(i) : undefined} />
        ))}
      </div>
      {lightboxIndex !== null && (
        <Lightbox scanId={scanId} viewports={viewports} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
      )}
    </>
  );
}

function ViewportCard({ scanId, viewport, onExpand }: { scanId: string; viewport: ViewportResult; onExpand?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const Icon = DEVICE_ICON[viewport.deviceType];
  const issues = viewport.offendingElements.length;

  return (
    <div className="viewportCard">
      <div className={`viewportShot ${!loaded ? 'loading' : ''}`} onClick={onExpand} role={onExpand ? 'button' : undefined} tabIndex={onExpand ? 0 : undefined}>
        {viewport.screenshotKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={screenshotUrl(scanId, viewport.label)}
            alt={`${viewport.label} rendering`}
            loading="lazy"
            className={loaded ? 'loaded' : ''}
            onLoad={() => setLoaded(true)}
          />
        ) : (
          <div className="shotPlaceholder">No screenshot</div>
        )}
        {viewport.hasHorizontalOverflow && <span className="overflowFlag">+{viewport.overflowPx}px overflow</span>}
        {onExpand && (
          <div className="expandHint">
            <span>
              <Maximize2 size={13} /> Enlarge
            </span>
          </div>
        )}
      </div>
      <div className="viewportInfo">
        <div className="viewportHead">
          <div>
            <Icon size={14} />
            <b>{viewport.label}</b>
            <span>
              {viewport.width}×{viewport.height}
            </span>
          </div>
          <ScoreBadge score={viewport.score} size="sm" />
        </div>
        {issues > 0 && (
          <button className={`viewportToggle ${open ? 'open' : ''}`} onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Show'} {issues} issue{issues > 1 ? 's' : ''}
            <ChevronDown size={12} />
          </button>
        )}
        <div className={`offenderListWrap ${open ? 'open' : ''}`}>
          <div className="offenderListInner">
            <ul className="offenderList">
              {viewport.offendingElements.map((el, i) => (
                <li key={i}>
                  <code>{el.selector}</code>
                  <span>{describeReason(el.reason, el.overflowRight)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Lightbox({
  scanId,
  viewports,
  index,
  onClose,
  onNavigate,
}: {
  scanId: string;
  viewports: ViewportResult[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const viewport = viewports[index];
  const goPrev = () => onNavigate((index - 1 + viewports.length) % viewports.length);
  const goNext = () => onNavigate((index + 1) % viewports.length);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') goPrev();
      if (event.key === 'ArrowRight') goNext();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Rendered via a portal straight to <body>: a `position: fixed` element
  // loses the viewport as its containing block if any ancestor sets a
  // transform (our scroll-reveal sections do), so this can't be nested
  // inside the report's regular tree.
  return createPortal(
    <div className="lightboxBackdrop" onClick={onClose}>
      <div className="lightboxContent" onClick={(event) => event.stopPropagation()}>
        <button className="lightboxClose" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        {viewports.length > 1 && (
          <button className="lightboxNav prev" onClick={goPrev} aria-label="Previous viewport">
            <ChevronLeft size={20} />
          </button>
        )}
        {viewport.screenshotKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={screenshotUrl(scanId, viewport.label)} alt={`${viewport.label} full-size rendering`} />
        ) : (
          <div className="shotPlaceholder">No screenshot</div>
        )}
        {viewports.length > 1 && (
          <button className="lightboxNav next" onClick={goNext} aria-label="Next viewport">
            <ChevronRight size={20} />
          </button>
        )}
        <div className="lightboxCaption">
          {viewport.label} — {viewport.width}×{viewport.height}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function describeReason(reason: string, overflowRight: number): string {
  switch (reason) {
    case 'overflow':
      return `extends ${overflowRight}px past the right edge`;
    case 'fixed-wider-than-viewport':
      return `fixed-position element wider than the screen`;
    case 'clipped-text':
      return 'text is clipped';
    case 'tiny-tap-target':
      return 'tap target smaller than 44×44px';
    case 'small-font':
      return 'font is too small to read';
    default:
      return reason;
  }
}
