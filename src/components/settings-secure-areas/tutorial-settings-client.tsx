"use client";

import { tutorialSections, tutorialSteps } from "@/modules/tutorial/tutorial-content";

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
          Replay the guided walkthrough or jump directly to one section. The tutorial uses arrows and a floating description box to point at the control being described.
        </p>
        <button className="btn-primary mt-5" onClick={() => startTutorial({ stepId: tutorialSteps[0].id })} type="button">
          Start full tutorial
        </button>
      </section>
      <section className="surface rounded-md p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Table Of Contents</p>
            <h2 className="mt-2 text-2xl font-semibold">Jump to a section</h2>
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
      </section>
    </div>
  );
}
