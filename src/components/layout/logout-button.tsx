"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="text-sm underline underline-offset-2 hover:scale-[1.03]">
      Log out
    </button>
  );
}
