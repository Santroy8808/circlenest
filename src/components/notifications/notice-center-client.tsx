"use client";

import { FamilyRelationshipRequestStatus, FriendRelationshipRequestStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { FamilyRequestActions } from "@/components/notifications/family-request-actions";
import { FriendRequestActions } from "@/components/notifications/friend-request-actions";

export type NoticeCenterKind = "alert" | "notification";
type NoticeFilter = "all" | NoticeCenterKind;

export type NoticeCenterItem = {
  id: string;
  kind: NoticeCenterKind;
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

function noticeKey(item: Pick<NoticeCenterItem, "id" | "kind">) {
  return `${item.kind}:${item.id}`;
}

function filterLabel(filter: NoticeFilter) {
  if (filter === "alert") return "Alerts";
  if (filter === "notification") return "Notifications";
  return "All";
}

function sortNotices(items: NoticeCenterItem[]) {
  return [...items].sort(
    (left, right) => Date.parse(String(right.createdAt)) - Date.parse(String(left.createdAt)) || noticeKey(right).localeCompare(noticeKey(left))
  );
}

function mergeNotices(current: NoticeCenterItem[], incoming: NoticeCenterItem[]) {
  const byKey = new Map(current.map((item) => [noticeKey(item), item]));
  incoming.forEach((item) => byKey.set(noticeKey(item), item));
  return sortNotices(Array.from(byKey.values()));
}

export function NoticeCenterClient({
  initialAlertCursor,
  initialFilter = "all",
  initialItems,
  initialNotificationCursor
}: {
  initialAlertCursor?: string | null;
  initialFilter?: NoticeFilter;
  initialItems: NoticeCenterItem[];
  initialNotificationCursor?: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [alertCursor, setAlertCursor] = useState(initialAlertCursor ?? null);
  const [notificationCursor, setNotificationCursor] = useState(initialNotificationCursor ?? null);
  const [filter, setFilter] = useState<NoticeFilter>(initialFilter);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setItems(initialItems);
    setAlertCursor(initialAlertCursor ?? null);
    setNotificationCursor(initialNotificationCursor ?? null);
    setSelectedKeys([]);
  }, [initialAlertCursor, initialItems, initialNotificationCursor]);

  const visibleItems = useMemo(() => (filter === "all" ? items : items.filter((item) => item.kind === filter)), [filter, items]);
  const unreadCounts = useMemo(
    () => ({
      alert: items.filter((item) => item.kind === "alert" && !item.readAt).length,
      notification: items.filter((item) => item.kind === "notification" && !item.readAt).length
    }),
    [items]
  );
  const selectedVisibleItems = visibleItems.filter((item) => selectedKeys.includes(noticeKey(item)));
  const allVisibleSelected = visibleItems.length > 0 && selectedVisibleItems.length === visibleItems.length;

  function setItemRead(item: NoticeCenterItem) {
    setItems((current) => current.map((currentItem) => (noticeKey(currentItem) === noticeKey(item) ? { ...currentItem, readAt: new Date().toISOString() } : currentItem)));
  }

  function removeItems(keys: string[]) {
    setItems((current) => current.filter((item) => !keys.includes(noticeKey(item))));
    setSelectedKeys((current) => current.filter((key) => !keys.includes(key)));
  }

  function markNotificationRead(id: string) {
    return fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
  }

  function dismissAlert(id: string) {
    return fetch("/api/alerts/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
  }

  const requestNoticePage = useCallback(async (kind: NoticeCenterKind, cursor?: string | null) => {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`/api/${kind === "alert" ? "alerts" : "notifications"}${params.size ? `?${params}` : ""}`, {
      cache: "no-store"
    });
    const payload = (await response.json()) as {
      alerts?: Omit<NoticeCenterItem, "kind">[];
      error?: string;
      items?: Omit<NoticeCenterItem, "kind">[];
      nextCursor?: string | null;
      notifications?: Omit<NoticeCenterItem, "kind">[];
    };
    if (!response.ok) throw new Error(payload.error ?? `Could not load ${kind}s.`);
    const pageItems = payload.items ?? (kind === "alert" ? payload.alerts : payload.notifications) ?? [];
    return {
      items: pageItems.map((item) => ({ ...item, kind } satisfies NoticeCenterItem)),
      nextCursor: payload.nextCursor ?? null
    };
  }, []);

  async function loadMore() {
    if (isLoadingMore) return;
    const wantsAlerts = filter !== "notification" && Boolean(alertCursor);
    const wantsNotifications = filter !== "alert" && Boolean(notificationCursor);
    if (!wantsAlerts && !wantsNotifications) return;

    setIsLoadingMore(true);
    setError("");
    try {
      const [alerts, notifications] = await Promise.all([
        wantsAlerts ? requestNoticePage("alert", alertCursor) : Promise.resolve(null),
        wantsNotifications ? requestNoticePage("notification", notificationCursor) : Promise.resolve(null)
      ]);
      setItems((current) => mergeNotices(current, [...(alerts?.items ?? []), ...(notifications?.items ?? [])]));
      if (alerts) setAlertCursor(alerts.nextCursor);
      if (notifications) setNotificationCursor(notifications.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load more notices.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      void Promise.all([requestNoticePage("alert"), requestNoticePage("notification")])
        .then(([alerts, notifications]) => {
          setItems((current) => mergeNotices(current, [...alerts.items, ...notifications.items]));
        })
        .catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [requestNoticePage]);

  function toggleSelected(item: NoticeCenterItem) {
    const key = noticeKey(item);
    setSelectedKeys((current) => (current.includes(key) ? current.filter((selectedKey) => selectedKey !== key) : [...current, key]));
  }

  function selectAllVisible() {
    setSelectedKeys((current) => Array.from(new Set([...current, ...visibleItems.map(noticeKey)])));
  }

  function hideSelected() {
    if (selectedVisibleItems.length === 0) return;
    const targets = selectedVisibleItems;
    const keys = targets.map(noticeKey);
    setError("");
    removeItems(keys);

    startTransition(async () => {
      const notifications = targets.filter((item) => item.kind === "notification");
      const alerts = targets.filter((item) => item.kind === "alert");
      const notificationResponse =
        notifications.length > 0
          ? fetch("/api/notifications/hide", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: notifications.map((item) => item.id) })
            })
          : Promise.resolve(new Response(null, { status: 200 }));
      const [notificationResult, alertResults] = await Promise.all([
        notificationResponse,
        Promise.all(alerts.map((item) => dismissAlert(item.id)))
      ]);
      const failed = [
        ...(!notificationResult.ok ? notifications : []),
        ...alerts.filter((_item, index) => !alertResults[index]?.ok)
      ];

      if (failed.length > 0) {
        setItems((current) => mergeNotices(current, failed));
        setError("Could not hide every selected item.");
      }
    });
  }

  function markRead(item: NoticeCenterItem) {
    setError("");
    if (item.kind === "alert") removeItems([noticeKey(item)]);
    else setItemRead(item);

    startTransition(async () => {
      const response = item.kind === "alert" ? await dismissAlert(item.id) : await markNotificationRead(item.id);

      if (!response.ok) {
        setItems((current) => mergeNotices(current, [item]));
        setError(`Could not update ${item.kind}.`);
      }
    });
  }

  function markAllVisibleRead() {
    const unreadVisibleItems = visibleItems.filter((item) => !item.readAt);
    if (unreadVisibleItems.length === 0) return;
    setError("");
    const unreadKeys = new Set(unreadVisibleItems.map(noticeKey));
    setItems((current) =>
      current.flatMap((item) => {
        if (!unreadKeys.has(noticeKey(item))) return [item];
        return item.kind === "alert" ? [] : [{ ...item, readAt: new Date().toISOString() }];
      })
    );

    startTransition(async () => {
      const results = await Promise.all(
        unreadVisibleItems.map(async (item) => ({
          item,
          response: item.kind === "alert" ? await dismissAlert(item.id) : await markNotificationRead(item.id)
        }))
      );
      const failed = results.filter((result) => !result.response.ok).map((result) => result.item);

      if (failed.length > 0) {
        setItems((current) => mergeNotices(current, failed));
        setError("Could not mark every visible item read.");
      }
    });
  }

  function openNotice(item: NoticeCenterItem) {
    if (item.href) {
      window.location.assign(item.href);
    }
  }

  const canLoadMore =
    filter === "alert" ? Boolean(alertCursor) : filter === "notification" ? Boolean(notificationCursor) : Boolean(alertCursor || notificationCursor);

  return (
    <section className="notice-center">
      <div className="surface notice-center-toolbar">
        <div>
          <p className="text-sm text-[var(--muted)]">
            {unreadCounts.notification} notification{unreadCounts.notification === 1 ? "" : "s"} unread, {unreadCounts.alert} alert{unreadCounts.alert === 1 ? "" : "s"} unread
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {selectedVisibleItems.length} selected in {filterLabel(filter).toLowerCase()}
          </p>
        </div>
        <div className="notice-center-tabs" role="tablist" aria-label="Notice filters">
          {(["all", "notification", "alert"] as NoticeFilter[]).map((option) => (
            <button
              aria-selected={filter === option}
              className={filter === option ? "is-active min-h-11" : "min-h-11"}
              key={option}
              onClick={() => {
                setFilter(option);
                setSelectedKeys([]);
              }}
              role="tab"
              type="button"
            >
              {filterLabel(option)}
            </button>
          ))}
        </div>
        <div className="notice-center-actions">
          <button className="btn-secondary min-h-11" disabled={isPending || allVisibleSelected || visibleItems.length === 0} onClick={selectAllVisible} type="button">
            Select
          </button>
          <button className="btn-secondary min-h-11" disabled={isPending || selectedKeys.length === 0} onClick={() => setSelectedKeys([])} type="button">
            Clear
          </button>
          <button className="btn-secondary min-h-11" disabled={isPending || selectedVisibleItems.length === 0} onClick={hideSelected} type="button">
            Hide
          </button>
          <button className="btn-secondary min-h-11" disabled={isPending || visibleItems.every((item) => item.readAt)} onClick={markAllVisibleRead} type="button">
            Read
          </button>
        </div>
      </div>

      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100" role="alert">{error}</p> : null}

      {visibleItems.length === 0 ? (
        <section className="surface rounded-md p-6 text-center">
          <h2 className="text-2xl font-semibold text-[var(--gold)]">No {filterLabel(filter).toLowerCase()} yet</h2>
          <p className="mt-2 text-[var(--muted)]">There are no items in this view.</p>
        </section>
      ) : (
        <div className="grid gap-3">
          {visibleItems.map((item) => (
            <article
              className={[
                "notice-card",
                "notice-card--clickable",
                item.kind === "alert" ? "notice-card--alert" : "notice-card--notification",
                item.readAt ? "is-read" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              key={noticeKey(item)}
              onClick={() => openNotice(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") openNotice(item);
              }}
              role={item.href ? "button" : undefined}
              tabIndex={item.href ? 0 : undefined}
            >
              <div className="notice-card-row">
                <label className="notice-select-control" onClick={(event) => event.stopPropagation()}>
                  <input
                    aria-label={`Select ${item.title}`}
                    checked={selectedKeys.includes(noticeKey(item))}
                    disabled={isPending}
                    onChange={() => toggleSelected(item)}
                    type="checkbox"
                  />
                </label>
                <div className="min-w-0">
                  <div className="notice-card-title-row">
                    <div className="notice-title-group">
                      <span className={item.kind === "alert" ? "notice-kind-badge is-alert" : "notice-kind-badge"}>
                        {item.kind === "alert" ? "Alert" : "Notification"}
                      </span>
                      <h2 className="truncate text-base font-semibold text-[var(--gold)]">{item.title}</h2>
                    </div>
                    <p className="shrink-0 text-xs text-[var(--muted)]">{formatDate(item.createdAt)}</p>
                  </div>
                  {item.body ? <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--muted)]">{item.body}</p> : null}
                  {item.familyRequest ? (
                    <div className="family-alert-panel mt-4" onClick={(event) => event.stopPropagation()}>
                      <p className="text-sm font-semibold text-[var(--gold)]">
                        {item.familyRequest.requesterName} wants to list you as {item.familyRequest.relationshipLabel}.
                      </p>
                      <p className="mt-1 text-sm text-[var(--muted)]">@{item.familyRequest.requesterUsername}</p>
                      {item.familyRequest.message ? <p className="mt-2 text-sm">{item.familyRequest.message}</p> : null}
                      {item.familyRequest.status === FamilyRelationshipRequestStatus.PENDING ? (
                        <FamilyRequestActions requestId={item.familyRequest.id} onResolved={() => removeItems([noticeKey(item)])} />
                      ) : (
                        <p className="mt-3 text-sm text-[var(--muted)]">Status: {item.familyRequest.status}</p>
                      )}
                    </div>
                  ) : null}
                  {item.friendRequest ? (
                    <div className="family-alert-panel mt-4" onClick={(event) => event.stopPropagation()}>
                      <p className="text-sm font-semibold text-[var(--gold)]">
                        {item.friendRequest.requesterName} wants to add you as a friend.
                      </p>
                      <p className="mt-1 text-sm text-[var(--muted)]">@{item.friendRequest.requesterUsername}</p>
                      {item.friendRequest.message ? <p className="mt-2 text-sm">{item.friendRequest.message}</p> : null}
                      {item.friendRequest.status === FriendRelationshipRequestStatus.PENDING ? (
                        <FriendRequestActions requestId={item.friendRequest.id} onResolved={() => removeItems([noticeKey(item)])} />
                      ) : (
                        <p className="mt-3 text-sm text-[var(--muted)]">Status: {item.friendRequest.status}</p>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="notice-card-actions">
                  {!item.readAt ? <span className={item.kind === "alert" ? "pill pill-alert" : "pill"}>Unread</span> : null}
                  {!item.readAt ? (
                    <button
                      className="btn-secondary px-3 py-1 text-xs"
                      disabled={isPending}
                      onClick={(event) => {
                        event.stopPropagation();
                        markRead(item);
                      }}
                      type="button"
                    >
                      Read
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {canLoadMore ? (
        <button className="btn-secondary min-h-11 w-full" disabled={isLoadingMore} onClick={() => void loadMore()} type="button">
          {isLoadingMore ? "Loading more..." : `Load more ${filterLabel(filter).toLowerCase()}`}
        </button>
      ) : null}
    </section>
  );
}
