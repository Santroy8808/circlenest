import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { CURRENT_TERMS_VERSION } from "@/lib/security/terms";

function safeNext(raw: string | null | undefined) {
  if (!raw) return "/home";
  if (!raw.startsWith("/")) return "/home";
  return raw;
}

export default async function AcceptTermsPage({ searchParams }: { searchParams?: { next?: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { acceptedTermsVersion: true, acceptedTermsAt: true },
  });
  const nextPath = safeNext(searchParams?.next);

  if (user?.acceptedTermsVersion === CURRENT_TERMS_VERSION) {
    redirect(nextPath);
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <section className="card space-y-4 p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Required</p>
          <h1 className="text-2xl font-semibold text-[var(--text-strong)]">Accept terms and community rules</h1>
          <p className="mt-2 text-sm text-slate-300">Version {CURRENT_TERMS_VERSION}. You need to accept before continuing.</p>
        </div>
        <form
          action={async () => {
            "use server";
            const { auth } = await import("@/auth");
            const { prisma } = await import("@/lib/db/prisma");
            const current = await auth();
            if (!current?.user?.id) redirect("/login");
            await prisma.user.update({
              where: { id: current.user.id },
              data: {
                acceptedTermsVersion: CURRENT_TERMS_VERSION,
                acceptedTermsAt: new Date(),
              },
            });
            redirect(nextPath);
          }}
          className="space-y-3"
        >
          <label className="flex items-start gap-2 text-sm text-slate-200">
            <input type="checkbox" required className="mt-1" />
            <span>I agree to the current terms, privacy policy, and community rules.</span>
          </label>
          <button type="submit" className="rounded border border-amber-300/40 bg-[#8f7228] px-3 py-2 text-sm font-semibold text-black">
            Accept and continue
          </button>
        </form>
      </section>
    </main>
  );
}
