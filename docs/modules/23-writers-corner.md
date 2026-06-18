# Writers Corner

## Purpose

Give Contributor+ members a manuscript and chapter workspace with reader-friendly output and creator-only editing.

## User-Facing Surfaces

- `/writers-corner` for manuscript browsing.
- `/writers-corner/create` for manuscript creation.
- `/writers-corner/[manuscriptId]` for manuscript detail and chapter cards.
- `/writers-corner/[manuscriptId]/chapters/create` for chapter creation.
- `/writers-corner/[manuscriptId]/chapters/[chapterId]` for reader/editor view.

## Primary Code Areas

- `src/modules/writers-corner`
- `src/components/writers-corner`
- `src/app/writers-corner`
- `src/app/api/writers`

## Data Ownership

- `WriterManuscript` owns title, genre, summary, visibility, author, and chapters.
- `WriterChapter` owns text, future HTML/RTF storage, word count, sort order, publish time, and autosave timestamp.
- Creator ownership controls editing; member visibility controls reading.

## Core Workflows

- Contributor/Professional/Admin creates a manuscript.
- Creator adds chapter cards with word counts.
- Members open chapter reader pages.
- Creator edits chapter text from the reader/editor page.
- Autosave-ready API supports explicit autosave writes and tracks `autosavedAt`.

## Access Rules

- `writers.access` is required to create manuscripts.
- Members can read manuscripts marked `MEMBERS`.
- Private manuscripts are visible only to author/Admin.
- Only the author/Admin can create or edit chapters.

## Integrations

- Production Zone links directly to Writers Corner.
- Profile and notifications can later surface manuscript activity.
- RTF toolbar and timed one-minute autosave are prepared by schema/service fields but can be expanded in a dedicated editor-polish pass.

## Diagnostics And Audit

- Manuscript creation writes diagnostic and audit logs.
- Chapter creation and saves write diagnostic logs.

## Smoke Checklist

- `/writers-corner` redirects logged-out users to login.
- Non-writer tier can browse member manuscripts but cannot create.
- Creator can create a manuscript and chapter.
- Chapter reader shows previous/next navigation.
- Creator-only editor can save chapter updates.
