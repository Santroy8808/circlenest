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
- `FeedbackTicket`
- `FeedbackTicketEvent`
- `AuthSecurityEvent`
- `EmailVerificationToken`
- `PasswordResetToken`
- `TwoFactorConfig`
- `MembershipPolicyOverride`
- `ScientologyProfile`
- `MediaCollection`
- `MediaCollectionAsset`
- `FeedPost`
- `FeedComment`
- `FeedPostReaction`
- `FeedCommentReaction`
- `SocialRelationship`

## Planned Module Model Ownership

- Auth Security: `User`, auth tokens, security events, 2FA-ready config.
- Membership Policy: `Membership`, `FeatureFlag`, `MembershipPolicyOverride`.
- Profile Identity: `Profile`, `MediaAsset` references for avatar/banner selection.
- My Scientology: `ScientologyProfile`.
- Gallery Media Storage: `MediaAsset`, `MediaCollection`, `MediaCollectionAsset`.
- Feed Stream: `FeedPost`, `FeedComment`, `FeedPostReaction`, `FeedCommentReaction`.
- Social Graph: `SocialRelationship`.
- Notifications Alerts: `Notification`, `Alert`.
- Groups: future group, group member, join request tables.
- Market: future market listing and category tables.
- Jobs: future job listing and job category tables.
- Admin Moderation: `AuditLog`, `AdminAction`, future report and moderation queues.
