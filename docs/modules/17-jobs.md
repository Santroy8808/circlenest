# Jobs

## Purpose

Provide a browsable hiring board with Professional-only job posting.

## User-Facing Surfaces

- Job board.
- Job detail.
- Create job wizard.

## Primary Code Areas

- `src/modules/jobs`
- `src/components/jobs`
- `src/app/jobs`

## Data Ownership

- future job listing and static category tables.

## Core Workflows

- Browse and search jobs.
- Open full job detail/contact.
- Professional creates jobs.
- Promote job through ad system.

## Access Rules

Free and Contributor browse. Only Professional creates.

## Integrations

Business profile, ads, production zone, reports.

## Current Design Notes

Job listings must be clickable cards, not static summaries.

## Smoke Checklist

- Free can browse.
- Contributor cannot create.
- Professional can create.

