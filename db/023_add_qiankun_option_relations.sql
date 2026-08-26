-- Target database: marketing_workbench_v2
-- Scope: reusable Qiankun readonly option relation facts, starting with cate_to_vest.
-- Safety: never store passport tokens, request headers, raw requests/responses, access tokens, cookies, or complete touchpoint URLs here.

CREATE TABLE IF NOT EXISTS mwb.qiankun_option_relations (
  relation_id text PRIMARY KEY,
  relation_type text NOT NULL,
  route_id text NOT NULL REFERENCES mwb.platform_routes(route_id),
  game_code text NOT NULL REFERENCES mwb.games(game_code),
  os text NOT NULL,
  parent_type text NOT NULL,
  parent_id text NOT NULL,
  parent_name text NOT NULL DEFAULT '',
  child_type text NOT NULL,
  child_id text NOT NULL,
  child_name text NOT NULL DEFAULT '',
  validation_status text NOT NULL DEFAULT 'observed',
  source_endpoint text NOT NULL,
  request_fingerprint text NOT NULL,
  response_hash text NOT NULL,
  evidence_artifact_id text REFERENCES mwb.evidence_artifacts(artifact_id),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qiankun_option_relations_status_check CHECK (validation_status IN (
    'observed',
    'confirmed',
    'stale',
    'invalid'
  )),
  CONSTRAINT qiankun_option_relations_type_check CHECK (
    relation_type <> ''
    AND parent_type <> ''
    AND parent_id <> ''
    AND child_type <> ''
    AND child_id <> ''
    AND source_endpoint ~ '^/tf/ad/'
  ),
  CONSTRAINT qiankun_option_relations_hash_check CHECK (
    request_fingerprint ~ '^sha256:[a-f0-9]{64}$'
    AND response_hash ~ '^sha256:[a-f0-9]{64}$'
  ),
  CONSTRAINT qiankun_option_relations_no_sensitive_text_check CHECK (
    coalesce(parent_name, '') !~* '(passport|token|authorization|cookie|callback/click|tf-api\.3k\.com)'
    AND coalesce(child_name, '') !~* '(passport|token|authorization|cookie|callback/click|tf-api\.3k\.com)'
    AND coalesce(source_endpoint, '') !~* '(passport|token|authorization|cookie)'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qiankun_option_relations_unique_scope
  ON mwb.qiankun_option_relations(
    relation_type,
    route_id,
    game_code,
    os,
    parent_id,
    child_id
  );

CREATE INDEX IF NOT EXISTS idx_qiankun_option_relations_parent
  ON mwb.qiankun_option_relations(
    relation_type,
    route_id,
    game_code,
    os,
    parent_type,
    parent_id,
    validation_status
  );

CREATE INDEX IF NOT EXISTS idx_qiankun_option_relations_child
  ON mwb.qiankun_option_relations(
    relation_type,
    child_type,
    child_id,
    validation_status
  );

COMMENT ON TABLE mwb.qiankun_option_relations IS
  'Reusable redacted Qiankun readonly option relations. Starts with cate_to_vest and can extend to vest/package/media/account/agent cascades.';

COMMENT ON COLUMN mwb.qiankun_option_relations.validation_status IS
  'observed means returned by a readonly option endpoint; confirmed requires downstream cascade validation; stale means no longer returned; invalid means rejected by later validation.';
