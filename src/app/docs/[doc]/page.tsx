import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AppShell } from "@/components/platform/app-shell";
import { MarkdownDocument } from "@/components/platform/markdown-document";
import { requireAdminPage } from "@/lib/platform/page-access";

const docFiles: Record<string, string> = {
  "module-index": "MODULE_INDEX.md",
  "system-map": "SYSTEM_MAP.md",
  "data-model-map": "DATA_MODEL_MAP.md",
  "route-api-map": "ROUTE_API_MAP.md",
  "cutover-readiness": "docs/cutover-readiness.md",
  "release-candidate": "docs/release-candidate.md",
  "production-repo-snapshot": "docs/production-repo-snapshot.md",
  "cutover-runbook": "docs/cutover-runbook.md",
  "browser-smoke-checklist": "docs/browser-smoke-checklist.md",
  "promotion-dry-run": "docs/promotion-dry-run.md",
  "external-services-readiness": "docs/external-services-readiness.md"
};

export default async function RootDocPage({ params }: { params: { doc: string } }) {
  await requireAdminPage(`/docs/${params.doc}`);

  const fileName = docFiles[params.doc];
  if (!fileName) notFound();

  const content = await readFile(path.join(process.cwd(), fileName), "utf8");

  return (
    <AppShell>
      <MarkdownDocument content={content} />
    </AppShell>
  );
}
