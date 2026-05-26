# CircleNest Runbook (Non-Developer)

## 1) Start locally (Windows PowerShell)

```powershell
cd "C:\Users\MikeDeArmon\OneDrive - Compass Managed IT, Inc\Documents\YourSpace.com\circlenest"
npm install
npm run db:generate
npm run db:seed
npm run dev
```

Open: `http://localhost:3000`

## 2) Start locally with Docker (Windows or Linux)

```bash
docker compose up -d --build
docker compose exec web npm run db:generate
docker compose exec web npx prisma db push
docker compose exec web npm run db:seed
```

## 3) Update + restart

### Windows PowerShell
```powershell
cd "C:\Users\MikeDeArmon\OneDrive - Compass Managed IT, Inc\Documents\YourSpace.com\circlenest"
npm install
npm run build
npm run dev
```

### Linux shell
```bash
cd /opt/circlenest
docker compose pull
docker compose up -d --build
```

## 4) Linux VM first-time setup (Ubuntu LTS)

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install ca-certificates curl gnupg
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Then copy project to `/opt/circlenest`, create `.env`, and run `docker compose up -d --build`.

## 5) Backup

### Windows PowerShell
```powershell
.\ops\backup.ps1
```

### Linux shell
```bash
chmod +x ops/backup.sh
./ops/backup.sh
```

## 6) Restore

```bash
chmod +x ops/restore.sh
./ops/restore.sh ./backups/db-YYYYMMDD-HHMMSS.sql ./backups/minio-YYYYMMDD-HHMMSS.tar.gz
```

## 7) Rollback

1. Keep previous image tag in registry or local cache.
2. Update compose file image tag to prior version.
3. `docker compose up -d`.

## 8) Troubleshooting

- App not loading: `docker compose ps` and `docker compose logs web --tail 200`.
- DB errors: `docker compose logs db --tail 200`.
- Login fails: verify `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `DATABASE_URL`.
- Upload issues: verify object storage env keys and bucket config.
