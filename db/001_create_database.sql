-- Target: run from maintenance database, for example:
-- psql -X -d postgres -f db/001_create_database.sql
SELECT 'CREATE DATABASE marketing_workbench_v2'
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_database
  WHERE datname = 'marketing_workbench_v2'
)
\gexec
