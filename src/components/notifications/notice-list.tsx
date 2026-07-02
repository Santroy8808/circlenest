"use client";

import { FamilyRelationshipRequestStatus, FriendRelationshipRequestStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { FamilyRequestActions } from "@/components/notifications/family-request-actions";
import { FriendRequestActions } from "@/components/notifications/friend-request-actions";

type NoticeItem = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: Date | string | null;
  createdAt: Date | string;
  familyRequest?: {
    id: string;
    requesterName: string;
    requesterUsername: string;
    relationshipLabel: string;
    message: string | null;
    status: FamilyRelationshipRequestStatus;
  } | null;
  friendRequest?: {
    id: string;
    requesterName: string;
    requesterUsername: string;
    message: string | null;
    status: FriendRelationshipRequestStatus;
  } | null;
};

function formatDate(value: Date | string) {
  return new Date(value).toLocaleString();
}

export function NoticeList({ items, emptyTitle }: { items: NoticeItem[]; emptyTitle: string }) {
  const router = useRouter();
  const [visibleItems, setVisibleItems] = useState(items);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setVisibleItems(items);
  }, [items]);

  function dismissAlert(id: string) {
    setError("");
    setVisibleItems((current) => current.filter((item) => item.id !== id));

    startTransition(async () => {
      const response = await fetch("/api/alerts/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });

      if (!response.ok) {
        setError("Could not dismiss alert.");
        router.refresh();
        return;
      }

      router.refresh();
    });
  }

  if (visibleItems.length === 0) {
    return (
      <section className="surface rounded-md p-6 text-center">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">{emptyTitle}</h2>
        <p className="mt-2 text-[var(--muted)]">There are no items in this inbox.</p>
      </section>
    );
  }

  return (
    <section className="grid gap-3">
      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      {visibleItems.map((item) => (
        <article className="notice-card" key={item.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--gold)]">{item.title}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{formatDate(item.createdAt)}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!item.readAt ? <span className="pill rounded-full px-2 py-1 text-xs">Unread</span> : null}
              <button className="btn-secondary px-3 py-1 text-xs" disabled={isPending} onClick={() => dismissAlert(item.id)} type="button">
                Dismiss
              </button>
            </div>
          </div>
          {item.body ? <p className="mt-3 leading-7">{item.body}</p> : null}
          {item.familyRequest ? (
            <div className="family-alert-panel mt-4">
              <p className="text-sm font-semibold text-[var(--gold)]">
                {item.familyRequest.requesterName} wants to list you as {item.familyRequest.relationshipLabel}.
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">@{item.familyRequest.requesterUsername}</p>
              {item.familyRequest.message ? <p className="mt-2 text-sm">{item.familyRequest.message}</p> : null}
              {item.familyRequest.status === FamilyRelationshipRequestStatus.PENDING ? (
                <FamilyRequestActions requestId={item.familyRequest.id} />
              ) : (
                <p className="mt-3 text-sm text-[var(--muted)]">Status: {item.familyRequest.status}</p>
              )}
            </div>
          ) : null}
          {item.friendRequest ? (
            <div className="family-alert-panel mt-4">
              <p className="text-sm font-semibold text-[var(--gold)]">
                {item.friendRequest.requesterName} wants to add you as a friend.
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">@{item.friendRequest.requesterUsername}</p>
              {item.friendRequest.message ? <p className="mt-2 text-sm">{item.friendRequest.message}</p> : null}
              {item.friendRequest.status === FriendRelationshipRequestStatus.PENDING ? (
                <FriendRequestActions requestId={item.friendRequest.id} />
              ) : (
                <p className="mt-3 text-sm text-[var(--muted)]">Status: {item.friendRequest.status}</p>
              )}
            </div>
          ) : null}
          {item.href ? <p className="mt-3 text-sm text-[var(--gold)]">{item.href}</p> : null}
        </article>
      ))}
    </section>
  );
}
