import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCutoverDashboard } from "../src/modules/cutover-readiness/cutover-readiness.service";

const repoRoot = process.cwd();
const outputPath = path.join(repoRoot, "docs", "browser-smoke-checklist.md");

function safeGit(args: string[], fallback = "unknown") {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    return fallback;
  }
}

function routeChecklist(pathName: string) {
  const checks: Record<string, string[]> = {
    "/login": [
      "Confirm the form is visually centered, readable, and branded.",
      "Confirm email/username and password fields are obvious.",
      "Confirm invalid credentials show a clear inline error without crashing."
    ],
    "/home": [
      "Confirm the feed loads without a server-side exception.",
      "Confirm stream navigation includes All, My Stream, Friends, Groups, and Pics where intended.",
      "Confirm comments and replies stay in context after submission."
    ],
    "/search": [
      "Confirm the page is guarded for anonymous users.",
      "Confirm authenticated search is one clear search surface, not competing forms.",
      "Confirm results are grouped by people, groups, Market, jobs, auditors, writing, and posts where allowed."
    ],
    "/profile/gallery": [
      "Confirm My Pics is not behind the second secure-area wall.",
      "Confirm recent images appear immediately after upload without full page refresh.",
      "Confirm image view supports avatar/banner actions with clear success feedback."
    ],
    "/groups": [
      "Confirm group cards show avatar, name, and tagline in a scrollable grid.",
      "Confirm clicking a joined group opens the group profile page.",
      "Confirm Create is a clear action card/button, not an always-open form."
    ],
    "/mail": [
      "Confirm the surface reads as mail only, not chat.",
      "Confirm contacts can be searched independently from friends.",
      "Confirm compose supports multiple internal recipients and clear send feedback."
    ],
    "/market": [
      "Confirm listings are square thumbnail cards with title and price.",
      "Confirm Free users can browse without create-listing noise.",
      "Confirm listing details open outside ad placement surfaces."
    ],
    "/jobs": [
      "Confirm all tiers can browse job listings.",
      "Confirm job cards open detail/contact pages.",
      "Confirm only Professional creation affordances are shown to eligible users."
    ],
    "/feedback/new": [
      "Confirm the issue report flow is reachable from the global Report issue button.",
      "Confirm context fields explain what will be captured.",
      "Confirm submit success produces a clear ticket reference."
    ],
    "/admin": [
      "Confirm non-admin users are blocked.",
      "Confirm admin sees cards of actions, not a wall of forms.",
      "Confirm clicking an action card starts a guided wizard with audit-aware copy."
    ]
  };

  return checks[pathName] ?? [
    "Confirm the route loads without a server-side exception.",
    "Confirm primary action cards/buttons are clear.",
    "Confirm mobile layout has no horizontal overflow."
  ];
}

function bulletList(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

const dashboard = getCutoverDashboard();
const commit = safeGit(["rev-parse", "--short", "HEAD"]);
const fullCommit = safeGit(["rev-parse", "HEAD"]);
const status = safeGit(["status", "--porcelain"], "");
const routeSections = dashboard.smokeRoutes
  .map((route) => {
    const loginNote = route.requiresLogin ? "Authenticated smoke user required." : "Public or guarded route.";
    return `## ${route.area} - \`${route.path}\`

Expected: ${route.expected}

Access: ${loginNote}

${bulletList(routeChecklist(route.path))}
`;
  })
  .join("\n");

const content = `# Theta-Space Browser Smoke Checklist

Generated: ${new Date().toISOString()}

## Source

- Repo: \`${repoRoot}\`
- Commit: \`${commit}\`
- Full commit: \`${fullCommit}\`
- Worktree: ${status ? "dirty when checklist was generated" : "clean when checklist was generated"}

## Purpose

Repeatable visual QC script for the NewRepo rebuild before any future production cutover.

This checklist does not replace lint, typecheck, build, or production smoke. It exists because the app is visual and workflow-heavy, so a green build alone is not enough.

## Browser Setup

- Desktop viewport: start around 1280x720 and also inspect a narrower laptop width.
- Mobile viewport: inspect phone-width navigation, uploads, gallery, mail, groups, and feedback.
- Use real clicks for navigation and route transitions.
- Do not use code inspection as a substitute for visual confirmation.
- Capture any server-side exception digest with the route and account used.

## Cross-Page UX Rules

- No page should open with a wall of forms.
- Navigation cards should be clickable as whole cards when they represent destinations.
- Forms should open as focused wizards, modals, drawers, or dedicated pages.
- Avoid boxes inside boxes unless the nesting communicates real structure.
- Dark theme borders, gold headings, and action button styles should remain consistent.
- Mobile must not clip fixed-position modals or block vertical scrolling.
- Ads must stay in reserved placements, never inside content detail cards.

${routeSections}
## Finish Criteria

- Every route above has been checked on desktop.
- Gallery, mail, messages, groups, and feedback have also been checked on mobile width.
- Any server exception digest is logged as a feedback/support ticket or follow-up bug.
- If production cutover is being considered, regenerate release and cutover docs after fixes.
`;

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, content, "utf8");

console.info(`Browser smoke checklist written to ${outputPath}`);
