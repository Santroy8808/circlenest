import Link from "next/link";

export function MobileBottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white p-2 min-[600px]:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 text-center text-sm text-slate-600">
        <Link href="/home" prefetch={false}>Home</Link>
        <Link href="/friends" prefetch={false}>Friends</Link>
        <Link href="/profile/edit" prefetch={false}>Profile</Link>
        <Link href="/groups" prefetch={false}>Groups</Link>
        <Link href="/messages" prefetch={false}>Inbox</Link>
      </div>
    </nav>
  );
}
