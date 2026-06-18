import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const productionRepoPath = process.env.THETA_PROD_REPO ?? "C:\\Repos\\thetansplace\\circlenest";
const outputPath = path.join(repoRoot, "docs", "cutover-runbook.md");

function run(command: string, args: string[], cwd: string) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function safeRun(command: string, args: string[], cwd: string, fallback = "unavailable") {
  try {
    return run(command, args, cwd);
  } catch {
    return fallback;
  }
}

function formatDateTag(date: Date) {
  return date.toISOString().slice(0, 10);
}

function nextArchiveTag(existingTags: string[], datePart: string) {
  const baseTag = `archive-${datePart}`;
  if (!existingTags.includes(baseTag)) return baseTag;

  const versionPattern = new RegExp(`^${baseTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.v(\\d+)$`);
  const versions = existingTags
    .map((tag) => tag.match(versionPattern)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number.parseInt(value, 10))
    .filter(Number.isFinite);

  return `${baseTag}.v${Math.max(1, ...versions) + 1}`;
}

function bulletList(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- none";
}

const generatedAt = new Date();
const datePart = formatDateTag(generatedAt);
const prodBranch = safeRun("git", ["branch", "--show-current"], productionRepoPath);
const prodCommit = safeRun("git", ["rev-parse", "--short", "HEAD"], productionRepoPath);
const prodFullCommit = safeRun("git", ["rev-parse", "HEAD"], productionRepoPath);
const prodStatus = safeRun("git", ["status", "--porcelain"], productionRepoPath, "");
const prodRemote = safeRun("git", ["remote", "-v"], productionRepoPath, "No remotes configured.");
const archiveTags = safeRun("git", ["tag", "--list", "archive-*"], productionRepoPath, "")
  .split(/\r?\n/)
  .filter(Boolean);
const suggestedArchiveTag = nextArchiveTag(archiveTags, datePart);
const newRepoBranch = safeRun("git", ["branch", "--show-current"], repoRoot);
const newRepoCommit = safeRun("git", ["rev-parse", "--short", "HEAD"], repoRoot);
const newRepoFullCommit = safeRun("git", ["rev-parse", "HEAD"], repoRoot);
const newRepoStatus = safeRun("git", ["status", "--porcelain"], repoRoot, "");

const warnings = [
  newRepoStatus ? "NewRepo is dirty while generating this runbook." : null,
  prodStatus ? "Production repo is dirty. Resolve or document this before archive." : null,
  prodBranch !== "main" ? `Production repo is on ${prodBranch}, not main.` : null,
  !prodRemote.includes("Santroy8808") || !prodRemote.includes("circlenest")
    ? "Production remote does not clearly point at Santroy8808/circlenest."
    : null
].filter((warning): warning is string => Boolean(warning));

const content = `# Theta-Space Production Cutover Runbook

Generated: ${generatedAt.toISOString()}

## Purpose

Human-reviewed command sequence for a future NewRepo cutover into the production GitHub source.

This runbook is documentation only. It does not copy files, archive production, push GitHub, migrate Neon, deploy Railway, or touch Cloudflare R2.

## Current Sources

- NewRepo path: \`${repoRoot}\`
- NewRepo branch: \`${newRepoBranch}\`
- NewRepo commit: \`${newRepoCommit}\`
- NewRepo full commit: \`${newRepoFullCommit}\`
- Production repo path: \`${productionRepoPath}\`
- Production branch: \`${prodBranch}\`
- Production commit: \`${prodCommit}\`
- Production full commit: \`${prodFullCommit}\`
- Suggested archive tag: \`${suggestedArchiveTag}\`

## Production Remote

\`\`\`text
${prodRemote}
\`\`\`

## Warnings

${bulletList(warnings)}

## Phase 0 - Stop And Verify

Do these before any promotion:

- Confirm this is an approved cutover window.
- Confirm Railway is linked to GitHub \`Santroy8808/circlenest\`.
- Confirm Neon production migrations are reviewed.
- Confirm Cloudflare R2 production bucket settings are known.
- Confirm live login smoke accounts are available.
- Confirm rollback owner is watching the deployment.

## Phase 1 - Validate NewRepo

Run from NewRepo:

\`\`\`powershell
cd C:\\Repos\\Theta-Space-net\\NewRepo
npm run lint
npm run typecheck
$env:DATABASE_URL='postgresql://user:password@localhost:5432/theta_space?schema=public'
$env:NEXTAUTH_SECRET='local-development-secret-32-chars'
$env:AUTH_SECRET='local-development-secret-32-chars'
npm run build
npm run cutover:check
npm run release:manifest
npm run prod:snapshot
npm run cutover:runbook
\`\`\`

## Phase 2 - Archive Current Production

Run from production repo only after confirming the suggested tag:

\`\`\`powershell
cd C:\\Repos\\thetansplace\\circlenest
git status --short
git branch --show-current
git rev-parse HEAD
git tag ${suggestedArchiveTag}
git push origin ${suggestedArchiveTag}
\`\`\`

Expected result:

- Archive tag \`${suggestedArchiveTag}\` points to production commit \`${prodFullCommit}\`.
- GitHub shows the archive tag before production source is overwritten.

## Phase 3 - Promote NewRepo Source

Use the approved copy/promote method only after archive exists.

Rules:

- Do not copy \`.env*\`, \`.next\`, \`node_modules\`, temporary build files, or local SQLite files.
- Keep production Git history readable with one clear promotion commit.
- Re-run \`npm run build\` in production repo before push.
- Do not push if generated files or local artifacts are accidentally staged.

Recommended production validation:

\`\`\`powershell
cd C:\\Repos\\thetansplace\\circlenest
npm install
npm run lint
npm run typecheck
npm run build
git status --short
\`\`\`

## Phase 4 - Push Production GitHub

Only after validation and archive confirmation:

\`\`\`powershell
cd C:\\Repos\\thetansplace\\circlenest
git add .
git commit -m "Promote NewRepo rebuild to production"
git push origin main
\`\`\`

## Phase 5 - Railway, Neon, R2 Smoke

Watch Railway deploy from GitHub, then verify:

- Railway build succeeds.
- Railway service boots without server-side exceptions.
- Neon migrations are applied or confirmed already current.
- R2 upload intent returns a valid signed URL.
- R2 complete-upload creates a DB media record.
- Uploaded media remains visible after refresh.

## Phase 6 - Browser Production Smoke

Verify on \`theta-space.net\`:

- \`/login\` loads.
- A preverified user can log in.
- \`/home\` loads after login.
- \`/profile/gallery\` opens without secure-area prompt.
- My Pics upload, refresh, avatar, and banner actions work.
- \`/groups\` cards open group pages.
- Group forum threads collapse, open, comment, and reply.
- \`/mail\` behaves as mail-only.
- \`/messages\` behaves as chat-only.
- \`/market\` listing cards are square thumbnail cards.
- \`/jobs\` listings open detail/contact pages.
- \`/feedback/new\` can create a ticket.
- \`/admin\` requires admin and uses card/wizard actions.

## Rollback

Rollback is destructive to production \`main\`. Only run after explicit approval and confirming the archive tag:

\`\`\`powershell
cd C:\\Repos\\thetansplace\\circlenest
git fetch origin --tags
git checkout main
git reset --hard ${suggestedArchiveTag}
git push --force-with-lease origin main
\`\`\`

After rollback:

- Watch Railway redeploy the archive commit.
- Confirm \`theta-space.net/login\` loads.
- Confirm a known account can log in.
- Record the failed release commit and rollback reason.

## Never From This Runbook

- Do not purge production data.
- Do not delete Cloudflare R2 objects.
- Do not force-push without a verified archive tag.
- Do not run rollback commands from NewRepo.
- Do not treat generated docs as approval to deploy.
`;

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, content, "utf8");

console.info(`Cutover runbook written to ${outputPath}`);
if (warnings.length) {
  console.info(`Warnings: ${warnings.length}`);
  for (const warning of warnings) {
    console.info(`- ${warning}`);
  }
}
