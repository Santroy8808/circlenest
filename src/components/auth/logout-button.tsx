"use client";

import { signOut } from "next-auth/react";
import { clearWebTabSessionMarker } from "@/lib/client/web-tab-session";

export function LogoutButton() {
  return (
    <button
      className="btn-secondary"
      onClick={() => {
        if (window.confirm("Log out of Theta-Space?")) {
          clearWebTabSessionMarker();
          void signOut({ callbackUrl: "/login" });
        }
      }}
      type="button"
    >
      Log out
    </button>
  );
}
