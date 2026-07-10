# Production Server Update And Rollback Reference

## Release rule

When the user explicitly approves a production push:

1. Complete local visual verification, lint, type-check, and production build.
2. Push the reviewed release and merge the approved commit to GitHub `main`.
3. Deploy that exact `origin/main` commit to the Windows production server.

Do not deploy an arbitrary feature branch, a dirty worktree, or a release with a failed gate below. A GitHub push does not make an unsafe release deployable.

## Verified production topology

Read-only inspection on 2026-07-10 confirmed:

- Host: `207.188.9.139` (`ts`, Windows Server 2022)
- SSH account: `ts\codexadmin`
- Checkout: `S:\Workspace\circlenest`
- Public site: `https://theta-space.net`
- Git checkout: clean `main`
- Web service: Windows service `ThetaSpaceWeb`, managed by NSSM, automatic start
- Web command: `C:\Program Files\nodejs\node.exe S:\Workspace\circlenest\node_modules\next\dist\bin\next start -p 3000`
- Web logs: `S:\Logs\theta-space-web.out.log` and `S:\Logs\theta-space-web.err.log`
- Reverse proxy: Windows service `ThetaSpaceCaddy`, managed by NSSM, automatic start
- Caddy config: `C:\ProgramData\Caddy\Caddyfile`
- Caddy logs: `S:\Logs\theta-space-caddy.out.log` and `S:\Logs\theta-space-caddy.err.log`
- Caddy listens on ports `80` and `443`; Next.js listens on port `3000`
- `package.json` defines `npm run worker` and `npm run worker:once`, but there is currently no `ThetaSpaceWorker` service, scheduled task, or running worker process
- PostgreSQL `pg_dump.exe` and `pg_restore.exe` are installed under `C:\Program Files\PostgreSQL\18\bin`

Do not describe the worker as running. If a release depends on continuous background processing, production deployment is blocked until a separately supervised worker is configured and verified. Do not use `worker:once` as a health check because it can process queued work.

## SSH

Use the dedicated key and the domain-qualified account:

```powershell
ssh -i $env:USERPROFILE\.ssh\id_rsa_theta_space_server 'ts\codexadmin@207.188.9.139'
```

For non-interactive commands, also use `-o BatchMode=yes -o ConnectTimeout=10`. Do not store passwords, private key contents, database URLs, or service credentials in this document or terminal output.

## Hard deployment gates

All of these must pass before stopping `ThetaSpaceWeb`:

- The target is the reviewed, approved commit on `origin/main`.
- The production worktree is clean and on `main`.
- Approved Terms of Service have replaced the onboarding placeholder text `Final Terms of Service will be inserted here.`
- `APP_ORIGIN` is the canonical HTTPS origin: `https://theta-space.net`.
- `NEXTAUTH_URL` is the canonical HTTPS origin.
- `NEXTAUTH_SECRET`, `MOBILE_AUTH_SECRET`, and `IP_HASH_SECRET` are present, high entropy, and mutually independent.
- SMTP certificate validation is enabled. `SMTP_IGNORE_TLS=true` is not allowed in production.
- `CLOUDFLARE_R2_PRIVATE_BUCKET` exists, is accessible by the configured R2 credentials, and is different from the public bucket.
- Existing private media needed by the release has been copied and verified in the private bucket. Preserve source objects through the rollback window.
- A restorable PostgreSQL backup can be created before migrations.
- If continuous jobs are required by the release, a supervised worker service and its logging/restart procedure exist.

After fetching the approved source, run the fail-closed checks without printing environment values:

```powershell
Set-Location S:\Workspace\circlenest
npm run env:check
npm run services:readiness
npm run cutover:check

if (Get-ChildItem .\src -File -Recurse | Select-String -Pattern 'Final Terms of Service will be inserted here' -SimpleMatch -Quiet) {
  throw 'Approved Terms of Service are not installed.'
}
```

Any failed or indeterminate critical check blocks deployment. Redis may remain an explicitly expected optional DB-fallback check; database, environment, private media, authentication, mail security, and origin checks may not.

## Safe deploy procedure

### 1. Pin and fetch the approved release

Set `ExpectedCommit` to the full SHA approved for release:

```powershell
Set-Location S:\Workspace\circlenest

if ((git branch --show-current) -ne 'main') { throw 'Production checkout is not on main.' }
if (git status --porcelain) { throw 'Production checkout is dirty.' }

$PreviousCommit = (git rev-parse HEAD).Trim()
$ExpectedCommit = '<approved-full-git-sha>'

git fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'git fetch failed.' }

$TargetCommit = (git rev-parse origin/main).Trim()
if ($TargetCommit -ne $ExpectedCommit) { throw 'origin/main does not match the approved release SHA.' }

git merge --ff-only origin/main
if ($LASTEXITCODE -ne 0) { throw 'Fast-forward update failed.' }
```

Run every hard gate now, while the currently built web service is still available. If a gate fails, leave the running service untouched, record the failed gate and both SHAs, and do not continue to install, migrate, or restart.

### 2. Stop writers and create a verified database backup

The current host has no worker. If `ThetaSpaceWorker` is added later, stop it before the web service and backup:

```powershell
$worker = Get-Service ThetaSpaceWorker -ErrorAction SilentlyContinue
if ($worker) { Stop-Service ThetaSpaceWorker }
Stop-Service ThetaSpaceWeb
```

Create a custom-format backup without echoing the database URL:

```powershell
$backupDirectory = 'S:\Backups\theta-space'
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$BackupFile = Join-Path $backupDirectory ("theta-space-{0}.dump" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

$databaseLine = Get-Content .\.env | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $databaseLine) { throw 'DATABASE_URL is missing from .env.' }
$databaseUrl = ($databaseLine -replace '^\s*DATABASE_URL\s*=', '').Trim().Trim('"').Trim("'")

& 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe' --format=custom --no-owner --no-acl --file=$BackupFile --dbname=$databaseUrl
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed.' }

& 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' --list $BackupFile | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'The database backup could not be read.' }

$databaseUrl = $null
```

Do not continue if the backup fails or cannot be listed.

### 3. Install, reconcile migrations, and build

```powershell
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }

npx prisma generate
if ($LASTEXITCODE -ne 0) { throw 'Prisma generation failed.' }

npx prisma migrate status
```

Inspect the migration status before continuing. An unexpected failed migration, divergence, or missing migration blocks deployment. A nonzero result can be expected only during the documented one-time baseline adoption or when known forward migrations are waiting to be deployed.

The existing production database predates the Prisma migration ledger. The one-time baseline is `20260625000000_baseline`. Mark it applied only when all of the following are true:

- the backup above is verified;
- the live schema has been compared with the baseline and is semantically equivalent;
- the baseline is pending only because `_prisma_migrations` was not adopted;
- no baseline SQL will be executed against the populated database.

Only under those conditions:

```powershell
npx prisma migrate resolve --applied 20260625000000_baseline
if ($LASTEXITCODE -ne 0) { throw 'Baseline adoption failed.' }
```

Then apply forward migrations and build:

```powershell
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw 'Production migration failed.' }

npx prisma migrate status
if ($LASTEXITCODE -ne 0) { throw 'Migration verification failed.' }

npm run build
if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }
```

Never run `prisma migrate dev`, `prisma db push`, or the baseline SQL directly against production.

### 4. Start the app and verify both sides of Caddy

```powershell
Start-Service ThetaSpaceWeb
$worker = Get-Service ThetaSpaceWorker -ErrorAction SilentlyContinue
if ($worker) { Start-Service ThetaSpaceWorker }

Get-Service ThetaSpaceWeb, ThetaSpaceCaddy
curl.exe --fail --show-error http://127.0.0.1:3000/health/live
curl.exe --fail --show-error http://127.0.0.1:3000/health/ready
curl.exe --fail --show-error http://127.0.0.1:3000/health/version
curl.exe --fail --show-error https://theta-space.net/health/live
curl.exe --fail --show-error https://theta-space.net/health/ready
curl.exe --fail --show-error https://theta-space.net/health/version

Get-Content S:\Logs\theta-space-web.err.log -Tail 100
```

Require HTTP 200 and `ok: true`. A `ready` response described as degraded is acceptable only when every critical check is healthy and the only non-healthy result is an expected optional fallback such as unconfigured Redis.

Restart Caddy only when its executable or configuration changed. Validate first:

```powershell
& 'C:\ProgramData\chocolatey\bin\caddy.exe' validate --config C:\ProgramData\Caddy\Caddyfile --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'Caddy validation failed.' }
Restart-Service ThetaSpaceCaddy
```

Complete a short signed-out, member, and admin smoke test after health checks pass. Include login, feed, one communication path, private-media access control, and an admin-only page.

## Rollback

### Code rollback

Do not rewrite `main` or force-push. Keep the production checkout clean, stop writers, detach at the recorded prior commit, rebuild, and restart:

```powershell
$worker = Get-Service ThetaSpaceWorker -ErrorAction SilentlyContinue
if ($worker) { Stop-Service ThetaSpaceWorker }
Stop-Service ThetaSpaceWeb

git switch --detach $PreviousCommit
if ($LASTEXITCODE -ne 0) { throw 'Could not select the prior release.' }

npm ci
npx prisma generate
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Rollback build failed.' }

Start-Service ThetaSpaceWeb
if ($worker) { Start-Service ThetaSpaceWorker }
```

Repeat all local and public health checks. Leave the checkout detached at the known-good SHA until the failure is understood and a reviewed forward fix is ready.

### Database and media rollback

Prisma does not provide automatic down migrations. Do not mark an applied migration rolled back merely to change ledger state. Prefer a forward fix when migrated schema remains compatible with the prior app.

Restore `$BackupFile` only after explicit approval of the outage and data-loss boundary. Stop every writer first, verify the target database, and use the PostgreSQL restore tooling; a restore can discard data written after the backup. Record the backup path and release SHAs in the incident notes.

Private R2 migration should copy before cutover, not move or delete. Preserve the source objects until the release and rollback window are complete. If private-media verification fails, roll back code and access routing without deleting either copy.

## Last verified health state

On 2026-07-10, read-only checks returned HTTP 200 for all six endpoints:

- `http://127.0.0.1:3000/health/live`
- `http://127.0.0.1:3000/health/ready`
- `http://127.0.0.1:3000/health/version`
- `https://theta-space.net/health/live`
- `https://theta-space.net/health/ready`
- `https://theta-space.net/health/version`

The then-running release reported healthy critical environment, PostgreSQL, and R2 checks, with Redis unconfigured in DB-fallback mode. This historical result does not waive the stricter gates for the next release.
