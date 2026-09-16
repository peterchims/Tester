import type { SeoSummary } from '@techtester/contracts';
import { Check, ShieldAlert, X } from './icons';

const INDEXABILITY_COPY: Record<SeoSummary['indexability'], { label: string; tone: 'ok' | 'bad' }> = {
  indexable: { label: 'Indexable — search engines can list this page', tone: 'ok' },
  noindex: { label: 'Blocked: page is set to noindex', tone: 'bad' },
  'blocked-by-robots': { label: 'Blocked: disallowed by robots.txt', tone: 'bad' },
};

export function SeoPanel({ seo }: { seo: SeoSummary }) {
  const indexability = INDEXABILITY_COPY[seo.indexability];

  return (
    <div className="seoPanel">
      <div className={`indexBanner ${indexability.tone}`}>
        {indexability.tone === 'ok' ? <Check size={16} /> : <ShieldAlert size={16} />}
        <div>
          <b>{indexability.label}</b>
          {seo.indexabilityReason && <span>{seo.indexabilityReason}</span>}
        </div>
      </div>

      <div className="seoFieldsGrid">
        <SeoField label="Title" field={seo.title} recommended="30-60 characters" />
        <SeoField label="Meta description" field={seo.metaDescription} recommended="70-160 characters" />
      </div>

      <div className="seoFactRow">
        <SeoFact ok={seo.canonical.present} label={seo.canonical.present ? (seo.canonical.selfReferencing ? 'Canonical: self-referencing' : 'Canonical points elsewhere') : 'No canonical tag'} />
        <SeoFact ok={seo.h1Count === 1} label={`${seo.h1Count} H1 heading${seo.h1Count === 1 ? '' : 's'}`} />
        <SeoFact ok={seo.headingOrderValid} label={seo.headingOrderValid ? 'Heading order valid' : 'Heading levels skip'} />
        <SeoFact ok={seo.wordCount >= 300} label={`${seo.wordCount} words`} />
        <SeoFact ok={seo.favicon} label={seo.favicon ? 'Favicon set' : 'No favicon'} />
        <SeoFact ok={!!seo.hreflangCount || true} label={`${seo.hreflangCount} hreflang tag${seo.hreflangCount === 1 ? '' : 's'}`} muted={seo.hreflangCount === 0} />
      </div>

      {seo.topKeywords.length > 0 && (
        <div className="keywordBlock">
          <h4>Keyword structure — measured from this page&rsquo;s own text</h4>
          <div className="tableScroll">
            <table className="keywordTable">
              <thead>
                <tr>
                  <th>Phrase</th>
                  <th>Uses</th>
                  <th>Density</th>
                  <th>Title</th>
                  <th>H1</th>
                  <th>Meta desc.</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {seo.topKeywords.map((k) => (
                  <tr key={k.phrase}>
                    <td>{k.phrase}</td>
                    <td>{k.occurrences}</td>
                    <td className={k.densityPct > 3 ? 'densityHigh' : undefined}>{k.densityPct}%</td>
                    <td>{k.inTitle ? <Check size={13} /> : <X size={13} />}</td>
                    <td>{k.inH1 ? <Check size={13} /> : <X size={13} />}</td>
                    <td>{k.inMetaDescription ? <Check size={13} /> : <X size={13} />}</td>
                    <td>{k.inUrl ? <Check size={13} /> : <X size={13} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="seoGroups">
        <div className="seoGroup">
          <h4>Content &amp; links</h4>
          <ul>
            <li>{seo.imagesTotal - seo.imagesMissingAlt} / {seo.imagesTotal} images have alt text</li>
            <li>{seo.internalLinks} internal · {seo.externalLinks} external links</li>
            <li>{seo.genericAnchorCount} generic anchor text link{seo.genericAnchorCount === 1 ? '' : 's'}</li>
          </ul>
        </div>
        <div className="seoGroup">
          <h4>Structured data</h4>
          {seo.structuredData.length === 0 ? (
            <p className="seoMuted">None detected</p>
          ) : (
            <ul>
              {seo.structuredData.map((block, i) => (
                <li key={i} className={block.valid ? undefined : 'seoInvalid'}>
                  {block.valid ? block.types.join(', ') || '(no @type)' : `Invalid JSON: ${block.error}`}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="seoGroup">
          <h4>Social previews</h4>
          <ul>
            <li>{seo.openGraph.present ? (seo.openGraph.missing.length === 0 ? 'Open Graph complete' : `Open Graph missing ${seo.openGraph.missing.join(', ')}`) : 'No Open Graph tags'}</li>
            <li>{seo.twitterCard.present ? (seo.twitterCard.missing.length === 0 ? 'Twitter Card complete' : `Twitter Card missing ${seo.twitterCard.missing.join(', ')}`) : 'No Twitter Card tags'}</li>
          </ul>
        </div>
        <div className="seoGroup">
          <h4>Crawling &amp; discovery</h4>
          <ul>
            <li>{seo.robotsTxt.present ? 'robots.txt present' : 'No robots.txt'}{seo.robotsTxt.blocksScannedPath ? ' (blocks this page)' : ''}</li>
            <li>{seo.sitemap.present ? `Sitemap: ${seo.sitemap.urlCount ?? 0} URLs${seo.sitemap.includesScannedUrl === false ? ' (missing this page)' : ''}` : 'No sitemap.xml found'}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function SeoField({ label, field, recommended }: { label: string; field: SeoSummary['title']; recommended: string }) {
  return (
    <div className="seoField">
      <div className="seoFieldHead">
        <b>{label}</b>
        <span className={field.present ? (field.withinRecommendedLength ? 'ok' : 'warn') : 'bad'}>
          {field.present ? `${field.length} chars` : 'Missing'}
        </span>
      </div>
      <p className="seoFieldText">{field.text ?? `No ${label.toLowerCase()} set.`}</p>
      <p className="seoFieldHint">Recommended: {recommended}</p>
    </div>
  );
}

function SeoFact({ ok, label, muted }: { ok: boolean; label: string; muted?: boolean }) {
  return <span className={`seoFact ${muted ? 'muted' : ok ? 'ok' : 'bad'}`}>{label}</span>;
}
