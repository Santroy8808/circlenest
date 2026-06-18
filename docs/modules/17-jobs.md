# Jobs

## Purpose

Provide a browsable hiring board with Professional-only job posting.

## User-Facing Surfaces

- Job board at `/jobs`.
- Job detail at `/jobs/[listingId]`.
- Create job wizard at `/jobs/create`.

## Primary Code Areas

- `src/modules/jobs`
- `src/components/jobs`
- `src/app/jobs`
- `src/app/api/jobs`

## Data Ownership

- `JobListing` owns job board records.
- Static category and employment type enums keep search clean.

## Core Workflows

- Browse and search jobs.
- Filter by static category.
- Open full job detail/contact.
- Professional/Admin creates jobs.
- Promote job through ad system later without embedding ads inside jobs.

## Access Rules

- Free and Contributor browse after login.
- Professional creates.
- Admin can create for platform operations/testing.

## Integrations

- Membership policy.
- Business profile later.
- Ads handoff later.
- Production Zone later.
- Reports later.

## Current Design Notes

Job listings must be clickable cards, not static summaries.

## Smoke Checklist

- Free can browse.
- Contributor can browse but cannot create.
- Professional can create.
- Job cards open detail pages with contact info.
- Ads are handoff notes only, never embedded in the listing body.
