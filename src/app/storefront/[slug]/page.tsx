import Link from "next/link";
import { notFound } from "next/navigation";
import { BusinessStorefront } from "@/components/business-storefront/business-storefront";
import { safeGetPublicBusinessProfile } from "@/modules/business-storefront/business-storefront.service";

export default async function StorefrontPage({ params }: { params: { slug: string } }) {
  const result = await safeGetPublicBusinessProfile(params.slug);

  if (!result.ok) {
    notFound();
  }

  return (
    <main className="main-surface mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link className="text-sm font-semibold text-[var(--gold)]" href="/">
          Theta-Space
        </Link>
        <Link className="btn-secondary" href="/login">
          Member login
        </Link>
      </div>
      <BusinessStorefront profile={result.profile} />
    </main>
  );
}
