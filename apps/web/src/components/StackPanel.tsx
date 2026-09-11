import type { StackReport } from '@techtester/contracts';
import { Layers } from './icons';

const KIND_LABEL: Record<string, string> = {
  framework: 'Framework',
  'meta-framework': 'Meta-framework',
  rendering: 'Rendering',
  css: 'CSS framework',
  'ui-library': 'UI library',
  hosting: 'Hosting',
  cdn: 'CDN',
  cms: 'CMS',
  ecommerce: 'Ecommerce',
  analytics: 'Analytics',
  library: 'Library',
  language: 'Language',
  server: 'Server',
  security: 'Security',
};

export function StackPanel({ stack }: { stack: StackReport }) {
  const groups = new Map<string, typeof stack.detections>();
  for (const d of stack.detections) {
    if (!groups.has(d.kind)) groups.set(d.kind, []);
    groups.get(d.kind)!.push(d);
  }

  return (
    <div className="stackPanel">
      <div className="stackHeadline">
        <Layers size={18} />
        <div>
          <b>{stack.primaryFramework ?? 'No JS framework detected'}</b>
          <span>{stack.detections.find((d) => d.kind === 'rendering')?.name}</span>
        </div>
      </div>
      <div className="stackGroups">
        {[...groups.entries()].map(([kind, detections]) => (
          <div className="stackGroup" key={kind}>
            <h4>{KIND_LABEL[kind] ?? kind}</h4>
            {detections.map((d) => (
              <div className="stackItem" key={d.name}>
                <div className="stackItemHead">
                  <span>
                    {d.name}
                    {d.version && <em> {d.version}</em>}
                  </span>
                  <span className="confidence">{Math.round(d.confidence * 100)}%</span>
                </div>
                <div className="confidenceBar">
                  <i style={{ width: `${Math.round(d.confidence * 100)}%` }} />
                </div>
                <p className="stackEvidence">{d.evidence.join('; ')}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
