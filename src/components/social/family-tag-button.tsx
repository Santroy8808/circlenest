"use client";

import { useState, useTransition } from "react";
import { familyRelationshipLabels } from "@/modules/social-graph/types";

export function FamilyTagButton({
  targetUserId,
  disabled,
  existingLabel
}: {
  targetUserId: string;
  disabled?: boolean;
  existingLabel?: string | null;
}) {
  const [label, setLabel] = useState<(typeof familyRelationshipLabels)[number]>("Sibling");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function requestTag() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/social-graph/family-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId,
          relationshipLabel: label
        })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setMessage(payload.error ?? "Could not send family request.");
        return;
      }

      setMessage("Family request sent for approval.");
    });
  }

  if (existingLabel) {
    return <p className="mt-3 text-xs font-semibold text-[var(--gold)]">Family: {existingLabel}</p>;
  }

  return (
    <div className="mt-4 grid gap-2">
      <label className="sr-only" htmlFor={`family-label-${targetUserId}`}>
        Family relationship
      </label>
      <select
        className="form-field family-select"
        disabled={disabled || isPending}
        id={`family-label-${targetUserId}`}
        onChange={(event) => setLabel(event.target.value as (typeof familyRelationshipLabels)[number])}
        value={label}
      >
        {familyRelationshipLabels.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <button className="btn-secondary family-action-button" disabled={disabled || isPending} onClick={requestTag} type="button">
        {disabled ? "Family request pending" : isPending ? "Sending..." : "Tag as family"}
      </button>
      {message ? <p className="text-xs text-[var(--muted)]">{message}</p> : null}
    </div>
  );
}
