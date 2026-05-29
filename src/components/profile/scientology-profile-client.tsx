"use client";

import { useState } from "react";

export type ScientologyInitial = {
  trainingLevel: string;
  caseLevel: string;
  successStory: string;
  achievements: string;
  goals: string;
  projects: string;
  visible: boolean;
};

export function ScientologyProfileClient({ initial }: { initial: ScientologyInitial }) {
  const [status, setStatus] = useState("");
  const [visible, setVisible] = useState(initial.visible);

  return (
    <div className="card p-3">
      <h1 className="text-lg font-semibold text-[var(--text-strong)]">My Scientology</h1>
      <p className="mb-3 mt-1 text-xs text-slate-300">
        Share your training and case progress, wins, and current goals. You can keep this private or make it visible on your public profile.
      </p>

      <form
        className="grid gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setStatus("Saving...");
          const form = new FormData(event.currentTarget);
          const payload = {
            trainingLevel: String(form.get("trainingLevel") ?? ""),
            caseLevel: String(form.get("caseLevel") ?? ""),
            successStory: String(form.get("successStory") ?? ""),
            achievements: String(form.get("achievements") ?? ""),
            goals: String(form.get("goals") ?? ""),
            projects: String(form.get("projects") ?? ""),
            visible,
          };
          const response = await fetch("/api/profile/scientology", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          setStatus(response.ok ? "Saved." : "Could not save.");
        }}
      >
        <div className="grid gap-2 md:grid-cols-2">
          <input name="trainingLevel" defaultValue={initial.trainingLevel} placeholder="Training level" className="rounded-md border px-2 py-1.5 text-sm" />
          <input name="caseLevel" defaultValue={initial.caseLevel} placeholder="Case level" className="rounded-md border px-2 py-1.5 text-sm" />
        </div>
        <textarea name="successStory" defaultValue={initial.successStory} placeholder="Success story" rows={4} className="rounded-md border px-2 py-1.5 text-sm" />
        <textarea name="achievements" defaultValue={initial.achievements} placeholder="Achievements" rows={3} className="rounded-md border px-2 py-1.5 text-sm" />
        <textarea name="goals" defaultValue={initial.goals} placeholder="Goals" rows={3} className="rounded-md border px-2 py-1.5 text-sm" />
        <textarea name="projects" defaultValue={initial.projects} placeholder="Projects" rows={3} className="rounded-md border px-2 py-1.5 text-sm" />

        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
          <span>Make this page visible on my public profile</span>
        </label>

        <button type="submit" className="w-fit rounded-md border border-[var(--border)] bg-[#8f7228] px-3 py-1.5 text-sm text-black">
          Save Scientology Page
        </button>
        {status ? <p className="text-xs text-slate-300">{status}</p> : null}
      </form>
    </div>
  );
}

