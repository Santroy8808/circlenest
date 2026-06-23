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
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const unreadCount = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

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
        <p className="text-sm text-[var(--muted)]">{unreadCount} unread notification{unreadCount === 1 ? "" : "s"}</p>
        <button className="btn-secondary px-4 py-2 text-sm" disabled={isPending || unreadCount === 0} onClick={markAllRead} type="button">
          Mark all read
        </button>
      </div>
      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      {items.map((item) => (
        <article className={item.readAt ? "notice-card opacity-75" : "notice-card"} key={item.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--gold)]">{item.title}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{formatDate(item.createdAt)}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {!item.readAt ? <span className="pill rounded-full px-2 py-1 text-xs">Unread</span> : null}
              {!item.readAt ? (
                <button className="btn-secondary px-3 py-1 text-xs" disabled={isPending} onClick={() => markRead(item.id)} type="button">
                  Mark read
                </button>
              ) : null}
            </div>
          </div>
          {item.body ? <p className="mt-3 leading-7">{item.body}</p> : null}
          {item.href ? (
            <a className="mt-3 inline-flex text-sm text-[var(--gold)] underline" href={item.href}>
              Open
            </a>
          ) : null}
        </article>
      ))}
    </section>
  );
}
