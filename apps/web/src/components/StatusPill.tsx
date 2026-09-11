import type { ScanStatus } from '@techtester/contracts';

const LABEL: Record<ScanStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

export function StatusPill({ status }: { status: ScanStatus }) {
  return <span className={`statusPill ${status}`}>{LABEL[status]}</span>;
}
