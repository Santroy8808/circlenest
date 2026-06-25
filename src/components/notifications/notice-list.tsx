import { FamilyRelationshipRequestStatus, FriendRelationshipRequestStatus } from "@prisma/client";
import { FamilyRequestActions } from "@/components/notifications/family-request-actions";
import { FriendRequestActions } from "@/components/notifications/friend-request-actions";

type NoticeItem = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
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

export function NoticeList({ items, emptyTitle }: { items: NoticeItem[]; emptyTitle: string }) {
  if (items.length === 0) {
    return (
      <section className="surface rounded-md p-6 text-center">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">{emptyTitle}</h2>
        <p className="mt-2 text-[var(--muted)]">There are no items in this inbox.</p>
      </section>
    );
  }

  return (
    <section className="grid gap-3">
      {items.map((item) => (
        <article className="notice-card" key={item.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--gold)]">{item.title}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{item.createdAt.toLocaleString()}</p>
            </div>
            {!item.readAt ? <span className="pill rounded-full px-2 py-1 text-xs">Unread</span> : null}
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
