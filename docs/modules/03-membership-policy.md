# Membership Policy

## Purpose

Define which account tiers can see, create, moderate, invite, advertise, and manage resources.

## User-Facing Surfaces

- Membership comparison, upgrade prompts, tier-aware controls, admin overrides.

## Primary Code Areas

- `src/modules/membership-policy`
- `src/components/policy`
- `src/lib/platform/feature-flags`

## Data Ownership

- `Membership`
- `FeatureFlag`
- `MembershipPolicyOverride`
- future invite exception tables.

## Core Workflows

- Resolve effective access from tier, role, flags, account capabilities, and admin overrides.
- Gate UI and APIs consistently.
- Support future tiers without brittle string checks.

## Implemented Slice

- Central tier matrix in `src/modules/membership-policy/policy.ts`.
- Effective policy resolution with role, tier, and per-user overrides.
- Audit-logged policy override service.
- Public matrix API at `/api/membership-policy/matrix`.
- Authenticated feature evaluation API at `/api/membership-policy/evaluate`.
- Membership comparison page at `/membership`.

## Access Rules

Admin role bypasses feature gates only where appropriate. Paid tier never grants admin role.

## Integrations

All creation modules, admin, invitations, ads, storage, and settings.

## Current Design Notes

Normalize `Professional` as the business tier display name.

## Smoke Checklist

- Tier matrix tests cover Free, Contributor, Professional, Auditor, Admin.
- Locked controls never submit privileged API actions.
