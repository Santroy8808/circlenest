import Link from "next/link";

export function ScientologyReferenceNotice({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      aria-label="Independent Scientology reference and trademark notice"
      className={`surface rounded-md border border-[var(--line)] ${compact ? "p-4" : "p-5"}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
        Independent reference notice
      </p>
      <div className="mt-3 grid gap-3 text-sm leading-6 text-[var(--muted)]">
        <p>
          Theta-Space is an independent community platform. It is not affiliated with, sponsored, endorsed,
          operated, or controlled by the Church of Scientology International, Religious Technology Center,
          or any affiliated Scientology church or organization.
        </p>
        <p>
          SCIENTOLOGY, DIANETICS, THE BRIDGE, and certain Grade Chart terms referenced here are trademarks
          or service marks of Religious Technology Center or their respective owners. Theta-Space uses these
          words only as plain-text references to member-reported training, processing, services, and
          affiliations. Theta-Space does not use Church or Scientology symbols.
        </p>
        <p>
          Theta-Space and participating members voluntarily seek to respect the applicable standards associated
          with these references. Theta-Space is not an official source of Scientology doctrine or terminology.
          Any typo, transcription error, or incorrect terminology is unintended. Please{" "}
          <Link className="text-[var(--gold)] underline underline-offset-4" href="/settings/feedback">
            report it through Feedback
          </Link>{" "}
          so it can be reviewed and corrected.
        </p>
      </div>
      <a
        className="mt-3 inline-flex text-xs text-[var(--muted)] underline underline-offset-4"
        href="https://www.scientology.org/tmnotice.html"
        rel="noreferrer"
        target="_blank"
      >
        Official trademark ownership reference
      </a>
    </aside>
  );
}
