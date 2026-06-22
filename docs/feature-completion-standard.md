# Theta-Space Feature Completion Standard

This standard applies to the desktop web app, the mobile web/APK wrapper, and the ThetaComm native communications app.

## Active Codebases

- Desktop web and production GitHub source: `C:\Repos\Theta-Space-net\NewRepo`
- Mobile Theta-Space APK wrapper: `C:\Repos\Theta-Space-net\ThetaSpaceAndroidWrapper`
- ThetaComm native communications app: `C:\Repos\Theta-Space-net\ThetaSpaceCommunicationsAndroid`
- APK output folder only: `C:\Users\MikeDeArmon\OneDrive - Santroy\Theta-Space.net\android-apk`

Do not save work to Compass OneDrive. Do not implement new work in archived repos.

## Before Coding

1. Inspect the existing codebase first.
2. Identify every affected file, route, service, API, database model, UI component, permission rule, validation rule, and test surface.
3. Write a short implementation plan before editing.
4. If the feature spans apps, define the contract between the web backend and Android clients before building UI.

## Implementation Requirements

- Buttons must perform their real intended action.
- Forms must submit to real backend behavior with validation.
- Routes and API endpoints must be connected to services and persistence.
- Menu items must navigate to working pages or perform working actions.
- Data must persist in the correct database/storage layer.
- Cloudflare R2 media flows must create both the object upload and the database record.
- Neon/PostgreSQL changes require schema/migration review.
- Admin-only or tier-gated actions must enforce permissions server-side.
- Client-side tier locks are not sufficient by themselves.
- Loading, empty, success, and error states must be visible and truthful.
- Existing scaffolding, dead code, mock data, fake success messages, stub functions, TODO comments, and "coming soon" behavior must be removed or replaced with working behavior before calling the feature done.

## Required Verification

Desktop web:

```powershell
npm run workspace:verify
npm run lint
npm run typecheck
npm run build
```

Use targeted scripts when relevant:

```powershell
npm run env:check
npm run browser:smoke
npm run services:readiness
```

ThetaComm Android:

```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
& 'C:\Repos\gradle-8.10.2\bin\gradle.bat' clean assembleDebug lintDebug
```

Theta-Space Android wrapper:

```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
& 'C:\Repos\gradle-8.10.2\bin\gradle.bat' clean assembleDebug lintDebug
```

Browser/device checks are required for UI features. Code lint alone is not enough.

## Definition Of Done

A feature is complete only when a real user can perform the full flow from the UI, the backend completes the action, data is persisted or retrieved correctly, permissions are enforced, and no manual developer intervention is required.

If any portion is intentionally not implemented, the work is incomplete and must be reported as a limitation, not as done.
