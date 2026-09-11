-- TechTester schema. Idempotent: safe to run on every boot.

CREATE TABLE IF NOT EXISTS scans (
  id             text PRIMARY KEY,
  url            text NOT NULL,
  normalized_url text NOT NULL,
  session_id     text NOT NULL,
  status         text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  stage          text NOT NULL DEFAULT 'queued',
  progress       integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  options        jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall_score  integer CHECK (overall_score BETWEEN 0 AND 100),
  error          text,
  -- The full ScanReport payload, written once the run completes.
  report         jsonb,
  requested_at   timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,
  finished_at    timestamptz
);

CREATE INDEX IF NOT EXISTS scans_session_idx ON scans (session_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS scans_status_idx ON scans (status);
