# Theta-Space Brand And Interface System

## Purpose

Theta-Space is a practical marketplace and community utility for Scientologists. It should feel dependable, calm, organized, and capable. The interface helps people find work, services, rentals, goods, auditors, and each other without feeling like an ad-heavy social network.

This guide is the product-level standard. It explains what an administrator should expect to see and approve. The companion [developer guide](developer-design-system.md) explains how the system is implemented.

## Brand Character

- **Useful first:** Search, listing details, contact paths, price, location, and trust information take priority over decoration.
- **Warm precision:** Theta gold is a warm accent, not a full-page color. Navy and cream surfaces keep the application calm and readable.
- **Quiet confidence:** Pages should be dense enough for repeat work but never cramped, noisy, or promotional.
- **One system:** Marketplace, jobs, messages, settings, admin, and mobile use the same visual language.

## Themes

Every interface has a dark and light version. Dark is a deep navy workspace. Light is a warm paper workspace. Theme changes must preserve the same hierarchy, action order, and contrast.

| Role | Dark theme | Light theme | Use |
| --- | --- | --- | --- |
| Canvas | Deep navy | Warm cream | App background |
| Surface | Navy panel | White cream panel | Cards, menus, form areas |
| Primary text | Pale cool white | Ink navy | Main content |
| Secondary text | Blue-grey | Slate | Supporting content |
| Accent text | Soft gold | Warm gold | Eyebrows, links, metadata, quiet actions |
| Primary action | Warm gold | Dark bronze | Publish, send, save, confirm, continue |
| Success | Green | Green | Completed or healthy state |
| Danger | Red | Red | Destructive or failed state |

The light theme deliberately separates two gold roles:

- **Bronze fill** is for a committed primary action.
- **Lighter warm-gold text** is for headings, icons, links, and buttons that do not have a bronze fill.

Do not put dark bronze text on a light cream surface when the lighter warm-gold text role is intended. Do not use gold as ordinary paragraph text.

## Content Hierarchy

Each page should make its purpose obvious in this order:

1. An optional small eyebrow identifies the area, such as `THETA-SPACE MARKETPLACE`.
2. One clear page title describes the task or destination.
3. A short supporting sentence explains the immediate value or next step.
4. The primary action appears once, near the task it completes.
5. Secondary actions are visible but visually quieter.

Avoid multiple competing banners, duplicate page titles, or repeated primary actions. A page should normally have one dominant action.

## Buttons And Actions

| Control | Meaning | Visual treatment |
| --- | --- | --- |
| Primary | A meaningful commit: publish, send, save, submit, create | Filled warm gold or bronze with high-contrast text |
| Secondary | A reversible or alternate task: back, manage, view, filter | Surface-colored control with warm-gold text and border |
| Icon action | A compact, familiar single-purpose action | Icon with tooltip, fixed square control |
| Destructive | Delete, revoke, end, remove | Red fill or explicit danger treatment |
| Chip | A filter, category, or selectable state | Compact rounded control; never used as the primary submit action |

Buttons use a modest rectangular radius. Pills are reserved for filters, tags, status chips, and small segmented selections. Text inside buttons must fit, wrap only when necessary, and retain keyboard focus visibility.

## Layout And Spacing

The interface uses a four-pixel spacing rhythm:

| Token | Size | Typical use |
| --- | --- | --- |
| `space-1` | 4px | Icon-to-label gap, fine adjustment |
| `space-2` | 8px | Related controls |
| `space-3` | 12px | Form field stacks |
| `space-4` | 16px | Card padding on compact surfaces |
| `space-5` | 24px | Section separation |
| `space-6` | 32px | Major page separation |
| `space-7` | 40px | Large page rhythm |

Desktop app pages follow the shared shell: control panel, a restrained content column, deliberate gutters, and the ad rail when applicable. The center content must not stretch merely because screen width is available. On mobile, content becomes a single readable column without horizontal clipping.

Cards are reserved for individual records, tools, dialogs, and repeatable content. Whole pages and broad sections are not decorative cards.

## Typography

The standard application font is Inter with system fallbacks. Use normal sentence case for labels and actions. Uppercase is limited to short eyebrows, small category labels, and status markers.

- Page titles are clear and compact, not marketing hero text.
- Supporting text uses the secondary content color and comfortable line height.
- Avoid negative letter spacing and viewport-dependent font sizing.
- Long titles, prices, names, and locations must wrap or truncate intentionally; they must never collide with another control.

## Images And Media

Images should explain the listing, service, person, or place. A marketplace card image must be a useful preview, not a decorative placeholder. Image overlays may carry brief category or job information, but crucial details must also appear as regular text for readability and accessibility.

For avatars and listing photos, respect the selected focus area. Do not permanently crop original source media merely to satisfy a thumbnail presentation.

## Accessibility And States

Every interactive feature must show the relevant state:

- Loading: Theta indicator and clear activity label.
- Empty: A factual explanation and one useful next action.
- Success: Confirmation without false promises.
- Error: Specific next step or recovery path.
- Disabled: Clearly muted, never indistinguishable from an enabled control.
- Focus: A visible warm-gold focus ring for keyboard users.

Important information is never communicated by color alone. Icons require concise tooltips when their meaning is not universally obvious. Touch targets are at least 42px for normal actions.

## Approval Checklist For Administrators

Before approving a new or revised page, confirm:

- It works in both themes without dark-mode colors leaking into light mode.
- The page has one obvious primary action and no duplicate action controls.
- Light-background text uses the readable warm-gold foreground role, not the bronze fill role.
- The shared shell, content width, gutters, and ad rail behavior match the rest of the application.
- The page works at desktop and narrow mobile widths without clipping or overlapping text.
- Loading, empty, error, success, focus, and disabled states are honest and visible.
- Controls have accessible labels and icon-only controls have tooltips.

## Change Control

Visual changes that introduce a new color, radius, spacing scale, component type, or motion pattern must be reviewed against this guide before implementation. If a recurring exception is legitimate, add it to the developer guide and use a named semantic token instead of a one-off value.
