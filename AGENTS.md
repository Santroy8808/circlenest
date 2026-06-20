# AGENTS.md

## Canonical Workspace

This is the active Theta-Space web app repo.

- Correct path: `C:\Repos\Theta-Space-net\NewRepo`
- GitHub/Railway source: `https://github.com/Santroy8808/circlenest.git`
- Branch for live production source: `main`
- Database target: Neon PostgreSQL
- Media target: Cloudflare R2

## Before Editing

Run:

```powershell
npm run workspace:verify
```

If this command fails, stop and correct the repo path before editing.

## Related Active Repo

Android APK wrapper source:

```powershell
C:\Repos\Theta-Space-net\ThetaSpaceAndroidWrapper
```

APK output folder:

```powershell
C:\Users\MikeDeArmon\OneDrive - Santroy\Theta-Space.net\android-apk
```

## Do Not Use

Do not implement current Theta-Space work in:

- `C:\Repos\thetansplace\circlenest`
- `C:\Repos\thetansplace\circlenest-dev`
- `C:\Repos\thetansplace\circlenest-prodpush`
- `C:\Repos\thetansplace\theta-space-android`
- `C:\Repos\circlenest-dev`
- Any Compass OneDrive folder

Those locations are legacy/reference only unless the user explicitly says otherwise.
