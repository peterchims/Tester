'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ScanSummary } from '@techtester/contracts';
import { ArrowRight, Layout, Lock, Search, ShieldCheck, Smartphone } from '@/components/icons';
import { ApiError, createScan, listRecentScans } from '@/lib/api';
import { hostOf } from '@/lib/url';
import { ScoreBadge } from '@/components/ScoreBadge';
import { StatusPill } from '@/components/StatusPill';

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
        <nav>
          <a href="https://github.com" target="_blank" rel="noreferrer">
            Docs
          </a>
        </nav>
      </header>

      <main className="hero">
        <h1>Test any website before you ship it.</h1>
        <p className="lede">
          Paste a URL. TechTester renders it across the full device matrix, fingerprints the architecture it was
          built on, audits it for security gaps, and runs a deep SEO structure audit — with real screenshots and
          fixes, not a mock dashboard.
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
              {!busy && <ArrowRight size={16} />}
            </button>
          </div>
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>I own this site or am authorised to test it. Only passive checks and light public-path probes are used — no exploitation.</span>
          </label>
          {error && <p className="formError">{error}</p>}
        </form>

        <div className="pillars">
          <div className="pillar">
            <Smartphone size={20} />
            <b>Responsiveness</b>
            <p>10 real viewports, from a 320px phone to 4K — with a % score and every element that leaves the screen.</p>
          </div>
          <div className="pillar">
            <Layout size={20} />
            <b>Architecture</b>
            <p>Framework, rendering mode, CSS system, hosting, CMS, and libraries — with the evidence behind each call.</p>
          </div>
          <div className="pillar">
            <ShieldCheck size={20} />
            <b>Security</b>
            <p>Headers, TLS, cookies, mixed content, exposed paths, and vulnerable libraries — each with a concrete fix.</p>
          </div>
          <div className="pillar">
            <Search size={20} />
            <b>SEO</b>
            <p>Indexability, title/meta length, heading structure, keyword placement, structured data, and sitemap coverage — measured from the page itself, not guessed.</p>
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
                  {scan.overallScore !== null && <ScoreBadge score={scan.overallScore} />}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      <footer className="footer">
        <Lock size={14} />
        <span>Scans are restricted to public HTTP(S) targets. Loopback and private-network addresses are always blocked.</span>
      </footer>
    </div>
  );
}
