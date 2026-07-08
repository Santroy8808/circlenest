"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      className="btn-secondary"
      onClick={() => {
        if (window.confirm("Log out of Theta-Space?")) {
          void signOut({ callbackUrl: "/login" });
        }
      }}
      type="button"
    >
      Log out
    </button>
  );
}
