#!/usr/bin/env bash
set -euo pipefail

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${1:-./backups}"
mkdir -p "${OUT_DIR}"

echo "Creating database backup..."
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-circlenest}" "${POSTGRES_DB:-circlenest}" > "${OUT_DIR}/db-${STAMP}.sql"

echo "Creating object storage backup..."
docker run --rm \
  --volumes-from "$(docker compose ps -q minio)" \
  -v "$(cd "${OUT_DIR}" && pwd):/backup" \
  alpine \
  sh -c 'tar -czf /backup/minio-'"${STAMP}"'.tar.gz /data'

echo "Backup complete in ${OUT_DIR}"
