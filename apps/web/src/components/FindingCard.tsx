'use client';
import { useState } from 'react';
import type { Finding } from '@techtester/contracts';
import { ChevronDown } from './icons';

export function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="finding">
      <button className="findingHead" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`severity ${finding.severity}`}>{finding.severity}</span>
        <span className="findingTitle">{finding.title}</span>
        <ChevronDown size={16} className={open ? 'chev open' : 'chev'} />
      </button>
      {open && (
        <div className="findingBody">
          <p>{finding.description}</p>
          {finding.affectedViewports.length > 0 && (
            <p className="findingMeta">
              Affects: {finding.affectedViewports.join(', ')}
            </p>
          )}
          <p className="findingRec">
            <b>Fix:</b> {finding.recommendation}
          </p>
          {finding.fixSnippet && <pre className="fixSnippet">{finding.fixSnippet}</pre>}
          {finding.evidence && (
            <details className="evidence">
              <summary>Evidence</summary>
              <pre>{JSON.stringify(finding.evidence, null, 2)}</pre>
            </details>
          )}
          {finding.references.length > 0 && (
            <p className="findingRefs">
              {finding.references.map((ref) => (
                <a key={ref} href={ref} target="_blank" rel="noreferrer">
                  Reference ↗
                </a>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
