-- Target database: marketing_workbench_v2
-- Scope: store redacted per-node readonly outputs and evidence refs.
-- Safety: never store raw platform responses, tokens, cookies, secrets, or full touchpoint URLs.

ALTER TABLE mwb.launch_node_runs
  ADD COLUMN IF NOT EXISTS output_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN mwb.launch_node_runs.output_summary IS
  'Redacted node output summary for UI/API diagnostics. Raw platform responses are forbidden.';

COMMENT ON COLUMN mwb.launch_node_runs.evidence_refs IS
  'References to redacted evidence_artifacts rows.';
