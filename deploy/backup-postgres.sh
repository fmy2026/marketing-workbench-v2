#!/bin/sh
set -eu

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
database_name="${MWBV2_DATABASE_NAME:-marketing_workbench_v2}"
backup_dir="${MWBV2_BACKUP_DIR:-$project_dir/.local/backups}"
retention_days="${MWBV2_BACKUP_RETENTION_DAYS:-14}"

case "$retention_days" in
  ''|*[!0-9]*) echo "MWBV2_BACKUP_RETENTION_DAYS must be a non-negative integer" >&2; exit 2 ;;
esac

umask 077
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$backup_dir/${database_name}-${timestamp}.dump"

pg_dump --format=custom --no-owner --no-acl --file "$target" "$database_name"
pg_restore --list "$target" >/dev/null
find "$backup_dir" -type f -name "${database_name}-*.dump" -mtime "+$retention_days" -delete
echo "$target"
