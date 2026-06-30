"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: Date | string | null;
  createdAt: Date | string;
};

function formatDate(value: Date | string) {
  return new Date(value).toLocaleString();
}

export function NotificationsClient({ initialItems }: { initialItems: NotificationItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const unreadCount = useMemo(() => items.filter((item) => !item.readAt).length, [items]);
  const selectedCount = selectedIds.length;
  const allVisibleSelected = items.length > 0 && selectedIds.length === items.length;

  function markRead(id: string) {
    setError("");
    setItems((current) => current.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)));

    startTransition(async () => {
      const response = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });

      if (!response.ok) {
        setError("Could not mark notification read.");
        router.refresh();
        return;
      }

      router.refresh();
    });
  }

  function markAllRead() {
    setError("");
    setItems((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: new Date().toISOString() })));

    startTransition(async () => {
      const response = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true })
      });

      if (!response.ok) {
        setError("Could not mark notifications read.");
        router.refresh();
        return;
      }

      router.refresh();
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]));
  }

  function selectAllVisible() {
    setSelectedIds(items.map((item) => item.id));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function hideSelected() {
    if (selectedIds.length === 0) return;
    const idsToHide = selectedIds;
    setError("");
    setItems((current) => current.filter((item) => !idsToHide.includes(item.id)));
    setSelectedIds([]);

    startTransition(async () => {
      const response = await fetch("/api/notifications/hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToHide })
      });

      if (!response.ok) {
        setError("Could not hide selected notifications.");
        router.refresh();
        return;
      }

      router.refresh();
    });
  }

  function openNotification(item: NotificationItem) {
    if (item.href) {
      router.push(item.href);
    }
  }

  if (items.length === 0) {
    return (
      <section className="surface rounded-md p-6 text-center">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">No notifications yet</h2>
        <p className="mt-2 text-[var(--muted)]">There are no items in this inbox.</p>
      </section>
    );
  }

  return (
    <section className="grid gap-3">
      <div className="surface flex flex-wrap items-center justify-between gap-3 rounded-md p-4">
        <div>
          <p className="text-sm text-[var(--muted)]">{unreadCount} unread notification{unreadCount === 1 ? "" : "s"}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{selectedCount} selected</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-secondary px-4 py-2 text-sm" disabled={isPending || allVisibleSelected} onClick={selectAllVisible} type="button">
            Select all
          </button>
          <button className="btn-secondary px-4 py-2 text-sm" disabled={isPending || selectedCount === 0} onClick={clearSelection} type="button">
            Clear
          </button>
          <button className="btn-secondary px-4 py-2 text-sm" disabled={isPending || selectedCount === 0} onClick={hideSelected} type="button">
            Hide selected
          </button>
          <button className="btn-secondary px-4 py-2 text-sm" disabled={isPending || unreadCount === 0} onClick={markAllRead} type="button">
            Mark all read
          </button>
        </div>
      </div>
      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      {items.map((item) => (
        <article
          className={item.readAt ? "notice-card notice-card--clickable opacity-75" : "notice-card notice-card--clickable"}
          key={item.id}
          onClick={() => openNotification(item)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") openNotification(item);
          }}
          role={item.href ? "button" : undefined}
          tabIndex={item.href ? 0 : undefined}
        >
          <div className="notice-card-row">
            <label className="notice-select-control" onClick={(event) => event.stopPropagation()}>
              <input
                aria-label={`Select ${item.title}`}
                checked={selectedIds.includes(item.id)}
                disabled={isPending}
                onChange={() => toggleSelected(item.id)}
                type="checkbox"
              />
            </label>
            <div className="min-w-0">
              <div className="notice-card-title-row">
                <h2 className="truncate text-base font-semibold text-[var(--gold)]">{item.title}</h2>
                <p className="shrink-0 text-xs text-[var(--muted)]">{formatDate(item.createdAt)}</p>
              </div>
              {item.body ? <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--muted)]">{item.body}</p> : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {!item.readAt ? <span className="pill rounded-full px-2 py-1 text-xs">Unread</span> : null}
              {!item.readAt ? (
                <button
                  className="btn-secondary px-3 py-1 text-xs"
                  disabled={isPending}
                  onClick={(event) => {
                    event.stopPropagation();
                    markRead(item.id);
                  }}
                  type="button"
                >
                  Mark read
                </button>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
