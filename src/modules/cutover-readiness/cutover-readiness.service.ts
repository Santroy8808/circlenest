import type { CutoverDashboardView } from "@/modules/cutover-readiness/types";

export function getCutoverDashboard(): CutoverDashboardView {
  return {
    gates: [
      {
        title: "Preflight script",
        status: "automated",
        detail: "Read-only machine/repo/env readiness check. It reports missing production pieces without mutating anything.",
        command: "npm run cutover:check"
      },
      {
        title: "Static checks",
        status: "automated",
        detail: "Lint, TypeScript, and production build must pass from NewRepo.",
        command: "npm run lint && npm run typecheck && npm run build"
      },
      {
        title: "Release manifest",
        status: "automated",
        detail: "Generate a release candidate document from the current commit, module list, validation commands, and route smoke plan.",
        command: "npm run release:manifest"
      },
      {
        title: "Production repo snapshot",
        status: "automated",
        detail: "Read the local production repo branch, remote, commit, archive tags, and warnings before any promotion.",
        command: "npm run prod:snapshot"
      },
      {
        title: "Cutover runbook",
        status: "automated",
        detail: "Generate the human-reviewed archive, promotion, smoke, and rollback command sequence without executing it.",
        command: "npm run cutover:runbook"
      },
      {
        title: "Browser smoke checklist",
        status: "automated",
        detail: "Generate the route-by-route visual QC script for desktop and mobile browser checks.",
        command: "npm run browser:smoke"
      },
      {
        title: "Promotion dry run",
        status: "automated",
        detail: "Generate a read-only manifest of included files, excluded artifacts, and production file-scope hazards.",
        command: "npm run promote:dry-run"
      },
      {
        title: "External services readiness",
        status: "automated",
        detail: "Generate a Windows service, PostgreSQL, R2, and authentication readiness report without connecting or deploying.",
        command: "npm run services:readiness"
      },
      {
        title: "Browser visual QC",
        status: "manual",
        detail: "Login, home, search, profile, gallery, groups, mail, market, jobs, feedback, and admin need browser confirmation."
      },
      {
        title: "Production archive",
        status: "required",
        detail: "Current production source must be tagged as archive-YYYY-MM-DD.vN before overwrite."
      },
      {
        title: "Windows service, PostgreSQL, R2 smoke",
        status: "manual",
        detail: "Windows service deployment, PostgreSQL migration state, and R2 upload/readback must be verified after GitHub deployment."
      }
    ],
    smokeRoutes: [
      {
        area: "Auth",
        path: "/login",
        expected: "Login form loads and accepts email or username.",
        requiresLogin: false
      },
      {
        area: "Stream",
        path: "/home",
        expected: "Authenticated user lands on the stream without server error.",
        requiresLogin: true
      },
      {
        area: "Search",
        path: "/search",
        expected: "Anonymous users redirect to login; authenticated users see privacy-aware search.",
        requiresLogin: true
      },
      {
        area: "Gallery",
        path: "/profile/gallery",
        expected: "My Pics loads without second secure-area prompt.",
        requiresLogin: true
      },
      {
        area: "Groups",
        path: "/groups",
        expected: "Group cards render and navigate into group profiles.",
        requiresLogin: true
      },
      {
        area: "Mail",
        path: "/mail",
        expected: "Mail client opens as mail-only, not chat.",
        requiresLogin: true
      },
      {
        area: "Market",
        path: "/market",
        expected: "Square listing cards show title and price.",
        requiresLogin: false
      },
      {
        area: "Jobs",
        path: "/jobs",
        expected: "Job cards are clickable and show detail/contact pages.",
        requiresLogin: true
      },
      {
        area: "Support",
        path: "/feedback/new",
        expected: "Feedback ticket form opens from anywhere.",
        requiresLogin: false
      },
      {
        area: "Admin",
        path: "/admin",
        expected: "Protected admin wizard/card interface requires admin access.",
        requiresLogin: true
      }
    ],
    rollbackSteps: [
      "Confirm the rollback tag name and production branch before running any command.",
      "Checkout production main in C:\\Repos\\thetansplace\\circlenest.",
      "Reset main to the archive tag only after explicit approval.",
      "Push with --force-with-lease, then deploy and verify the archived commit on the Windows production server."
    ],
    nonGoals: [
      "Do not purge production data.",
      "Do not migrate production PostgreSQL from this dashboard.",
      "Do not push to GitHub from this dashboard.",
      "Do not touch Cloudflare R2 objects from this dashboard."
    ]
  };
}
