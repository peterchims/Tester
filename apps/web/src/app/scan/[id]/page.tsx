'use client';
import { use, useEffect, useState } from 'react';
import type { ProgressEvent, ScanReport } from '@techtester/contracts';
import { getScanReport, watchScanProgress } from '@/lib/api';
import { PipelineSteps } from '@/components/PipelineSteps';
import { StatusPill } from '@/components/StatusPill';
import { ScoreBadge } from '@/components/ScoreBadge';
import { ViewportGallery } from '@/components/ViewportGallery';
import { StackPanel } from '@/components/StackPanel';
import { SecurityPanel } from '@/components/SecurityPanel';
import { SeoPanel } from '@/components/SeoPanel';
import { FindingCard } from '@/components/FindingCard';

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

  const finished = event?.status === 'completed' || event?.status === 'failed';

  return (
    <div className="page">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="mark">TT</span>
          <b>TechTester</b>
        </a>
        <a className="newScan" href="/">
          New scan
        </a>
      </header>

      <main className="scanPage">
        {!finished && (
          <section className="runningPanel">
            <h1>{report?.url ?? 'Running your scan…'}</h1>
            <StatusPill status={event?.status ?? 'queued'} />
            <PipelineSteps stage={event?.stage ?? 'queued'} failed={event?.status === 'failed'} />
            <p className="runningMessage">{event?.message ?? 'Queuing the scan…'}</p>
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

            <div className="comingSoon">
              Performance and accessibility audits are coming in the next release — this scan covers
              responsiveness, architecture, security, and SEO.
            </div>

            {report.responsive && (
              <section className="reportSection">
                <div className="sectionHead">
                  <h2>Responsiveness</h2>
                  <p>
                    <b>{report.responsive.score}%</b> responsive · <b>{report.responsive.contentLeavingViewportPct}%</b> of
                    page content leaves the viewport on small screens
                  </p>
                </div>
                <ViewportGallery scanId={report.id} viewports={report.viewports} />
                <FindingsList findings={report.findings.filter((f) => f.analyzer === 'responsive')} />
              </section>
            )}

            {report.stack && (
              <section className="reportSection">
                <div className="sectionHead">
                  <h2>Architecture</h2>
                  <p>What this site is built on, and the evidence behind each call.</p>
                </div>
                <StackPanel stack={report.stack} />
              </section>
            )}

            {report.security && (
              <section className="reportSection">
                <div className="sectionHead">
                  <h2>Security</h2>
                  <p>Passive checks plus light public-path probing — no exploitation.</p>
                </div>
                <SecurityPanel security={report.security} />
                <FindingsList findings={report.findings.filter((f) => f.analyzer === 'security')} />
              </section>
            )}

            {report.seo && (
              <section className="reportSection">
                <div className="sectionHead">
                  <h2>SEO</h2>
                  <p>On-page structure, indexability, and keyword signals measured from this page&rsquo;s own content — not a ranking guess.</p>
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

function FindingsList({ findings }: { findings: ScanReport['findings'] }) {
  if (findings.length === 0) return <p className="noFindings">No issues found here.</p>;
  return (
    <div className="findingsList">
      {findings.map((f) => (
        <FindingCard key={f.id} finding={f} />
      ))}
    </div>
  );
}

function categoryLabel(category: string): string {
  return { responsiveness: 'Responsive', security: 'Security', performance: 'Performance', accessibility: 'Accessibility', seo: 'SEO', 'best-practices': 'Best practices' }[category] ?? category;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
