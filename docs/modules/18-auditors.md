# Auditors

## Purpose

Provide auditor discovery and auditor profile creation for approved Auditor accounts.

## User-Facing Surfaces

- Find an Auditor.
- Auditor detail.
- I'm an Auditor profile builder.

## Primary Code Areas

- `src/modules/auditors`
- `src/components/auditors`
- `src/app/auditors`

## Data Ownership

- future auditor listing and auditor media tables.

## Core Workflows

- Browse/search/filter auditors.
- Auditor builds mini business profile.
- Pull education from My Scientology.

## Access Rules

Only Auditor accounts create auditor profiles.

## Integrations

My Scientology, profile, media, production zone, reports.

## Current Design Notes

Find an Auditor and I'm an Auditor are separate flows.

## Smoke Checklist

- Non-Auditor cannot create profile.
- Directory remains browsable.

