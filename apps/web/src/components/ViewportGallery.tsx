'use client';
import { useState } from 'react';
import type { ViewportResult } from '@techtester/contracts';
import { screenshotUrl } from '@/lib/api';
import { Monitor, Smartphone, Tablet } from './icons';
import { ScoreBadge } from './ScoreBadge';

const DEVICE_ICON = { mobile: Smartphone, tablet: Tablet, desktop: Monitor } as const;

export function ViewportGallery({ scanId, viewports }: { scanId: string; viewports: ViewportResult[] }) {
  return (
    <div className="viewportGrid">
      {viewports.map((v) => (
        <ViewportCard key={v.label} scanId={scanId} viewport={v} />
      ))}
    </div>
  );
}

function ViewportCard({ scanId, viewport }: { scanId: string; viewport: ViewportResult }) {
  const [open, setOpen] = useState(false);
  const Icon = DEVICE_ICON[viewport.deviceType];
  const issues = viewport.offendingElements.length;

  return (
    <div className="viewportCard">
      <div className="viewportShot">
        {viewport.screenshotKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={screenshotUrl(scanId, viewport.label)} alt={`${viewport.label} rendering`} loading="lazy" />
        ) : (
          <div className="shotPlaceholder">No screenshot</div>
        )}
        {viewport.hasHorizontalOverflow && <span className="overflowFlag">+{viewport.overflowPx}px overflow</span>}
      </div>
      <div className="viewportInfo">
        <div className="viewportHead">
          <div>
            <Icon size={14} />
            <b>{viewport.label}</b>
            <span>{viewport.width}×{viewport.height}</span>
          </div>
          <ScoreBadge score={viewport.score} />
        </div>
        {issues > 0 && (
          <button className="viewportToggle" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Show'} {issues} issue{issues > 1 ? 's' : ''}
          </button>
        )}
        {open && (
          <ul className="offenderList">
            {viewport.offendingElements.map((el, i) => (
              <li key={i}>
                <code>{el.selector}</code>
                <span>{describeReason(el.reason, el.overflowRight)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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
