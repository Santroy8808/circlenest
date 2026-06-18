import Link from "next/link";
import { AppShell } from "@/components/platform/app-shell";
import { getModuleDefinitions } from "@/modules/platform-infrastructure/platform.service";

const rootDocs = [
  { title: "Module Index", href: "/docs/module-index" },
  { title: "System Map", href: "/docs/system-map" },
  { title: "Data Model Map", href: "/docs/data-model-map" },
  { title: "Route API Map", href: "/docs/route-api-map" },
  { title: "Cutover Readiness", href: "/docs/cutover-readiness" },
  { title: "Release Candidate", href: "/docs/release-candidate" }
];

export default function DocsPage() {
  const modules = getModuleDefinitions();

  return (
    <AppShell>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Blueprints</p>
        <h1 className="mt-3 text-3xl font-semibold">Documentation hub</h1>
      </section>

      <section className="mt-5 grid gap-3 md:grid-cols-2">
        {rootDocs.map((doc) => (
          <Link key={doc.href} href={doc.href} className="module-card rounded-md p-4">
            <h2 className="font-semibold">{doc.title}</h2>
          </Link>
        ))}
      </section>

      <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <Link key={module.key} href={module.href} className="module-card rounded-md p-4">
            <h2 className="font-semibold">{module.title}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{module.purpose}</p>
          </Link>
        ))}
      </section>
    </AppShell>
  );
}
