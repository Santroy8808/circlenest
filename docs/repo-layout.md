# Theta-Space Repo Layout

The active web app source is `C:\Repos\Theta-Space-net\NewRepo`.

This repo pushes to `https://github.com/Santroy8808/circlenest.git`, branch `main`, which is the GitHub source Railway uses for the live Theta-Space app.

The active Android wrapper source is `C:\Repos\Theta-Space-net\ThetaSpaceAndroidWrapper`.

Built APK files go only to:

```powershell
C:\Users\MikeDeArmon\OneDrive - Santroy\Theta-Space.net\android-apk
```

## Verification

Before editing or pushing web changes:

```powershell
npm run workspace:verify
npm run lint
npm run typecheck
```

## Legacy Folders

Legacy/reference folders were archived on 2026-06-20 under:

```powershell
C:\Repos\Theta-Space-net\repo-archive\archive-2026-06-20
```

Archived items:

- `thetansplace`
- `circlenest-dev`
- `Theta-Space-Platforms.md`
- `Theta-Place.png`
- `Theta-space-net-android-icon.png`
- `gradle-8.10.2-bin.zip`

Do not implement new work in the archive unless the user explicitly asks for a historical comparison or rollback inspection.

Compass OneDrive paths are not project workspaces.
