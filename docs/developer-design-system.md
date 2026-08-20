# Theta-Space Developer Design System

## Scope

This is the implementation contract for the Theta-Space visual system. It applies to desktop, responsive web, admin tools, and web content rendered in the Android wrapper. The product rationale and approval checklist are in [Brand And Interface System](design-system.md).

The source of truth is `src/app/globals.css`. The semantic token layer is intentionally separate from the legacy aliases so existing pages inherit the system while new work does not add more legacy usage.

## Token Rules

Use semantic tokens in all new CSS and component-specific styles. Do not introduce literal colors, raw `rgba()` brand colors, or a direct `--gold` foreground value for new work.

| Need | Use | Do not use |
| --- | --- | --- |
| App background | `--surface-canvas` | A literal navy or cream hex |
| Card or form surface | `--surface-default` or `--surface-raised` | A hard-coded panel color |
| Main text | `--content-primary` | `--gold` or black/white literal |
| Supporting text | `--content-secondary` | A new grey value |
| Accent text or icon | `--content-accent` | `--action-primary` or `--gold` |
| Primary action fill | `--action-primary` | `--blue` or a local gradient |
| Primary action text | `--action-primary-fg` | Hard-coded black or white |
| Secondary action | `--action-secondary-*` | A new surface or gold mix |
| Field/control border | `--border-control` | A literal bronze value |
| Focus | `--focus-ring` and `--shadow-focus` | Removing the outline without a replacement |
| Positive/negative state | `--status-success` / `--status-danger` | A local green/red value |

Legacy aliases such as `--gold`, `--gold-text`, `--panel`, and `--text` remain for compatibility only. They resolve to semantic tokens. Do not build new UI around them.

## Theme Contract

Both themes expose the same semantic token names. A component must not branch on `html.theta-theme-light` merely to choose a color that already has a token.

Allowed theme-specific CSS is limited to a genuine visual difference that cannot be expressed by a token, such as a theme-specific image treatment or a composited background. When doing so, keep the selector local to the component and document the reason in a nearby comment.

`--action-primary` is intentionally not the same as `--content-accent`:

- `--action-primary` is the solid fill of the one action that commits work.
- `--content-accent` is the readable foreground accent on open surfaces.

This prevents the light theme from using dark bronze text where a lighter, less aggressive accent belongs.

## Component Baselines

### Buttons

Use the existing shared classes when they fit:

```tsx
<button className="btn-primary" type="submit">Publish listing</button>
<Link className="btn-secondary" href="/marketplace">Back to results</Link>
```

- `btn-primary` is a commit action and must be used sparingly.
- `btn-secondary` is an alternate, reversible, or navigational action.
- `btn-danger` is reserved for destructive actions and must have confirmation where data loss is meaningful.
- Use a Lucide icon inside an icon-only control. Add a tooltip through the established `data-tooltip` pattern.
- Standard controls have a 42px minimum target and `--radius-control` corner radius.
- Pills are only for chips, filters, tags, and compact segmented controls.

For a component-specific control, start from the semantic variables:

```css
.secondaryAction {
  background: var(--action-secondary-surface);
  border: 1px solid var(--action-secondary-border);
  border-radius: var(--radius-control);
  color: var(--action-secondary-fg);
}

.secondaryAction:hover {
  background: var(--action-secondary-hover);
  border-color: var(--border-accent);
  color: var(--content-accent);
}
```

### Surfaces And Cards

Use `--surface-default` for a normal card and `--surface-raised` only for an element that is visually nested or needs separation. Use `--radius-card` for cards and `--radius-panel` for panels and dialogs. Do not nest visual cards inside visual cards.

### Forms

Labels use `--content-secondary` unless they are a small categorizing eyebrow, which uses `--content-accent`. Inputs use a named surface and `--border-control`. Inputs, selects, textareas, and custom controls must preserve the global `:focus-visible` treatment.

### Typography

- Use the existing `--font-sans` stack.
- Keep compact UI headings in proportion to their panels.
- Use `letter-spacing: 0`; never use negative letter spacing.
- Ensure names, prices, locations, and button labels cannot overlap. Use constrained grids, `min-width: 0`, wrapping, or explicit truncation.

### Motion

Interactive controls may use `--transition-interactive`. Reserve shimmer and other branded motion for feedback/tutorial discovery cues. Respect reduced-motion preferences for new prolonged or repeated animation.

## Layout Standards

Use the established app shell for authenticated destinations. Center content uses a constrained width and stable gutters; it does not become a full-width marketing layout. New marketplace, job, directory, and admin pages must test both desktop and mobile layouts before merge.

Use the spacing scale for new component gaps and padding:

```css
.section {
  display: grid;
  gap: var(--space-5);
  padding: var(--space-4);
}
```

Do not introduce a new ad hoc gap or padding value unless an existing token does not satisfy a fixed asset requirement.

## Implementation Workflow

1. Identify whether the work belongs in the shared system or a local component module.
2. Use semantic tokens and existing shared controls before adding CSS.
3. Add loading, empty, success, error, disabled, and focus states as appropriate.
4. Check light and dark themes at desktop and a narrow mobile viewport.
5. Run `npm run lint`, `npm run typecheck`, and `npm run build` for global style or routing changes.
6. Update this guide when a legitimate, reusable exception or new semantic token is added.

## Review Checklist

- No new literal brand colors in component CSS.
- No foreground text uses `--action-primary` or legacy `--gold`.
- Primary actions are not duplicated within one task region.
- Secondary controls use the shared surface, border, and foreground roles.
- Keyboard focus remains visible.
- Icons have accessible labels and tooltips where necessary.
- Text fits at desktop and mobile widths.
- Both theme states preserve contrast and hierarchy.

## Migration Policy

Do not undertake broad search-and-replace styling changes within a feature unless the relevant pattern is a shared system defect. When touching a legacy visual block, migrate its colors, border, radius, spacing, and focus treatment to semantic tokens where practical. If the same exception appears in three or more places, introduce a named token or shared component rather than copying the exception.
