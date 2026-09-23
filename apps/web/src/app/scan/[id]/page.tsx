'use client';
import { use, useEffect, useMemo, useState } from 'react';
import type { ProgressEvent, ScanReport, Severity } from '@techtester/contracts';
import { getScanReport, watchScanProgress } from '@/lib/api';
import { hostOf } from '@/lib/url';
import { PipelineSteps } from '@/components/PipelineSteps';
import { StatusPill } from '@/components/StatusPill';
import { ScoreBadge } from '@/components/ScoreBadge';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ReportNav } from '@/components/ReportNav';
import { ViewportGallery } from '@/components/ViewportGallery';
import { StackPanel } from '@/components/StackPanel';
import { SecurityPanel } from '@/components/SecurityPanel';
import { SeoPanel } from '@/components/SeoPanel';
import { FindingCard } from '@/components/FindingCard';
import { Check } from '@/components/icons';

export default function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [event, setEvent] = useState<ProgressEvent | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const stop = watchScanProgress(id, setEvent);
    return stop;
  }, [id]);

  useEffect(() => {
    if (event?.status === 'completed' || event?.status === 'failed') {
      getScanReport(id)
        .then(setReport)
        .catch(() => setError('Could not load the report.'));
    }
  }, [event?.status, id]);

  useReveal(!!report);

  const finished = event?.status === 'completed' || event?.status === 'failed';
  const availableSections = report
    ? [
        report.responsive && 'responsiveness',
        report.stack && 'architecture',
        report.security && 'security',
        report.seo && 'seo',
      ].filter((s): s is string => !!s)
    : [];

  return (
    <div className="page">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="mark">TT</span>
          <b>TechTester</b>
        </a>
        <div className="topbarActions">
          <a className="newScan" href="/">
            New scan
          </a>
          <ThemeToggle />
        </div>
      </header>

      <main className="scanPage">
        {!finished && (
          <section className="runningPanel">
            <h1>{report?.url ?? 'Running your scan…'}</h1>
            <StatusPill status={event?.status ?? 'queued'} />
            <PipelineSteps stage={event?.stage ?? 'queued'} failed={event?.status === 'failed'} progress={event?.progress ?? 2} />
            <p className="runningMessage">
              {event?.message ?? 'Queuing the scan…'}
              <span className="liveDots">
                <span />
                <span />
                <span />
              </span>
            </p>
          </section>
        )}

        {event?.status === 'failed' && (
          <section className="errorPanel">
            <h2>The scan failed</h2>
            <p>{event.message}</p>
          </section>
        )}

        {error && <p className="formError">{error}</p>}

        {report && event?.status === 'completed' && (
          <>
            <section className="reportHeader">
              <div>
                <h1>{hostOf(report.url)}</h1>
                <a href={report.url} target="_blank" rel="noreferrer">
                  {report.url}
                </a>
              </div>
              <div className="reportScores">
                {report.overallScore !== null && <ScoreBadge score={report.overallScore} label="Overall" />}
                {report.categories
                  .filter((c) => c.evaluated)
                  .map((c) => (
                    <ScoreBadge key={c.category} score={c.score} label={categoryLabel(c.category)} />
                  ))}
              </div>
            </section>

            <ReportNav available={availableSections} />

            <div className="comingSoon">
              Performance and accessibility audits are coming soon — this scan covers responsiveness, architecture,
              security, and SEO.
            </div>

            {report.responsive && (
              <section className="reportSection reveal" id="responsiveness">
                <div className="sectionHead">
                  <h2>Responsiveness</h2>
                  <p>
                    <b>{report.responsive.score}%</b> responsive · <b>{report.responsive.contentLeavingViewportPct}%</b>{' '}
                    leaves the viewport on small screens
                  </p>
                </div>
                <ViewportGallery scanId={report.id} viewports={report.viewports} />
                <FindingsList findings={report.findings.filter((f) => f.analyzer === 'responsive')} />
              </section>
            )}

            {report.stack && (
              <section className="reportSection reveal" id="architecture">
                <div className="sectionHead">
                  <h2>Architecture</h2>
                  <p>What this site is built on, with evidence for each call.</p>
                </div>
                <StackPanel stack={report.stack} />
              </section>
            )}

            {report.security && (
              <section className="reportSection reveal" id="security">
                <div className="sectionHead">
                  <h2>Security</h2>
                  <p>Passive checks plus light public-path probing — no exploitation.</p>
                </div>
                <SecurityPanel security={report.security} />
                <FindingsList findings={report.findings.filter((f) => f.analyzer === 'security')} />
              </section>
            )}

            {report.seo && (
              <section className="reportSection reveal" id="seo">
                <div className="sectionHead">
                  <h2>SEO</h2>
                  <p>On-page structure and keyword signals measured from this page — not a ranking guess.</p>
                </div>
                <SeoPanel seo={report.seo} />
                <FindingsList findings={report.findings.filter((f) => f.analyzer === 'seo')} />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

function FindingsList({ findings }: { findings: ScanReport['findings'] }) {
  const [filter, setFilter] = useState<Severity | 'all'>('all');

  const counts = useMemo(() => {
    const map = new Map<Severity, number>();
    for (const f of findings) map.set(f.severity, (map.get(f.severity) ?? 0) + 1);
    return map;
  }, [findings]);

  if (findings.length === 0) {
    return (
      <p className="noFindings">
        <Check size={14} /> No issues found here.
      </p>
    );
  }

  const visible = filter === 'all' ? findings : findings.filter((f) => f.severity === filter);
  const presentSeverities = SEVERITY_ORDER.filter((s) => (counts.get(s) ?? 0) > 0);

  return (
    <div>
      {presentSeverities.length > 1 && (
        <div className="findingsToolbar">
          <button className={`filterChip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')} type="button">
            All <span className="count">{findings.length}</span>
          </button>
          {presentSeverities.map((s) => (
            <button key={s} className={`filterChip ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)} type="button">
              {s} <span className="count">{counts.get(s)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="findingsList">
        {visible.map((f) => (
          <FindingCard key={f.id} finding={f} />
        ))}
      </div>
    </div>
  );
}

/** Reveals `.reveal` elements (report sections) with a fade/slide as they scroll into view. */
function useReveal(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    let revealCleanup = () => {};
    // Sections render synchronously with `ready` turning true, but wait a tick
    // so they exist in the DOM before querying for them.
    const frame = requestAnimationFrame(() => {
      const elements = Array.from(document.querySelectorAll('.reveal:not(.visible)'));
      if (elements.length === 0) return;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
              observer.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.08 },
      );
      for (const el of elements) observer.observe(el);
      revealCleanup = () => observer.disconnect();
    });
    return () => {
      cancelAnimationFrame(frame);
      revealCleanup();
    };
  }, [ready]);
}

function categoryLabel(category: string): string {
  return { responsiveness: 'Responsive', security: 'Security', performance: 'Performance', accessibility: 'Accessibility', seo: 'SEO', 'best-practices': 'Best practices' }[category] ?? category;
}
