import type { ScanStage } from '@techtester/contracts';

const STEPS: { stage: ScanStage; label: string }[] = [
  { stage: 'guard', label: 'Validate target' },
  { stage: 'fetch', label: 'Fetch response' },
  { stage: 'load', label: 'Render in browser' },
  { stage: 'stack', label: 'Detect architecture' },
  { stage: 'responsive', label: 'Test every viewport' },
  { stage: 'security', label: 'Audit security' },
  { stage: 'seo', label: 'Audit SEO structure' },
  { stage: 'scoring', label: 'Score the run' },
];

const ORDER: ScanStage[] = ['queued', ...STEPS.map((s) => s.stage), 'done'];

export function PipelineSteps({ stage, failed }: { stage: ScanStage; failed: boolean }) {
  const currentIndex = ORDER.indexOf(stage);
  return (
    <ol className="pipeline">
      {STEPS.map((step) => {
        const index = ORDER.indexOf(step.stage);
        const state = failed && index <= currentIndex ? 'error' : index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'pending';
        return (
          <li key={step.stage} className={state}>
            <span className="dot" />
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
