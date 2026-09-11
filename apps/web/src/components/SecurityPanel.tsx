import type { SecuritySummary } from '@techtester/contracts';
import { ShieldAlert, ShieldCheck } from './icons';

export function SecurityPanel({ security }: { security: SecuritySummary }) {
  return (
    <div className="securityPanel">
      <div className={`grade grade-${security.grade}`}>
        <span>Security grade</span>
        <strong>{security.grade}</strong>
      </div>
      <div className="tlsRow">
        <TlsFact ok={security.tls.https} label="HTTPS" />
        <TlsFact ok={security.tls.redirectsHttpToHttps} label="HTTP → HTTPS redirect" />
        <TlsFact ok={security.tls.hsts} label="HSTS" />
        <TlsFact ok={security.tls.mixedContentCount === 0} label={security.tls.mixedContentCount === 0 ? 'No mixed content' : `${security.tls.mixedContentCount} mixed-content resources`} />
      </div>
      <table className="headerTable">
        <thead>
          <tr>
            <th>Header</th>
            <th>Status</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {security.headers.map((h) => (
            <tr key={h.name}>
              <td>{h.name}</td>
              <td>
                <span className={`headerStatus ${h.status}`}>{h.status}</span>
              </td>
              <td>{h.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {security.exposedPaths.length > 0 && (
        <p className="exposedPaths">
          <ShieldAlert size={14} /> Exposed paths: {security.exposedPaths.join(', ')}
        </p>
      )}
    </div>
  );
}

function TlsFact({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? ShieldCheck : ShieldAlert;
  return (
    <div className={`tlsFact ${ok ? 'ok' : 'bad'}`}>
      <Icon size={14} />
      <span>{label}</span>
    </div>
  );
}
