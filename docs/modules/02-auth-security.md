# Auth Security

## Purpose

Handle trusted member access for a private, invite-based platform.

## User-Facing Surfaces

- Login, signup, password reset, email verification, secure-area unlock, 2FA setup later.

## Primary Code Areas

- `src/modules/auth-security`
- `src/components/auth`
- `src/app/(auth)`
- `src/app/api/auth`

## Data Ownership

- `User`
- future verification tokens, password reset tokens, 2FA config, session events.

## Core Workflows

- Login by username/email.
- Signup through invitation.
- Preverified seed users for dev.
- Password reset and email verification.
- Session revocation and security event logging.

## Implemented Slice

- Auth.js credentials provider with username/email login.
- Security event table for login, signup, reset, verification, and revocation events.
- Password reset and email verification token tables.
- Session revocation through `sessionVersion`.
- 2FA-ready configuration table.
- Preverified seed users in `prisma/seed.ts`.
- Protected `/home` route for app-auth smoke testing.

## Access Rules

Unauthenticated users only see auth screens. Admin remains role-based and separate from tier.

## Integrations

Membership, profile, audit logs, alerts, and admin session tools.

## Current Design Notes

The rebuild should avoid fragile login seed drift by making seed verification explicit.

## Smoke Checklist

- Free, Contributor, Professional, Auditor, and Admin test users can log in.
- Bad credentials fail cleanly.
- Security events are logged.
