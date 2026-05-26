import Link from "next/link";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { LogoutButton } from "@/components/layout/logout-button";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-16 md:pb-0">
      <div className="mx-auto hidden max-w-7xl grid-cols-[200px_minmax(0,1fr)] gap-3 p-3 min-[600px]:grid lg:grid-cols-[220px_minmax(0,1fr)_260px]">
        <aside className="card sticky top-3 h-[calc(100vh-1.5rem)] p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">CircleNest</span>
            <LogoutButton />
          </div>
          <nav className="grid gap-1.5 text-xs">
            <Link href="/home" prefetch={false}>Home</Link>
            <Link href="/profile/edit" prefetch={false}>My Profile</Link>
            <Link href="/profile/edit" prefetch={false}>Edit Profile</Link>
            <Link href="/settings" prefetch={false}>Settings</Link>
            <Link href="/settings/theme" prefetch={false}>Theme Settings</Link>
            <Link href="/friends" prefetch={false}>Friends</Link>
            <Link href="/messages" prefetch={false}>Messages</Link>
            <Link href="/notifications" prefetch={false}>Notifications</Link>
            <Link href="/groups" prefetch={false}>Groups</Link>
          </nav>
        </aside>
        <main>{children}</main>
        <aside className="card sticky top-3 hidden h-[calc(100vh-1.5rem)] p-3 text-xs text-slate-600 lg:block">Quick panel</aside>
      </div>
      <div className="p-3 min-[600px]:hidden">{children}</div>
      <MobileBottomNav />
    </div>
  );
}
