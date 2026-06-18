# Ads Credits

## Purpose

Provide transparent, controlled internal advertising without corrupting content areas.

## User-Facing Surfaces

- Create ad wizard.
- Ad campaign manager.
- Reserved ad stream placements.

## Primary Code Areas

- `src/modules/ads-credits`
- `src/components/ads`
- `src/app/production-zone/business/ads`

## Data Ownership

- future ad campaign, placement, credit ledger, impression, click, engagement tables.

## Core Workflows

- Create targeted campaign.
- Spend credits.
- Log delivery diagnostics.
- Track impressions/clicks.

## Access Rules

Contributor limited internal mass-mail ads. Professional and Auditor ad access by policy. Admin controls global costs and recipient caps.

## Integrations

Market, jobs, events, business, My Scientology, admin.

## Current Design Notes

Ads never live inside listings/events/details. They are reserved, labeled placements.

## Smoke Checklist

- Ad targeting excludes disallowed private data.
- No module embeds ads inside detail cards.

