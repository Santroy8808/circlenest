import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-5xl p-6 md:p-10">
      <section className="card overflow-hidden">
        <div className="grid gap-0 md:grid-cols-2">
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-8 text-white">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-300">CircleNest</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight">Friendly social spaces with user-controlled feeds.</h1>
            <p className="mt-4 text-slate-200">Profiles, groups, events, messages, and community-first discovery without opaque ranking tricks.</p>
          </div>
          <div className="p-8">
            <h2 className="text-2xl font-semibold text-slate-900">Jump In</h2>
            <p className="mt-2 text-slate-600">Start with the Drakudai default look, then personalize from settings anytime.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="rounded-lg bg-slate-900 px-4 py-2 text-white" href="/signup">
            Get Started
              </Link>
              <Link className="rounded-lg border border-slate-300 px-4 py-2" href="/login">
            Log In
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
