# My Scientology

## Purpose

Store Scientology-specific member context for identity, qualification, and auditor education.

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

- Record org, service history, training, processing, standing, and classification.
- Pull education data into Auditor profile.

## Implemented Slice

- Dedicated `ScientologyProfile` table linked to `User`.
- Classification, org, last service, training level, processing status, standing attestation, education notes.
- Explicit visibility: private or members-summary.
- Protected `/profile/scientology` page.
- Authenticated `/api/profile/scientology` update route.
- Public summary helper that returns no private fields unless the member chooses members visibility.

## Access Rules

Member controls visibility except fields required for platform qualification/admin review.

## Integrations

Invitations, auditors, profile, admin verification.

## Current Design Notes

This module is central to platform identity and should not be hidden as a generic settings afterthought.

## Smoke Checklist

- Member can update fields.
- Auditor profile can read education fields.
- Private fields do not leak into public surfaces.
