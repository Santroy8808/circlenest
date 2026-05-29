"use client";

import { useMemo, useState } from "react";
import { type ResumeData, type ResumeEntry, type ResumeProject, sanitizeResumeData } from "@/lib/profile/resume";

type ResumeBuilderInitial = {
  data: ResumeData;
  visible: boolean;
};

function cloneEntry(): ResumeEntry {
  return { organization: "", title: "", startDate: "", endDate: "", details: "" };
}

function cloneProject(): ResumeProject {
  return { name: "", role: "", url: "", details: "" };
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function resumeToPrintableHtml(data: ResumeData): string {
  const basicsLine = [data.basics.email, data.basics.phone, data.basics.location, data.basics.website].filter(Boolean).join(" | ");
  const section = (title: string, body: string) =>
    body ? `<section><h2>${escapeHtml(title)}</h2>${body}</section>` : "";
  const rows = (items: ResumeEntry[]) =>
    items
      .filter((item) => Object.values(item).some(Boolean))
      .map(
        (item) =>
          `<article><header><strong>${escapeHtml(item.title || item.organization || "")}</strong><span>${escapeHtml(
            [item.startDate, item.endDate].filter(Boolean).join(" - "),
          )}</span></header><p class="org">${escapeHtml(item.organization)}</p><p>${escapeHtml(item.details)}</p></article>`,
      )
      .join("");
  const projects = data.projects
    .filter((item) => Object.values(item).some(Boolean))
    .map(
      (item) =>
        `<article><header><strong>${escapeHtml(item.name || "")}</strong><span>${escapeHtml(item.role || "")}</span></header><p class="org">${escapeHtml(
          item.url,
        )}</p><p>${escapeHtml(item.details)}</p></article>`,
    )
    .join("");
  const skills = data.skills.length ? `<p>${escapeHtml(data.skills.join(", "))}</p>` : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Resume Export</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; color: #101218; margin: 0; padding: 36px; line-height: 1.35; }
    h1 { margin: 0; font-size: 28px; }
    .headline { margin: 4px 0 10px; font-size: 15px; color: #2b3345; }
    .basics { margin: 0 0 18px; color: #44506a; font-size: 13px; }
    h2 { margin: 20px 0 8px; font-size: 16px; border-bottom: 1px solid #d6dceb; padding-bottom: 4px; }
    article { margin: 0 0 12px; }
    header { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
    .org { margin: 2px 0 4px; color: #2b3345; font-size: 13px; }
    p { margin: 0; font-size: 12px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>${escapeHtml(data.basics.fullName || "Resume")}</h1>
  <p class="headline">${escapeHtml(data.basics.headline)}</p>
  <p class="basics">${escapeHtml(basicsLine)}</p>
  ${section("Professional Summary", data.summary ? `<p>${escapeHtml(data.summary)}</p>` : "")}
  ${section("Experience", rows(data.experience))}
  ${section("Education", rows(data.education))}
  ${section("Projects", projects)}
  ${section("Skills", skills)}
</body>
</html>`;
}

export function ResumeBuilderClient({ initial }: { initial: ResumeBuilderInitial }) {
  const [resume, setResume] = useState<ResumeData>(initial.data);
  const [visible, setVisible] = useState(initial.visible);
  const [skillsInput, setSkillsInput] = useState(initial.data.skills.join(", "));
  const [status, setStatus] = useState("");

  const templateLabel = useMemo(() => "JSON Resume compatible format (free/open template style)", []);

  function updateBasics<K extends keyof ResumeData["basics"]>(key: K, value: string) {
    setResume((prev) => ({ ...prev, basics: { ...prev.basics, [key]: value } }));
  }

  function updateEntry(section: "experience" | "education", index: number, key: keyof ResumeEntry, value: string) {
    setResume((prev) => {
      const rows = [...prev[section]];
      rows[index] = { ...rows[index], [key]: value };
      return { ...prev, [section]: rows };
    });
  }

  function updateProject(index: number, key: keyof ResumeProject, value: string) {
    setResume((prev) => {
      const rows = [...prev.projects];
      rows[index] = { ...rows[index], [key]: value };
      return { ...prev, projects: rows };
    });
  }

  function addEntry(section: "experience" | "education") {
    setResume((prev) => ({ ...prev, [section]: [...prev[section], cloneEntry()] }));
  }

  function removeEntry(section: "experience" | "education", index: number) {
    setResume((prev) => {
      const rows = prev[section].filter((_, idx) => idx !== index);
      return { ...prev, [section]: rows.length > 0 ? rows : [cloneEntry()] };
    });
  }

  function addProject() {
    setResume((prev) => ({ ...prev, projects: [...prev.projects, cloneProject()] }));
  }

  function removeProject(index: number) {
    setResume((prev) => {
      const rows = prev.projects.filter((_, idx) => idx !== index);
      return { ...prev, projects: rows.length > 0 ? rows : [cloneProject()] };
    });
  }

  function buildPayload(): { resume: ResumeData; visible: boolean } {
    const raw = { ...resume, skills: skillsInput.split(",").map((item) => item.trim()).filter(Boolean) };
    return { resume: sanitizeResumeData(raw), visible };
  }

  function downloadJson() {
    const payload = buildPayload();
    const blob = new Blob([JSON.stringify(payload.resume, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "resume-data.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const payload = buildPayload();
    const html = resumeToPrintableHtml(payload.resume);
    const popup = window.open("", "_blank", "width=1000,height=1200");
    if (!popup) {
      setStatus("Allow popups to export PDF.");
      return;
    }
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  return (
    <div className="card p-3">
      <h1 className="text-lg font-semibold text-[var(--text-strong)]">Resume</h1>
      <p className="mb-2 mt-1 text-xs text-slate-300">
        Build a professional resume, choose visibility, then export to PDF. Template style: {templateLabel}.{" "}
        <a href="https://registry.jsonresume.org/themes" target="_blank" rel="noreferrer" className="underline">
          Free template source
        </a>
        .
      </p>

      <form
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setStatus("Saving...");
          const payload = buildPayload();
          const response = await fetch("/api/profile/resume", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          setStatus(response.ok ? "Saved." : "Could not save.");
        }}
      >
        <section className="grid gap-2 md:grid-cols-2">
          <input value={resume.basics.fullName} onChange={(event) => updateBasics("fullName", event.target.value)} placeholder="Full name" className="rounded-md border px-2 py-1.5 text-sm" />
          <input value={resume.basics.headline} onChange={(event) => updateBasics("headline", event.target.value)} placeholder="Professional headline" className="rounded-md border px-2 py-1.5 text-sm" />
          <input value={resume.basics.email} onChange={(event) => updateBasics("email", event.target.value)} placeholder="Email" className="rounded-md border px-2 py-1.5 text-sm" />
          <input value={resume.basics.phone} onChange={(event) => updateBasics("phone", event.target.value)} placeholder="Phone" className="rounded-md border px-2 py-1.5 text-sm" />
          <input value={resume.basics.location} onChange={(event) => updateBasics("location", event.target.value)} placeholder="City / state / country" className="rounded-md border px-2 py-1.5 text-sm" />
          <input value={resume.basics.website} onChange={(event) => updateBasics("website", event.target.value)} placeholder="Website or portfolio link" className="rounded-md border px-2 py-1.5 text-sm" />
        </section>

        <textarea value={resume.summary} onChange={(event) => setResume((prev) => ({ ...prev, summary: event.target.value }))} placeholder="Professional summary" rows={4} className="rounded-md border px-2 py-1.5 text-sm" />

        <section className="rounded-md border border-[var(--border)] p-2">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--text-strong)]">Experience</p>
            <button type="button" className="text-xs underline" onClick={() => addEntry("experience")}>Add role</button>
          </div>
          <div className="space-y-2">
            {resume.experience.map((row, index) => (
              <div key={`experience-${index}`} className="rounded-md border border-[var(--border)] p-2">
                <div className="grid gap-2 md:grid-cols-2">
                  <input value={row.organization} onChange={(event) => updateEntry("experience", index, "organization", event.target.value)} placeholder="Company / organization" className="rounded-md border px-2 py-1.5 text-sm" />
                  <input value={row.title} onChange={(event) => updateEntry("experience", index, "title", event.target.value)} placeholder="Role / title" className="rounded-md border px-2 py-1.5 text-sm" />
                  <input value={row.startDate} onChange={(event) => updateEntry("experience", index, "startDate", event.target.value)} placeholder="Start (month year)" className="rounded-md border px-2 py-1.5 text-sm" />
                  <input value={row.endDate} onChange={(event) => updateEntry("experience", index, "endDate", event.target.value)} placeholder="End (or Present)" className="rounded-md border px-2 py-1.5 text-sm" />
                </div>
                <textarea value={row.details} onChange={(event) => updateEntry("experience", index, "details", event.target.value)} placeholder="What you achieved" rows={3} className="mt-2 w-full rounded-md border px-2 py-1.5 text-sm" />
                <button type="button" className="mt-1 text-xs underline" onClick={() => removeEntry("experience", index)}>Remove</button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-[var(--border)] p-2">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--text-strong)]">Education</p>
            <button type="button" className="text-xs underline" onClick={() => addEntry("education")}>Add education</button>
          </div>
          <div className="space-y-2">
            {resume.education.map((row, index) => (
              <div key={`education-${index}`} className="rounded-md border border-[var(--border)] p-2">
                <div className="grid gap-2 md:grid-cols-2">
                  <input value={row.organization} onChange={(event) => updateEntry("education", index, "organization", event.target.value)} placeholder="School / institution" className="rounded-md border px-2 py-1.5 text-sm" />
                  <input value={row.title} onChange={(event) => updateEntry("education", index, "title", event.target.value)} placeholder="Program / degree" className="rounded-md border px-2 py-1.5 text-sm" />
                  <input value={row.startDate} onChange={(event) => updateEntry("education", index, "startDate", event.target.value)} placeholder="Start (month year)" className="rounded-md border px-2 py-1.5 text-sm" />
                  <input value={row.endDate} onChange={(event) => updateEntry("education", index, "endDate", event.target.value)} placeholder="End (month year)" className="rounded-md border px-2 py-1.5 text-sm" />
                </div>
                <textarea value={row.details} onChange={(event) => updateEntry("education", index, "details", event.target.value)} placeholder="Highlights / notes" rows={3} className="mt-2 w-full rounded-md border px-2 py-1.5 text-sm" />
                <button type="button" className="mt-1 text-xs underline" onClick={() => removeEntry("education", index)}>Remove</button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-[var(--border)] p-2">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--text-strong)]">Projects</p>
            <button type="button" className="text-xs underline" onClick={addProject}>Add project</button>
          </div>
          <div className="space-y-2">
            {resume.projects.map((row, index) => (
              <div key={`project-${index}`} className="rounded-md border border-[var(--border)] p-2">
                <div className="grid gap-2 md:grid-cols-2">
                  <input value={row.name} onChange={(event) => updateProject(index, "name", event.target.value)} placeholder="Project name" className="rounded-md border px-2 py-1.5 text-sm" />
                  <input value={row.role} onChange={(event) => updateProject(index, "role", event.target.value)} placeholder="Your role" className="rounded-md border px-2 py-1.5 text-sm" />
                </div>
                <input value={row.url} onChange={(event) => updateProject(index, "url", event.target.value)} placeholder="Project URL (optional)" className="mt-2 w-full rounded-md border px-2 py-1.5 text-sm" />
                <textarea value={row.details} onChange={(event) => updateProject(index, "details", event.target.value)} placeholder="Project description" rows={3} className="mt-2 w-full rounded-md border px-2 py-1.5 text-sm" />
                <button type="button" className="mt-1 text-xs underline" onClick={() => removeProject(index)}>Remove</button>
              </div>
            ))}
          </div>
        </section>

        <textarea value={skillsInput} onChange={(event) => setSkillsInput(event.target.value)} placeholder="Skills (comma separated)" rows={2} className="rounded-md border px-2 py-1.5 text-sm" />

        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
          <span>Make this resume visible on my public profile</span>
        </label>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="rounded-md border border-[var(--border)] bg-[#8f7228] px-3 py-1.5 text-sm text-black">
            Save Resume
          </button>
          <button type="button" className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm" onClick={downloadJson}>
            Download Form (JSON)
          </button>
          <button type="button" className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm" onClick={exportPdf}>
            Export to PDF
          </button>
        </div>
        {status ? <p className="text-xs text-slate-300">{status}</p> : null}
      </form>
    </div>
  );
}
