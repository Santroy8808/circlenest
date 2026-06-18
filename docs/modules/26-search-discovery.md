# Search Discovery

## Purpose

Provide unified, privacy-aware search across the private platform.

## User-Facing Surfaces

- Search page.
- Inline search boxes for people, groups, market, jobs, auditors.

## Primary Code Areas

- `src/modules/search-discovery`
- `src/components/search`
- `src/app/search`

## Data Ownership

- future search index/materialized views if needed.

## Core Workflows

- Search people by allowed profile data.
- Search groups, jobs, market, auditors.
- Respect blocks and privacy settings.

## Access Rules

Search results only reveal records the viewer may access.

## Integrations

Profile, social graph, groups, jobs, market, auditors, admin.

## Current Design Notes

Search should support private community discovery, not public web indexing.

## Smoke Checklist

- Blocked/private users do not leak.
- Results are grouped by type.

