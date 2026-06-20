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

The following are legacy/reference folders and should not receive new implementation work without an explicit user instruction:

- `C:\Repos\thetansplace\circlenest`
- `C:\Repos\thetansplace\circlenest-dev`
- `C:\Repos\thetansplace\circlenest-prodpush`
- `C:\Repos\thetansplace\theta-space-android`
- `C:\Repos\circlenest-dev`

Compass OneDrive paths are not project workspaces.
