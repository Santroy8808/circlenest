"use client";

import { ScientologyClassification, ScientologyVisibility, type MediaAsset, type ScientologyCommendation, type ScientologyProfile } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  scientologyAdditionalProcessingServices,
  scientologyCourseCompletions,
  scientologyIntroServices,
  scientologyOtherTechnicalCourses,
  scientologyProcessingStatuses,
  scientologyTechnicalSpecialistCourses,
  scientologyTrainingLevels,
  parseScientologySelections
} from "@/modules/my-scientology/types";

type ScientologyProfileWithCommendations =
  | (ScientologyProfile & {
      commendations: Array<ScientologyCommendation & { mediaAsset: MediaAsset }>;
    })
  | null;

type SelectionKey = "courseCompletions" | "introServices" | "technicalCourses" | "specialistCourses" | "additionalProcessing";

function CheckboxGroup({
  title,
  items,
  name,
  selected
}: {
  title: string;
  items: readonly string[];
  name: SelectionKey;
  selected: string[];
}) {
  return (
    <fieldset className="rounded-md border border-[var(--line)] bg-black/10 p-4">
      <legend className="px-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">{title}</legend>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <label className="flex items-start gap-3 text-sm text-[var(--muted)]" key={item}>
            <input className="mt-1" defaultChecked={selected.includes(item)} name={name} type="checkbox" value={item} />
            <span>{item}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

async function isPdfEncryptedOrInteractive(file: File) {
  if (file.type !== "application/pdf") return false;
  const bytes = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer();
  const text = new TextDecoder("latin1").decode(bytes);
  return /\/Encrypt\b|\/AcroForm\b|\/XFA\b/.test(text);
}

export function ScientologyProfileForm({ profile }: { profile: ScientologyProfileWithCommendations }) {
  const router = useRouter();
  const selections = useMemo(() => parseScientologySelections(profile), [profile]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);

  function checkedValues(formData: FormData, key: SelectionKey) {
    return formData.getAll(key).filter((value): value is string => typeof value === "string");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const response = await fetch("/api/profile/scientology", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classification: formData.get("classification"),
          orgName: formData.get("orgName"),
          lastServiceName: formData.get("lastServiceName"),
          lastServiceAt: formData.get("lastServiceAt"),
          iasMembershipLast6: formData.get("iasMembershipLast6"),
          trainingLevel: formData.get("trainingLevel"),
          processingStatus: formData.get("processingStatus"),
          courseCompletions: checkedValues(formData, "courseCompletions"),
          introServices: checkedValues(formData, "introServices"),
          technicalCourses: checkedValues(formData, "technicalCourses"),
          specialistCourses: checkedValues(formData, "specialistCourses"),
          additionalProcessing: checkedValues(formData, "additionalProcessing"),
          goodStandingAttested: formData.get("goodStandingAttested") === "on",
          educationNotes: formData.get("educationNotes"),
          visibility: formData.get("visibility")
        })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not update My Scientology.");
        return;
      }

      setMessage("My Scientology updated.");
      router.refresh();
    });
  }

  async function uploadCommendation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadError("");
    setUploadMessage("");
    const formData = new FormData(event.currentTarget);
    const file = formData.get("commendationFile");
    const title = typeof formData.get("commendationTitle") === "string" ? String(formData.get("commendationTitle")) : "";

    if (!(file instanceof File) || file.size === 0) {
      setUploadError("Choose an image or flattened PDF commendation.");
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
      setUploadError("Commendations must be JPG, PNG, WEBP, or flattened PDF.");
      return;
    }

    if (file.type === "application/pdf" && (await isPdfEncryptedOrInteractive(file))) {
      setUploadError("PDF commendations must be flattened and cannot be encrypted or form-based PDFs.");
      return;
    }

    setIsUploading(true);

    try {
      const intentResponse = await fetch("/api/profile/scientology/commendations/upload-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size
        })
      });
      const intent = (await intentResponse.json()) as { error?: string; uploadUrl?: string; storageKey?: string };

      if (!intentResponse.ok || !intent.uploadUrl || !intent.storageKey) {
        throw new Error(intent.error ?? "Could not prepare upload.");
      }

      const uploadResponse = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file
      });

      if (!uploadResponse.ok) {
        throw new Error("Could not upload commendation to storage.");
      }

      const completeResponse = await fetch("/api/profile/scientology/commendations/complete-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey: intent.storageKey,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          title,
          isFlattenedPdf: file.type === "application/pdf"
        })
      });
      const complete = (await completeResponse.json()) as { error?: string };

      if (!completeResponse.ok) {
        throw new Error(complete.error ?? "Could not save commendation.");
      }

      setUploadMessage("Commendation uploaded.");
      router.refresh();
      event.currentTarget.reset();
    } catch (uploadIssue) {
      setUploadError(uploadIssue instanceof Error ? uploadIssue.message : "Could not upload commendation.");
    } finally {
      setIsUploading(false);
    }
  }

  const lastServiceDate = profile?.lastServiceAt ? profile.lastServiceAt.toISOString().slice(0, 10) : "";

  return (
    <div className="grid gap-5">
      <form className="surface grid gap-5 rounded-md p-5" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Classification</span>
            <select className="form-field" name="classification" defaultValue={profile?.classification ?? ScientologyClassification.PUBLIC}>
              <option value={ScientologyClassification.PUBLIC}>Public</option>
              <option value={ScientologyClassification.STAFF}>Staff</option>
              <option value={ScientologyClassification.SEA_ORG}>Sea Org</option>
              <option value={ScientologyClassification.AUDITOR}>Auditor</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="form-label">Current org</span>
            <input className="form-field" name="orgName" defaultValue={profile?.orgName ?? ""} />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Last service</span>
            <input className="form-field" name="lastServiceName" defaultValue={profile?.lastServiceName ?? ""} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Last service date</span>
            <input className="form-field" name="lastServiceAt" type="date" defaultValue={lastServiceDate} />
          </label>
        </div>
        <label className="grid gap-2">
          <span className="form-label">Last 6 of IAS membership number, optional</span>
          <input
            className="form-field"
            name="iasMembershipLast6"
            inputMode="numeric"
            maxLength={6}
            pattern="[0-9]{6}"
            placeholder="123456"
            defaultValue={profile?.iasMembershipLast6 ?? ""}
          />
        </label>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="grid gap-4">
            <div className="rounded-md border border-[var(--line)] bg-black/10 p-4">
              <label className="grid gap-2">
                <span className="form-label">Training level</span>
                <select className="form-field" name="trainingLevel" defaultValue={profile?.trainingLevel ?? ""}>
                  {scientologyTrainingLevels.map((level) => (
                    <option key={level || "not-listed"} value={level}>
                      {level || "Not listed"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <CheckboxGroup items={scientologyCourseCompletions} name="courseCompletions" selected={selections.courseCompletions} title="Courses / Specialty Training" />
            <CheckboxGroup items={scientologyOtherTechnicalCourses} name="technicalCourses" selected={selections.technicalCourses} title="Other Technical Courses" />
            <CheckboxGroup items={scientologyTechnicalSpecialistCourses} name="specialistCourses" selected={selections.specialistCourses} title="Technical Specialist Courses" />
            <CheckboxGroup items={scientologyIntroServices} name="introServices" selected={selections.introServices} title="Introductory Services" />
          </section>

          <section className="grid gap-4">
            <div className="rounded-md border border-[var(--line)] bg-black/10 p-4">
              <label className="grid gap-2">
                <span className="form-label">Processing / Rundowns</span>
                <select className="form-field" name="processingStatus" defaultValue={profile?.processingStatus ?? ""}>
                  {scientologyProcessingStatuses.map((status) => (
                    <option key={status || "not-listed"} value={status}>
                      {status || "Not listed"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <CheckboxGroup items={scientologyAdditionalProcessingServices} name="additionalProcessing" selected={selections.additionalProcessing} title="Additional Processing Services" />
          </section>
        </div>

        <label className="grid gap-2">
          <span className="form-label">Education notes</span>
          <textarea className="form-field min-h-36 resize-y" name="educationNotes" defaultValue={profile?.educationNotes ?? ""} />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Visibility</span>
            <select className="form-field" name="visibility" defaultValue={profile?.visibility ?? ScientologyVisibility.PRIVATE}>
              <option value={ScientologyVisibility.PRIVATE}>Private</option>
              <option value={ScientologyVisibility.MEMBERS}>Members can see summary</option>
            </select>
          </label>
          <div className="grid gap-3 rounded-md border border-[var(--line)] p-4">
            <label className="flex items-start gap-3 text-sm text-[var(--muted)]">
              <input name="goodStandingAttested" type="checkbox" defaultChecked={profile?.goodStandingAttested ?? false} />
              <span>I attest that I am currently active and in good standing.</span>
            </label>
          </div>
        </div>
        {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
        {message ? <p className="rounded-md border border-green-400/40 bg-green-950/30 p-3 text-sm text-green-100">{message}</p> : null}
        <button className="btn-primary" disabled={isPending} type="submit">
          {isPending ? "Saving..." : "Save My Scientology"}
        </button>
      </form>

      <section className="surface rounded-md p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Commendations</p>
        <h2 className="mt-3 text-2xl font-semibold">Upload commendations</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Upload visible commendation images or flattened PDFs. PDFs must not be encrypted, encoded forms, or interactive PDFs.
        </p>
        <form className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={uploadCommendation}>
          <label className="grid gap-2">
            <span className="form-label">Title</span>
            <input className="form-field" name="commendationTitle" placeholder="Optional title" />
          </label>
          <label className="grid gap-2">
            <span className="form-label">File</span>
            <input accept="image/jpeg,image/png,image/webp,application/pdf" className="form-field" name="commendationFile" type="file" />
          </label>
          <button className="btn-primary self-end" disabled={isUploading} type="submit">
            {isUploading ? "Uploading..." : "Upload"}
          </button>
        </form>
        {uploadError ? <p className="mt-4 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{uploadError}</p> : null}
        {uploadMessage ? <p className="mt-4 rounded-md border border-green-400/40 bg-green-950/30 p-3 text-sm text-green-100">{uploadMessage}</p> : null}
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {profile?.commendations?.length ? (
            profile.commendations.map((commendation) => (
              <article className="rounded-md border border-[var(--line)] bg-black/10 p-4" key={commendation.id}>
                <p className="font-semibold text-[var(--gold)]">{commendation.title ?? commendation.mediaAsset.originalName ?? "Commendation"}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {commendation.mediaAsset.mimeType} - {new Date(commendation.createdAt).toLocaleDateString()}
                </p>
                {commendation.mediaAsset.publicUrl ? (
                  <a className="mt-3 inline-flex text-sm text-[var(--gold)] underline" href={commendation.mediaAsset.publicUrl} rel="noreferrer" target="_blank">
                    View file
                  </a>
                ) : null}
              </article>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)] md:col-span-2">No commendations uploaded yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
