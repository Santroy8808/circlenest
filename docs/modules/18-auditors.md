# Auditors

## Purpose

Provide auditor discovery and auditor profile creation for approved Auditor accounts.

## User-Facing Surfaces

- Find an Auditor directory at `/auditors`.
- Auditor detail at `/auditors/[username]`.
- `I'm an Auditor` profile builder at `/auditors/im-an-auditor`.

## Primary Code Areas

- `src/modules/auditors`
- `src/components/auditors`
- `src/app/auditors`
- `src/app/api/auditors`

## Data Ownership

- `AuditorProfile` owns public auditor practice/profile fields.
- `ScientologyProfile` remains the read-only education source.

## Core Workflows

- Browse/search/filter auditor listings.
- Open auditor detail.
- Auditor account builds mini business profile.
- Pull classification, org, training, processing, and education notes from My Scientology.
- Publish/unpublish from the directory.

## Access Rules

- Free, Contributor, Professional, and Auditor can browse after login.
- Only Auditor accounts create auditor profiles.
- Admin can create for platform operations/testing.

## Integrations

- My Scientology.
- Profile identity.
- Mail/contact later.
- Production Zone later.
- Reports later.

## Current Design Notes

Find an Auditor and I'm an Auditor are separate flows.

## Smoke Checklist

- Non-Auditor cannot create profile.
- Directory remains browsable.
- Auditor profile shows public practice fields.
- Auditor detail shows My Scientology education source separately.
