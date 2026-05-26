$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = if ($args.Count -gt 0) { $args[0] } else { ".\backups" }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host "Creating database backup..."
$pgUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "circlenest" }
$pgDb = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "circlenest" }
docker compose exec -T db pg_dump -U $pgUser $pgDb | Out-File -Encoding UTF8 "$outDir\db-$stamp.sql"

Write-Host "Object storage backup can be created from Linux shell with ./ops/backup.sh for now."
Write-Host "Backup complete in $outDir"
