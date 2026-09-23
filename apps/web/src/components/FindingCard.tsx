'use client';
import { useState } from 'react';
import type { Finding } from '@techtester/contracts';
import { Check, ChevronDown, Copy } from './icons';

export function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="finding">
      <button className="findingHead" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`severity ${finding.severity}`}>{finding.severity}</span>
        <span className="findingTitle">{finding.title}</span>
        <ChevronDown size={16} className={open ? 'chev open' : 'chev'} />
      </button>
      <div className={`findingBodyWrap ${open ? 'open' : ''}`}>
        <div className="findingBodyInner">
          <div className="findingBody">
            <p>{finding.description}</p>
            {finding.affectedViewports.length > 0 && (
              <p className="findingMeta">Affects: {finding.affectedViewports.join(', ')}</p>
            )}
            <p className="findingRec">
              <b>Fix:</b> {finding.recommendation}
            </p>
            {finding.fixSnippet && (
              <div className="fixSnippetWrap">
                <pre className="fixSnippet">{finding.fixSnippet}</pre>
                <CopyButton text={finding.fixSnippet} />
              </div>
            )}
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
        </div>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — silently do nothing */
    }
  }

  return (
    <button className={`copyBtn ${copied ? 'copied' : ''}`} onClick={copy} type="button" aria-label="Copy fix snippet">
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
