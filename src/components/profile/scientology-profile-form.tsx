"use client";

import { ScientologyClassification, ScientologyVisibility, type ScientologyProfile } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  scientologyProcessingStatuses,
  scientologyTrainingLevels
} from "@/modules/my-scientology/types";

export function ScientologyProfileForm({ profile }: { profile: ScientologyProfile | null }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

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
          trainingLevel: formData.get("trainingLevel"),
          processingStatus: formData.get("processingStatus"),
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

  const lastServiceDate = profile?.lastServiceAt ? profile.lastServiceAt.toISOString().slice(0, 10) : "";

  return (
    <form className="surface grid gap-4 rounded-md p-5" onSubmit={handleSubmit}>
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
      <div className="grid gap-4 md:grid-cols-2">
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
        <label className="grid gap-2">
          <span className="form-label">Processing status</span>
          <select className="form-field" name="processingStatus" defaultValue={profile?.processingStatus ?? ""}>
            {scientologyProcessingStatuses.map((status) => (
              <option key={status || "not-listed"} value={status}>
                {status || "Not listed"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-2">
        <span className="form-label">Education notes</span>
        <textarea className="form-field min-h-40 resize-y" name="educationNotes" defaultValue={profile?.educationNotes ?? ""} />
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
  );
}
