import Link from "next/link";

export function MobileBottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-[var(--border)] bg-[var(--card)] p-2 shadow-[0_-6px_18px_rgba(0,0,0,0.35)] min-[600px]:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 items-center text-center text-xs text-slate-200">
        <Link className="rounded px-1 py-1 text-[var(--text-strong)]" href="/home" prefetch={false}>Home</Link>
        <Link className="rounded px-1 py-1 text-[var(--text-strong)]" href="/friends" prefetch={false}>Friends</Link>
        <Link className="rounded px-1 py-1 text-[var(--text-strong)]" href="/profile/edit" prefetch={false}>Profile</Link>
        <Link className="rounded px-1 py-1 text-[var(--text-strong)]" href="/groups" prefetch={false}>Groups</Link>
        <Link className="rounded px-1 py-1 text-[var(--text-strong)]" href="/mail" prefetch={false}>Mail</Link>
      </div>
    </nav>
  );
}
