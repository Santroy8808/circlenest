"use client";

import { useState, useTransition } from "react";
import { quickFamilyRelationshipLabels } from "@/modules/social-graph/types";

export function FamilyTagButton({
  targetUserId,
  disabled,
  existingLabel
}: {
  targetUserId: string;
  disabled?: boolean;
  existingLabel?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function requestTag(relationshipLabel: (typeof quickFamilyRelationshipLabels)[number]) {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/social-graph/family-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId,
          relationshipLabel
        })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setMessage(payload.error ?? "Could not send family request.");
        return;
      }

      setSent(true);
      setIsOpen(false);
      setMessage("Family request sent for approval.");
    });
  }

  if (existingLabel) {
    return <p className="mt-3 text-xs font-semibold text-[var(--gold)]">Family: {existingLabel}</p>;
  }

  return (
    <div className="family-tag-control">
      <button className="btn-secondary family-action-button" disabled={disabled || isPending || sent} onClick={() => setIsOpen((current) => !current)} type="button">
        {disabled || sent ? "Pending" : isPending ? "Sending..." : "Family"}
      </button>
      {isOpen && !disabled && !sent ? (
        <div className="family-choice-popover" role="menu">
          {quickFamilyRelationshipLabels.map((option) => (
            <button disabled={isPending} key={option} onClick={() => requestTag(option)} type="button">
              {option}
            </button>
          ))}
        </div>
      ) : null}
      {message ? <p className="text-xs text-[var(--muted)]">{message}</p> : null}
    </div>
  );
}
