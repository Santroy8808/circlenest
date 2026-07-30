"use client";

import Link from "next/link";
import {
  tutorialIconDefinitions,
  tutorialSections,
  tutorialSteps
} from "@/modules/tutorial/tutorial-content";

function startTutorial(detail?: { sectionId?: string; stepId?: string }) {
  window.dispatchEvent(new CustomEvent("theta:tutorial:start", { detail }));
}

export function TutorialSettingsClient() {
  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Tutorial</p>
        <h1 className="mt-3 text-3xl font-semibold">Theta-Space walkthrough</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
          Replay the guided walkthrough, jump directly to one section, or open the complete Users Manual for detailed feature guides.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="btn-primary" onClick={() => startTutorial({ stepId: tutorialSteps[0].id })} type="button">
            Start full tutorial
          </button>
          <Link className="btn-secondary" href="/settings/users-manual">
            Open Users Manual
          </Link>
        </div>
      </section>
      <section className="surface rounded-md p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Icon Reference</p>
        <h2 className="mt-2 text-2xl font-semibold">What each icon does</h2>
        <p className="mt-3 max-w-2xl leading-6 text-[var(--muted)]">
          Hover or focus an icon anywhere on Theta-Space for a short tooltip. This reference keeps the common navigation and stream controls in one place.
        </p>
        <div className="tutorial-icon-reference mt-5">
          {tutorialIconDefinitions.map((definition) => (
            <article className="tutorial-icon-reference-item" key={definition.id}>
              <span className="tutorial-icon-reference-glyph" aria-hidden="true">
                {definition.iconSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={definition.iconSrc} />
                ) : (
                  definition.glyph
                )}
              </span>
              <span>
                <strong>{definition.label}</strong>
                <small>{definition.description}</small>
              </span>
            </article>
          ))}
        </div>
      </section>
      <section className="surface rounded-md p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Table Of Contents</p>
            <h2 className="mt-2 text-2xl font-semibold">Tutorials and user guides</h2>
          </div>
        </div>
        <div className="tutorial-settings-grid mt-5">
          {tutorialSections.map((section) => (
            <article className="module-card rounded-md p-5" key={section.id}>
              <h3 className="text-xl font-semibold text-[var(--gold)]">{section.title}</h3>
              <p className="mt-3 leading-6 text-[var(--muted)]">{section.description}</p>
              <button className="btn-secondary mt-4" onClick={() => startTutorial({ sectionId: section.id })} type="button">
                Start here
              </button>
            </article>
          ))}
        </div>
        <div className="mt-5 border-t border-[var(--border)] pt-5">
          <h3 className="text-xl font-semibold text-[var(--gold)]">Complete Users Manual</h3>
          <p className="mt-3 max-w-2xl leading-6 text-[var(--muted)]">
            Browse definitions, account-tier guidance, feature instructions, limits, and answers to common questions.
          </p>
          <Link className="btn-secondary mt-4 inline-flex" href="/settings/users-manual">
            Browse all guides
          </Link>
        </div>
      </section>
    </div>
  );
}
