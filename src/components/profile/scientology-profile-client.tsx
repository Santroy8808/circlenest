"use client";

import { useState } from "react";
import {
  SCIENTOLOGY_ADDITIONAL_COURSES,
  SCIENTOLOGY_PROCESSING_LEVELS,
  SCIENTOLOGY_TRAINING_LEVELS,
} from "@/lib/profile/scientology";

export type ScientologyInitial = {
  trainingLevel: string;
  processingLevel: string;
  additionalCourses: string[];
  visible: boolean;
  includeOnResume: boolean;
};

export function ScientologyProfileClient({ initial }: { initial: ScientologyInitial }) {
  const [status, setStatus] = useState("");
  const [visible, setVisible] = useState(initial.visible);
  const [includeOnResume, setIncludeOnResume] = useState(initial.includeOnResume);
  const [selectedCourses, setSelectedCourses] = useState<string[]>(initial.additionalCourses);

  function toggleCourse(course: string) {
    setSelectedCourses((previous) =>
      previous.includes(course) ? previous.filter((item) => item !== course) : [...previous, course],
    );
  }

  return (
    <div className="card p-3">
      <h1 className="text-lg font-semibold text-[var(--text-strong)]">My Scientology</h1>
      <p className="mb-3 mt-1 text-xs text-slate-300">
        Choose one main training level, one main processing level, then mark any additional completed courses or qualifications.
      </p>

      <form
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setStatus("Saving...");
          const form = new FormData(event.currentTarget);
          const payload = {
            trainingLevel: String(form.get("trainingLevel") ?? ""),
            processingLevel: String(form.get("processingLevel") ?? ""),
            additionalCourses: selectedCourses,
            visible,
            includeOnResume,
          };
          const response = await fetch("/api/profile/scientology", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          setStatus(response.ok ? "Saved." : "Could not save.");
        }}
      >
        <div className="grid gap-3 md:grid-cols-2 md:items-start">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--text-strong)]">Training Level</span>
            <select
              name="trainingLevel"
              defaultValue={initial.trainingLevel}
              className="min-w-0 rounded-md border px-2 py-1.5 text-sm"
            >
              <option value="">Not listed / prefer not to say</option>
              {SCIENTOLOGY_TRAINING_LEVELS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--text-strong)]">Processing Level</span>
            <select
              name="processingLevel"
              defaultValue={initial.processingLevel}
              className="min-w-0 rounded-md border px-2 py-1.5 text-sm"
            >
              <option value="">Not listed / prefer not to say</option>
              {SCIENTOLOGY_PROCESSING_LEVELS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <section className="rounded-md border border-[var(--border)] p-3">
          <h2 className="mb-2 text-sm font-semibold text-[var(--text-strong)]">Additional courses and qualifications</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {SCIENTOLOGY_ADDITIONAL_COURSES.map((course) => (
              <label key={course} className="inline-flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedCourses.includes(course)}
                  onChange={() => toggleCourse(course)}
                />
                <span>{course}</span>
              </label>
            ))}
          </div>
        </section>

        <div className="grid gap-3">
          <fieldset className="rounded-md border border-[var(--border)] p-2 text-sm">
            <legend className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-strong)]">My Scientology Visibility</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="scientology-visibility" checked={visible} onChange={() => setVisible(true)} />
                <span>Public</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="scientology-visibility" checked={!visible} onChange={() => setVisible(false)} />
                <span>Private</span>
              </label>
            </div>
          </fieldset>

          <fieldset className="rounded-md border border-[var(--border)] p-2 text-sm">
            <legend className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-strong)]">Show On Resume</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="scientology-resume-visibility" checked={includeOnResume} onChange={() => setIncludeOnResume(true)} />
                <span>Public</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="scientology-resume-visibility" checked={!includeOnResume} onChange={() => setIncludeOnResume(false)} />
                <span>Private</span>
              </label>
            </div>
          </fieldset>
        </div>

        <button type="submit" className="w-fit rounded-md border border-[var(--border)] bg-[#8f7228] px-3 py-1.5 text-sm text-black">
          Save My Scientology
        </button>
        {status ? <p className="text-xs text-slate-300">{status}</p> : null}
      </form>
    </div>
  );
}
