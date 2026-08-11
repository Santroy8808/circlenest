import { AuditorDirectoryKind } from "@prisma/client";
import { prisma } from "@/lib/platform/db";

const OFFICIAL_SITE = "https://www.scientology.org";
const LOCATOR_URL = `${OFFICIAL_SITE}/churches/`;

type OfficialOrganization = {
  kind: AuditorDirectoryKind;
  slug: string;
  sourceUrl: string;
};

type ParsedOrganization = OfficialOrganization & {
  practiceName: string;
  address: string | null;
  location: string | null;
  phone: string | null;
  website: string | null;
};

const SPECIAL_ORGANIZATIONS: OfficialOrganization[] = [
  { kind: AuditorDirectoryKind.SH_AO, slug: "advanced-organization-los-angeles", sourceUrl: `${OFFICIAL_SITE}/churches/advanced-scientology-organizations/advanced-organization-los-angeles/` },
  { kind: AuditorDirectoryKind.SH_AO, slug: "american-saint-hill-organization", sourceUrl: `${OFFICIAL_SITE}/churches/advanced-scientology-organizations/american-saint-hill-organization/` },
  { kind: AuditorDirectoryKind.SH_AO, slug: "advanced-organization-saint-hill-africa", sourceUrl: `${OFFICIAL_SITE}/churches/advanced-scientology-organizations/advanced-organization-saint-hill-africa/` },
  { kind: AuditorDirectoryKind.SH_AO, slug: "advanced-organization-europe", sourceUrl: `${OFFICIAL_SITE}/churches/advanced-scientology-organizations/advanced-organization-europe/` },
  { kind: AuditorDirectoryKind.SH_AO, slug: "advanced-organization-saint-hill-united-kingdom", sourceUrl: `${OFFICIAL_SITE}/churches/advanced-scientology-organizations/advanced-org-saint-hill-united-kingdom/` },
  { kind: AuditorDirectoryKind.SH_AO, slug: "advanced-organization-saint-hill-oceania", sourceUrl: `${OFFICIAL_SITE}/churches/advanced-scientology-organizations/advanced-org-saint-hill-oceania/` },
  { kind: AuditorDirectoryKind.FLAG, slug: "flag-service-organization", sourceUrl: `${OFFICIAL_SITE}/churches/flag-land-base/` }
];

function cleanText(value: string) {
  return value.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s*\n\s*/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function pageUrl(href: string) {
  return new URL(href.replace(/\.html$/, "/"), OFFICIAL_SITE).toString();
}

function classVOrganizations(html: string): OfficialOrganization[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"']*\/churches\/ideal-orgs\/[^"'#?]+)["']/gi)) {
    const href = match[1];
    if (href.endsWith("/ideal-orgs/") || href.endsWith("/ideal-orgs")) continue;
    urls.add(pageUrl(href));
  }

  return [...urls].map((sourceUrl) => ({
    kind: AuditorDirectoryKind.CLASS_V,
    slug: new URL(sourceUrl).pathname.split("/").filter(Boolean).at(-1) ?? "class-v-org",
    sourceUrl
  }));
}

function detailFromHtml(organization: OfficialOrganization, html: string): ParsedOrganization | null {
  const name = cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const contact = html.match(/<strong>Address:<\/strong>[\s\S]*?<\/div>/i)?.[0] ?? "";
  const addressMatch = contact.match(/Address:<\/strong><br>\s*([\s\S]*?)(?:<strong>Phone:|<\/div>)/i);
  const phone = cleanText(contact.match(/<strong>Phone:<\/strong>\s*([\s\S]*?)(?:<\/span>|<\/nobr>|<\/div>)/i)?.[1] ?? "") || null;
  const addressLines = cleanText(addressMatch?.[1] ?? "").split("\n").filter(Boolean);
  const website = html.match(/Go to\s*<a[^>]+href=["']([^"']+)["']/i)?.[1] ?? null;

  if (!name || addressLines.length === 0) return null;
  return {
    ...organization,
    practiceName: name,
    address: addressLines.join(", "),
    location: addressLines.slice(-2).join(", ") || null,
    phone,
    website: website ? new URL(website, organization.sourceUrl).toString() : null
  };
}

function offerings(kind: AuditorDirectoryKind) {
  if (kind === AuditorDirectoryKind.FLAG) return "Advanced auditing, Flag religious services, and religious retreat services.";
  if (kind === AuditorDirectoryKind.SH_AO) return "Advanced auditing, OT services, and Saint Hill training services.";
  return "Dianetics, introductory services, Grades, auditing, courses, and Sunday Service.";
}

async function fetchOrganization(organization: OfficialOrganization) {
  const response = await fetch(organization.sourceUrl, { headers: { "User-Agent": "Theta-Space official-directory-sync/1.0" } });
  if (!response.ok) throw new Error(`${response.status} loading ${organization.sourceUrl}`);
  return detailFromHtml(organization, await response.text());
}

async function main() {
  const locatorResponse = await fetch(LOCATOR_URL, { headers: { "User-Agent": "Theta-Space official-directory-sync/1.0" } });
  if (!locatorResponse.ok) throw new Error(`${locatorResponse.status} loading ${LOCATOR_URL}`);

  const organizations = [...classVOrganizations(await locatorResponse.text()), ...SPECIAL_ORGANIZATIONS];
  const details = (await Promise.all(organizations.map(fetchOrganization))).filter((entry): entry is ParsedOrganization => entry !== null);

  for (const entry of details) {
    await prisma.auditorProfile.upsert({
      where: { slug: entry.slug },
      update: {
        directoryKind: entry.kind,
        practiceName: entry.practiceName,
        location: entry.location,
        address: entry.address,
        offerings: offerings(entry.kind),
        phone: entry.phone,
        website: entry.website,
        sourceUrl: entry.sourceUrl,
        isOfficial: true,
        active: true
      },
      create: {
        slug: entry.slug,
        directoryKind: entry.kind,
        practiceName: entry.practiceName,
        location: entry.location,
        address: entry.address,
        offerings: offerings(entry.kind),
        phone: entry.phone,
        website: entry.website,
        sourceUrl: entry.sourceUrl,
        isOfficial: true,
        active: true
      }
    });
  }

  console.log(`Synchronized ${details.length} official service-directory cards from ${LOCATOR_URL}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
