"use client";

import { SocialRelationshipType } from "@prisma/client";
import { useState, useTransition } from "react";
import { quickFamilyRelationshipLabels } from "@/modules/social-graph/types";

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
  const [familyPickerOpen, setFamilyPickerOpen] = useState(false);
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

  function requestFamily(relationshipLabel: (typeof quickFamilyRelationshipLabels)[number]) {
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

      setFamilyPending(true);
      setFamilyPickerOpen(false);
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
      {isFamily ? (
        <span className="profile-relationship-pill">Family</span>
      ) : (
        <div className="profile-family-request">
          <button className="btn-secondary" disabled={isPending || familyPending} onClick={() => setFamilyPickerOpen((current) => !current)} type="button">
            {familyPending ? "Family request pending" : "Request family"}
          </button>
          {familyPickerOpen && !familyPending ? (
            <div className="profile-family-options" role="menu">
              {quickFamilyRelationshipLabels.map((option) => (
                <button disabled={isPending} key={option} onClick={() => requestFamily(option)} type="button">
                  {option}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
      <div className="profile-secondary-actions">
        <button className="profile-relationship-link" disabled={isPending || isFriend || friendPending} onClick={requestFriend} type="button">
          {isFriend ? "Friend" : friendPending ? "Friend pending" : isPending ? "Sending..." : "Friend me"}
        </button>
        <button className="profile-relationship-link" disabled={isPending || isAcquaintance} onClick={markAcquaintance} type="button">
          {isAcquaintance ? "Acquaintance" : isPending ? "Saving..." : "Acquaintance"}
        </button>
      </div>
      {message ? <p className="profile-relationship-message">{message}</p> : null}
    </div>
  );
}
