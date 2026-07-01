"use client";

import { SocialRelationshipType } from "@prisma/client";
import { useState, useTransition } from "react";
import { familyRelationshipLabels } from "@/modules/social-graph/types";

export function ProfileRelationshipActions({
  pendingFamilyRequest,
  pendingFriendRequest,
  relationships,
  targetDisplayName,
  targetUserId
}: {
  pendingFamilyRequest: boolean;
  pendingFriendRequest: boolean;
  relationships: SocialRelationshipType[];
  targetDisplayName: string;
  targetUserId: string;
}) {
  const [currentRelationships, setCurrentRelationships] = useState(relationships);
  const [friendPending, setFriendPending] = useState(pendingFriendRequest);
  const [familyPending, setFamilyPending] = useState(pendingFamilyRequest);
  const [familyLabel, setFamilyLabel] = useState<(typeof familyRelationshipLabels)[number]>("Sibling");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const isFriend = currentRelationships.includes(SocialRelationshipType.FRIEND);
  const isFamily = currentRelationships.includes(SocialRelationshipType.FAMILY);
  const isAcquaintance = currentRelationships.includes(SocialRelationshipType.ACQUAINTANCE);

  function requestFriend() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/social-graph/friend-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId
        })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setMessage(payload.error ?? "Could not add friend.");
        return;
      }

      setFriendPending(true);
      setMessage(`Friend request sent to ${targetDisplayName}.`);
    });
  }

  function requestFamily() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/social-graph/family-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId,
          relationshipLabel: familyLabel
        })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setMessage(payload.error ?? "Could not send family request.");
        return;
      }

      setFamilyPending(true);
      setMessage(`Family request sent to ${targetDisplayName}.`);
    });
  }

  function markAcquaintance() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/social-graph/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId: targetUserId,
          type: SocialRelationshipType.ACQUAINTANCE
        })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setMessage(payload.error ?? "Could not mark acquaintance.");
        return;
      }

      setCurrentRelationships((current) =>
        current.includes(SocialRelationshipType.ACQUAINTANCE) ? current : [...current, SocialRelationshipType.ACQUAINTANCE]
      );
      setMessage(`${targetDisplayName} marked as an acquaintance.`);
    });
  }

  return (
    <div className="profile-relationship-actions" aria-label={`Connect with ${targetDisplayName}`}>
      <button className="profile-friend-link" disabled={isPending || isFriend || friendPending} onClick={requestFriend} type="button">
        {isFriend ? "Friend" : friendPending ? "Friend request pending" : isPending ? "Sending..." : "Friend me"}
      </button>
      <button className="profile-friend-link" disabled={isPending || isAcquaintance} onClick={markAcquaintance} type="button">
        {isAcquaintance ? "Acquaintance" : isPending ? "Saving..." : "Acquaintance"}
      </button>
      {isFamily ? (
        <span className="profile-relationship-pill">Family</span>
      ) : (
        <div className="profile-family-request">
          <label className="sr-only" htmlFor={`profile-family-label-${targetUserId}`}>
            Family relationship
          </label>
          <select
            className="form-field family-select"
            disabled={isPending || familyPending}
            id={`profile-family-label-${targetUserId}`}
            onChange={(event) => setFamilyLabel(event.target.value as (typeof familyRelationshipLabels)[number])}
            value={familyLabel}
          >
            {familyRelationshipLabels.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button className="btn-secondary" disabled={isPending || familyPending} onClick={requestFamily} type="button">
            {familyPending ? "Family request pending" : "Request family"}
          </button>
        </div>
      )}
      {message ? <p className="profile-relationship-message">{message}</p> : null}
    </div>
  );
}
