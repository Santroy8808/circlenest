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

## Independent Reference and Trademark Notice

Theta-Space is an independent community platform and is not affiliated with, sponsored, endorsed, operated, or controlled by the Church of Scientology International, Religious Technology Center, or any affiliated Scientology church or organization. Scientology, Dianetics, The Bridge, and certain Grade Chart terms are referenced in plain text only to describe member-reported training, processing, services, and affiliations. Referenced marks belong to Religious Technology Center or their respective owners. Theta-Space does not use Church or Scientology symbols and is not an official source of Scientology doctrine or terminology. Typographical, transcription, and terminology errors are unintended and should be reported through Feedback for review and correction.

## Integrations

Invitations, auditors, profile, admin verification.

## Current Design Notes

This module is central to platform identity and should not be hidden as a generic settings afterthought.

## Smoke Checklist

- Member can update fields.
- Auditor profile can read education fields.
- Private fields do not leak into public surfaces.
