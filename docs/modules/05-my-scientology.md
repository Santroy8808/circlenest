# My Scientology

## Purpose

Store Scientology-specific member context for identity, qualification, auditor education, and controlled targeting.

## User-Facing Surfaces

- My Scientology profile/settings.
- Public profile snippets where member chooses visibility.

## Primary Code Areas

- `src/modules/my-scientology`
- `src/components/profile`
- `src/app/profile/scientology`

## Data Ownership

- `ScientologyProfile`

## Core Workflows

- Record org, service history, training, processing, standing, classification.
- Pull education data into Auditor profile.
- Provide privacy-aware targeting fields for ads.

## Implemented Slice

- Dedicated `ScientologyProfile` table linked to `User`.
- Classification, org, last service, training level, processing status, standing attestation, education notes.
- Explicit visibility: private or members-summary.
- `adTargetingAllowed` opt-in field for privacy-safe matching later.
- Protected `/profile/scientology` page.
- Authenticated `/api/profile/scientology` update route.
- Public summary helper that returns no private fields unless the member chooses members visibility.

## Access Rules

Member controls visibility except fields required for platform qualification/admin review.

## Integrations

Invitations, auditors, ads, profile, admin verification.

## Current Design Notes

This module is central to platform identity and should not be hidden as a generic settings afterthought.

## Smoke Checklist

- Member can update fields.
- Auditor profile can read education fields.
- Private fields do not leak into public surfaces.
