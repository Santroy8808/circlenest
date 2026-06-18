import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AppShell } from "@/components/platform/app-shell";
import { MarkdownDocument } from "@/components/platform/markdown-document";

const allowedDocs = new Set([
  "01-platform-infrastructure",
  "02-auth-security",
  "03-membership-policy",
  "04-profile-identity",
  "05-my-scientology",
  "06-gallery-media-storage",
  "07-feed-stream",
  "08-social-graph",
  "09-notifications-alerts",
  "10-chat-messages",
  "11-mail",
  "12-groups",
  "13-group-forum",
  "14-group-media-docs",
  "15-events",
  "16-market",
  "17-jobs",
  "18-auditors",
  "19-production-zone",
  "20-business-storefront",
  "21-ads-credits",
  "22-fundraisers-funds",
  "23-writers-corner",
  "24-admin-moderation",
  "25-settings-secure-areas",
  "26-search-discovery"
]);

export default async function ModuleDocPage({ params }: { params: { slug: string } }) {
  if (!allowedDocs.has(params.slug)) notFound();

  const content = await readFile(path.join(process.cwd(), "docs", "modules", `${params.slug}.md`), "utf8");

  return (
    <AppShell>
      <MarkdownDocument content={content} />
    </AppShell>
  );
}

