type NoticeItem = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export function NoticeList({ items, emptyTitle }: { items: NoticeItem[]; emptyTitle: string }) {
  if (items.length === 0) {
    return (
      <section className="surface rounded-md p-6 text-center">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">{emptyTitle}</h2>
        <p className="mt-2 text-[var(--muted)]">New items will appear here when the platform creates them.</p>
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
          {item.href ? <p className="mt-3 text-sm text-[var(--gold)]">{item.href}</p> : null}
        </article>
      ))}
    </section>
  );
}
