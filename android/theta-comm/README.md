# Theta-Comm Android

Theta-Comm is the standalone encrypted messenger for Theta-Space. Chat groups
in this app are separate from Theta-Space community Groups.

## Local verification

Use JDK 17 and Android SDK 36. OneDrive can lock Android's generated files, so
the build accepts an external output directory:

```powershell
gradle :app:testDebugUnitTest :app:assembleDebug `
  -PthetaCommBuildDir=C:\Temp\theta-comm-build `
  --no-daemon --max-workers=2
```

The debug build creates architecture-specific APKs under
`C:\Temp\theta-comm-build\outputs\apk\debug`.

## Release prerequisites

- Apply the Theta-Comm Prisma migrations to the PostgreSQL instance running on
  the Theta-Space server.
- Set `THETA_COMM_STORAGE_ROOT` to a durable server-local directory owned by
  the Theta-Space service account. Include that directory in encrypted backups.
- Allow long-lived authenticated server-sent event connections through the
  Theta-Space reverse proxy with buffering disabled.
- Configure a protected Play release signing key and build a signed AAB.
- Complete the libsignal licensing and encryption-export review documented in
  `docs/theta-comm-libsignal-license-review.md`.

Theta-Comm has no third-party runtime messaging, database, or object-storage
dependency. Android maintains a private foreground connection directly to
`theta-space.net`, with WorkManager polling as a recovery fallback. The
required quiet connection notification must remain enabled for timely
background delivery. Cloudflare may proxy the public `theta-space.net`
connection, while the Theta-Space user and device session remains the
authorization authority at the origin.
