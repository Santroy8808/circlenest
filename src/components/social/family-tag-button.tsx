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
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="btn-secondary family-action-button min-h-11"
        disabled={disabled || isPending || sent}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        {disabled || sent ? "Family request sent" : isPending ? "Sending..." : "Add family"}
      </button>
      {isOpen && !disabled && !sent ? (
        <div className="family-choice-popover" role="menu">
          {quickFamilyRelationshipLabels.map((option) => (
            <button className="min-h-11" disabled={isPending} key={option} onClick={() => requestTag(option)} role="menuitem" type="button">
              {option}
            </button>
          ))}
        </div>
      ) : null}
      {message ? (
        <p className={sent ? "text-xs text-[var(--muted)]" : "text-xs text-red-300"} role={sent ? "status" : "alert"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
