'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ScanSummary } from '@techtester/contracts';
import { ArrowRight, Layout, Lock, Search, ShieldCheck, Smartphone } from '@/components/icons';
import { ApiError, createScan, listRecentScans } from '@/lib/api';
import { hostOf } from '@/lib/url';
import { ScoreBadge } from '@/components/ScoreBadge';
import { StatusPill } from '@/components/StatusPill';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<ScanSummary[]>([]);

  useEffect(() => {
    listRecentScans()
      .then(setRecent)
      .catch(() => undefined);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!consent) {
      setError('Confirm you own or are authorised to test this site before scanning it.');
      return;
    }
    setBusy(true);
    try {
      const scan = await createScan(url, consent);
      router.push(`/scan/${scan.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the scan.');
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="mark">TT</span>
          <b>TechTester</b>
        </div>
        <div className="topbarActions">
          <nav>
            <a href="https://github.com" target="_blank" rel="noreferrer">
              Docs
            </a>
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <main className="hero">
        <h1>Test any website before you ship it.</h1>
        <p className="lede">
          One URL in. Real screenshots, architecture, security, and SEO out — every issue comes with a fix.
        </p>

        <form className="scanForm" onSubmit={submit}>
          <div className="urlRow">
            <input
              required
              type="text"
              inputMode="url"
              placeholder="example.com"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              aria-label="Website URL"
            />
            <button className="primary" disabled={busy}>
              {busy ? 'Starting…' : 'Run test'}
              {!busy && <ArrowRight size={14} />}
            </button>
          </div>
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>I own this site or am authorised to test it. Passive checks only — no exploitation.</span>
          </label>
          {error && <p className="formError">{error}</p>}
        </form>

        <div className="pillars">
          <div className="pillar">
            <Smartphone size={18} />
            <b>Responsiveness</b>
            <p>10 viewports, phone to 4K — scored, with every overflowing element flagged.</p>
          </div>
          <div className="pillar">
            <Layout size={18} />
            <b>Architecture</b>
            <p>Framework, rendering mode, hosting, and libraries — evidence for every call.</p>
          </div>
          <div className="pillar">
            <ShieldCheck size={18} />
            <b>Security</b>
            <p>Headers, TLS, cookies, exposed paths, vulnerable libraries — each with a fix.</p>
          </div>
          <div className="pillar">
            <Search size={18} />
            <b>SEO</b>
            <p>Indexability, meta tags, headings, and keywords — measured, not guessed.</p>
          </div>
        </div>
      </main>

      {recent.length > 0 && (
        <section className="recent">
          <h2>Recent scans on this device</h2>
          <div className="recentList">
            {recent.map((scan) => (
              <a className="recentCard" key={scan.id} href={`/scan/${scan.id}`}>
                <div>
                  <b>{hostOf(scan.url)}</b>
                  <span>{new Date(scan.requestedAt).toLocaleString()}</span>
                </div>
                <div className="recentMeta">
                  <StatusPill status={scan.status} />
                  {scan.overallScore !== null && <ScoreBadge score={scan.overallScore} size="sm" />}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      <footer className="footer">
        <Lock size={12} />
        <span>Public HTTP(S) targets only — private networks are always blocked.</span>
      </footer>
    </div>
  );
}
