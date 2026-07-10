import type { Metadata } from "next";
import {
  currentTermsSummary,
  readCurrentTermsText
} from "@/modules/legal/terms";

export const metadata: Metadata = {
  title: "Terms of Service | Theta-Space",
  description: "Theta-Space Terms of Service."
};

export default function TermsPage() {
  const terms = currentTermsSummary();
  const text = readCurrentTermsText();

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-8 text-[var(--text)]">
      <div className="mx-auto grid max-w-4xl gap-5">
        <section className="surface rounded-md p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Legal</p>
          <h1 className="mt-3 text-3xl font-semibold">{terms.title}</h1>
          <p className="mt-3 leading-7 text-[var(--muted)]">
            Effective {terms.effectiveDateLabel}. Review the full Terms here or download the PDF copy.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a className="btn-primary" download href={terms.pdfPath}>
              Download PDF
            </a>
            <a className="btn-secondary" href={terms.pdfPath} target="_blank" rel="noopener noreferrer">
              Open PDF
            </a>
          </div>
        </section>

        <article className="surface rounded-md p-6">
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[var(--text)]">{text}</pre>
        </article>
      </div>
    </main>
  );
}
