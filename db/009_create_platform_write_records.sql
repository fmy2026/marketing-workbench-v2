BEGIN;

CREATE TABLE IF NOT EXISTS mwb.launch_confirmations (
  confirmation_id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES mwb.launch_jobs(job_id),
  draft_id text NOT NULL REFERENCES mwb.launch_drafts(draft_id),
  object_type text NOT NULL,
  object_name text NOT NULL,
  payload_hash text NOT NULL,
  confirmation_status text NOT NULL,
  confirm_variable text NOT NULL,
  confirmed_by text NOT NULL DEFAULT 'local_operator',
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS mwb.platform_actions (
  action_id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES mwb.launch_jobs(job_id),
  confirmation_id text REFERENCES mwb.launch_confirmations(confirmation_id),
  action_type text NOT NULL,
  endpoint text NOT NULL,
  method text NOT NULL,
  action_status text NOT NULL,
  attempt_no integer NOT NULL DEFAULT 1,
  request_hash text NOT NULL DEFAULT '',
  response_hash text NOT NULL DEFAULT '',
  http_status integer,
  api_code text NOT NULL DEFAULT '',
  request_id_present boolean NOT NULL DEFAULT false,
  object_id_present boolean NOT NULL DEFAULT false,
  error_summary text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT platform_actions_single_std_project_create UNIQUE (job_id, action_type, attempt_no)
);

CREATE TABLE IF NOT EXISTS mwb.created_objects (
  created_object_id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES mwb.launch_jobs(job_id),
  confirmation_id text REFERENCES mwb.launch_confirmations(confirmation_id),
  action_id text REFERENCES mwb.platform_actions(action_id),
  object_type text NOT NULL,
  object_id text NOT NULL,
  object_name text NOT NULL,
  object_status text NOT NULL DEFAULT '',
  readback_status text NOT NULL DEFAULT 'pending',
  evidence_ref text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  readback_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT created_objects_one_object_per_job_type UNIQUE (job_id, object_type, object_id)
);

CREATE INDEX IF NOT EXISTS launch_confirmations_job_id_idx ON mwb.launch_confirmations(job_id);
CREATE INDEX IF NOT EXISTS platform_actions_job_id_idx ON mwb.platform_actions(job_id);
CREATE INDEX IF NOT EXISTS created_objects_job_id_idx ON mwb.created_objects(job_id);

COMMIT;
