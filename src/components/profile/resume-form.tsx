"use client";

import { ProfileVisibility } from "@prisma/client";
import { useState, useTransition, type FormEvent } from "react";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import type { ResumeEducation, ResumeExperience, ResumeView } from "@/modules/profile-resume/types";

function listToText(items?: string[]) {
  return (items ?? []).join("\n");
}

function textToList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function experienceToText(items?: ResumeExperience[]) {
  return (items ?? [])
    .map((item) =>
      [
        [item.title, item.organization, item.location, item.dates].filter(Boolean).join(" | "),
        ...(item.bullets ?? []).map((bullet) => `- ${bullet}`)
      ]
        .filter(Boolean)
        .join("\n")
    )
    .filter(Boolean)
    .join("\n\n");
}

function textToExperience(value: string): ResumeExperience[] {
  return value
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [head, ...lines] = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const [title = "", organization = "", location = "", dates = ""] = (head ?? "").split("|").map((part) => part.trim());
      const bullets = lines.map((line) => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
      return { title, organization, location, dates, bullets };
    })
    .filter((item) => item.title || item.organization || item.bullets.length > 0);
}

function educationToText(items?: ResumeEducation[]) {
  return (items ?? [])
    .map((item) => [item.credential, item.institution, item.dates, item.details].filter(Boolean).join(" | "))
    .filter(Boolean)
    .join("\n");
}

function textToEducation(value: string): ResumeEducation[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [credential = "", institution = "", dates = "", details = ""] = line.split("|").map((part) => part.trim());
      return { credential, institution, dates, details };
    });
}

export function ResumeForm({ initialResume }: { initialResume: ResumeView | null }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resumeUrl, setResumeUrl] = useState(initialResume?.uploadedResumeUrl ?? "");
  const [resumeName, setResumeName] = useState(initialResume?.uploadedResumeName ?? "");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  function saveResume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMessage("");
    setError("");

    const payload = {
      headline: String(formData.get("headline") ?? ""),
      executiveSummary: String(formData.get("executiveSummary") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      location: String(formData.get("location") ?? ""),
      website: String(formData.get("website") ?? ""),
      coreSkills: textToList(String(formData.get("coreSkills") ?? "")),
      experience: textToExperience(String(formData.get("experience") ?? "")),
      education: textToEducation(String(formData.get("education") ?? "")),
      credentials: textToList(String(formData.get("credentials") ?? "")),
      achievements: textToList(String(formData.get("achievements") ?? "")),
      additionalNotes: String(formData.get("additionalNotes") ?? ""),
      includeScientology: formData.get("includeScientology") === "on",
      visibility: String(formData.get("visibility") ?? ProfileVisibility.MEMBERS),
      uploadedResumeUrl: resumeUrl,
      uploadedResumeName: resumeName
    };

    startTransition(async () => {
      const response = await fetch("/api/profile/resume", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(result.error ?? "Could not save resume.");
        return;
      }

      setMessage("Resume saved.");
    });
  }

  async function uploadResumeFile(file: File | null | undefined) {
    if (!file) return;

    setError("");
    setMessage("");
    setIsUploading(true);
    setUploadProgress(1);

    try {
      const intentResponse = await fetch("/api/profile/resume/upload-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size
        })
      });
      const intent = (await intentResponse.json()) as {
        error?: string;
        uploadUrl?: string;
        storageKey?: string;
      };

      if (!intentResponse.ok || !intent.uploadUrl || !intent.storageKey) {
        throw new Error(intent.error ?? "Could not prepare resume upload.");
      }

      await uploadWithResilientFallback({
        uploadUrl: intent.uploadUrl,
        storageKey: intent.storageKey,
        file,
        onProgress: setUploadProgress
      });

      const completeResponse = await fetch("/api/profile/resume/complete-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey: intent.storageKey,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size
        })
      });
      const complete = (await completeResponse.json()) as {
        error?: string;
        uploadedResumeUrl?: string;
        uploadedResumeName?: string;
      };

      if (!completeResponse.ok || !complete.uploadedResumeUrl) {
        throw new Error(complete.error ?? "Could not finish resume upload.");
      }

      setResumeUrl(complete.uploadedResumeUrl);
      setResumeName(complete.uploadedResumeName ?? file.name);
      setUploadProgress(100);
      setMessage("Resume file uploaded.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not upload resume.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form className="resume-editor grid gap-5" onSubmit={saveResume}>
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">My Resume</p>
        <h1 className="mt-3 text-3xl font-semibold">Executive resume builder</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Fill the sections once. Theta-Space renders a printable executive-style resume and can include your member-visible My Scientology summary as the final page.
        </p>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-xl font-semibold text-[var(--gold)]">Identity and headline</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Professional headline</span>
            <input className="form-field" name="headline" defaultValue={initialResume?.headline ?? ""} placeholder="Operations leader | Auditor | Consultant" />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Visibility</span>
            <select className="form-field" name="visibility" defaultValue={initialResume?.visibility ?? ProfileVisibility.MEMBERS}>
              <option value={ProfileVisibility.PRIVATE}>Private</option>
              <option value={ProfileVisibility.MEMBERS}>Members</option>
              <option value={ProfileVisibility.PUBLIC}>Public</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="form-label">Resume email</span>
            <input className="form-field" name="email" defaultValue={initialResume?.email ?? ""} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Phone</span>
            <input className="form-field" name="phone" defaultValue={initialResume?.phone ?? ""} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Location</span>
            <input className="form-field" name="location" defaultValue={initialResume?.location ?? ""} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Website or portfolio</span>
            <input className="form-field" name="website" defaultValue={initialResume?.website ?? ""} placeholder="https://..." />
          </label>
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-xl font-semibold text-[var(--gold)]">Executive summary</h2>
        <textarea
          className="form-field mt-4 min-h-36"
          name="executiveSummary"
          defaultValue={initialResume?.executiveSummary ?? ""}
          placeholder="3-5 strong sentences: scope, strengths, measurable impact, and professional direction."
        />
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-xl font-semibold text-[var(--gold)]">Core resume sections</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Core skills</span>
            <textarea className="form-field min-h-40" name="coreSkills" defaultValue={listToText(initialResume?.coreSkills)} placeholder="One skill per line, or comma-separated." />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Achievements</span>
            <textarea className="form-field min-h-40" name="achievements" defaultValue={listToText(initialResume?.achievements)} placeholder="Measurable wins, one per line." />
          </label>
          <label className="grid gap-2 lg:col-span-2">
            <span className="form-label">Experience</span>
            <textarea
              className="form-field min-h-56"
              name="experience"
              defaultValue={experienceToText(initialResume?.experience)}
              placeholder={"Title | Organization | Location | Dates\n- Bullet with measurable impact\n- Bullet with ownership and outcome\n\nNext Title | Organization | Location | Dates\n- Bullet"}
            />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Education</span>
            <textarea className="form-field min-h-32" name="education" defaultValue={educationToText(initialResume?.education)} placeholder="Credential | Institution | Dates | Notes" />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Credentials</span>
            <textarea className="form-field min-h-32" name="credentials" defaultValue={listToText(initialResume?.credentials)} placeholder="Certifications, licenses, awards." />
          </label>
        </div>
      </section>

      <section className="surface rounded-md p-5">
        <h2 className="text-xl font-semibold text-[var(--gold)]">Optional resume file and Scientology page</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Resume file</span>
            <input
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="form-field"
              disabled={isUploading}
              onChange={(event) => uploadResumeFile(event.target.files?.[0])}
              type="file"
            />
          </label>
          <div className="resume-upload-status">
            <span className="form-label">Current file</span>
            {resumeUrl ? (
              <a href={resumeUrl} rel="noreferrer" target="_blank">
                {resumeName || "Uploaded resume"}
              </a>
            ) : (
              <span className="text-sm text-[var(--muted)]">No file uploaded.</span>
            )}
            {isUploading ? <span className="text-sm text-[var(--gold)]">Uploading {uploadProgress}%</span> : null}
          </div>
        </div>
        <input name="uploadedResumeUrl" type="hidden" value={resumeUrl} />
        <input name="uploadedResumeName" type="hidden" value={resumeName} />
        <label className="mt-4 flex items-start gap-3 rounded-md border border-[var(--line)] bg-black/10 p-4">
          <input className="mt-1" name="includeScientology" type="checkbox" defaultChecked={initialResume?.includeScientology ?? false} />
          <span>
            <span className="form-label block">Include My Scientology as final page</span>
            <span className="text-sm text-[var(--muted)]">Only member-visible My Scientology data is shown.</span>
          </span>
        </label>
        <label className="mt-4 grid gap-2">
          <span className="form-label">Additional notes</span>
          <textarea className="form-field min-h-32" name="additionalNotes" defaultValue={initialResume?.additionalNotes ?? ""} />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={isPending} type="submit">
          {isPending ? "Saving..." : "Save resume"}
        </button>
        {message ? <span className="text-sm text-[var(--gold)]">{message}</span> : null}
        {error ? <span className="text-sm text-red-200">{error}</span> : null}
      </div>
    </form>
  );
}
