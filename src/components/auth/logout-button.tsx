"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button className="btn-secondary" onClick={() => signOut({ callbackUrl: "/login" })} type="button">
      Log out
    </button>
  );
}
