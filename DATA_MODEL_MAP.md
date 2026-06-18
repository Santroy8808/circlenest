# Data Model Map

## Foundation Models

- `User`
- `Profile`
- `Membership`
- `DiagnosticLog`
- `AuditLog`
- `FeatureFlag`
- `ModuleHealthCheck`
- `AdminAction`
- `MediaAsset`
- `Notification`
- `Alert`

## Planned Module Model Ownership

- Auth Security: `User`, future auth tokens, security events.
- Membership Policy: `Membership`, `FeatureFlag`, future tier overrides.
- Profile Identity: `Profile`, `MediaAsset`.
- Gallery Media Storage: `MediaAsset`, future album/tag join tables.
- Feed Stream: future post, comment, reaction, poll tables.
- Social Graph: future friend, follow, block, contact tables.
- Groups: future group, group member, join request tables.
- Market: future market listing and category tables.
- Jobs: future job listing and job category tables.
- Admin Moderation: `AuditLog`, `AdminAction`, future report and moderation queues.

