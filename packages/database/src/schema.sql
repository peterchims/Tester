CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, kind text NOT NULL, target_url text, figma_url text, repository_url text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS audit_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','passed','failed')), score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100), error text, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz);
CREATE TABLE IF NOT EXISTS findings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE, title text NOT NULL, category text NOT NULL, severity text NOT NULL, summary text NOT NULL, evidence jsonb, recommendation text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS findings_run_idx ON findings(run_id);
CREATE INDEX IF NOT EXISTS audit_runs_project_started_idx ON audit_runs(project_id, started_at DESC);
