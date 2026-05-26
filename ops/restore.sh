#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: ./ops/restore.sh <db_dump.sql> [minio_backup.tar.gz]"
  exit 1
fi

DB_DUMP="$1"
MINIO_DUMP="${2:-}"

echo "Restoring database from ${DB_DUMP}..."
cat "${DB_DUMP}" | docker compose exec -T db psql -U "${POSTGRES_USER:-circlenest}" "${POSTGRES_DB:-circlenest}"

if [[ -n "${MINIO_DUMP}" ]]; then
  echo "Restoring object storage from ${MINIO_DUMP}..."
  docker run --rm \
    --volumes-from "$(docker compose ps -q minio)" \
    -v "$(dirname "$(realpath "${MINIO_DUMP}")"):/backup" \
    alpine \
    sh -c 'tar -xzf /backup/'"$(basename "${MINIO_DUMP}")"' -C /'
fi

echo "Restore complete."
