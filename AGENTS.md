# AGENTS.md

## Canonical Workspace

This is the active Theta-Space web app repo.

- Production server path: `S:\Workspace\circlenest`
- Local development path: `C:\Repos\Theta-Space-net\NewRepo`
- GitHub production source: `https://github.com/Santroy8808/circlenest.git`
- Branch for live production source: `main`
- Database target: production PostgreSQL
- Media target: Cloudflare R2

## Before Editing

Run:

```powershell
npm run workspace:verify
```

If this command fails, stop and correct the repo path before editing.

The verifier accepts the current checkout path by default. To enforce a specific path on a machine, set:

```powershell
$env:THETA_EXPECTED_REPO_PATH='S:\Workspace\circlenest'
```

## Related Active Repo

Android APK wrapper source:

```powershell
C:\Repos\Theta-Space-net\ThetaSpaceAndroidWrapper
```

ThetaComm native communications app source:

```powershell
C:\Repos\Theta-Space-net\ThetaSpaceCommunicationsAndroid
```

APK output folder:

```powershell
C:\Users\MikeDeArmon\OneDrive - Santroy\Theta-Space.net\android-apk
```

## Do Not Use

Archived legacy/reference material lives in:

```powershell
C:\Repos\Theta-Space-net\repo-archive\archive-2026-06-20
```

Do not implement current Theta-Space work in that archive or in any Compass OneDrive folder unless the user explicitly asks for rollback/reference inspection.

## Feature Completion Standard

Use [docs/feature-completion-standard.md](docs/feature-completion-standard.md) as the required definition of done for desktop web, mobile web/APK wrapper, and ThetaComm work.

## Visual Standards

- Send actions must use the standard Theta-Space send glyph: `public/assets/theta-send-logo.png`, rendered through `.send-logo-button` with a `.send-logo-icon` child. Do not draw substitute theta/arrow glyphs in CSS, text, emoji, or alternate icons.

Before coding any feature:

1. Inspect the existing codebase and related active repos.
2. Identify all files, APIs, database models, routes, services, permissions, UI components, validation, and tests needed.
3. Write a short implementation plan.

During implementation:

- Every button, form, route, API endpoint, and menu item must perform its real intended function.
- Do not create placeholder handlers, mock data, fake success messages, TODO comments, stub functions, or "coming soon" behavior.
- Connect frontend behavior to backend routes/services.
- Persist data properly.
- Validate inputs and enforce permissions/admin rules where applicable.
- Handle loading, empty, success, and error states.
- Update schema/migrations when persistence changes.
- Add or update tests for the main success path and important failure cases where the repo has a test surface.
- Remove unused scaffolding and dead code.

After coding:

1. Run relevant build, lint, typecheck, and test commands.
2. Fix errors before reporting completion.
3. Manually verify the full user flow when browser/device verification is possible.
4. Report exactly what changed, how to test it, and known limitations.

A feature is not complete unless a real user can use it from the UI and the action completes correctly in the backend/database without mock data, placeholders, or manual developer intervention.
