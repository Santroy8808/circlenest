"use client";

import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { ThetaLoading } from "@/components/platform/theta-loading";
import { hasWebTabSessionMarker } from "@/lib/client/web-tab-session";

type WebSessionGuardProps = {
  enabled: boolean;
  isAdmin: boolean;
};

export function WebSessionGuard({ enabled, isAdmin }: WebSessionGuardProps) {
  const [isChecking, setIsChecking] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setIsChecking(false);
      return;
    }

    if (hasWebTabSessionMarker()) {
      setIsChecking(false);
      return;
    }

    const callbackUrl = `${window.location.pathname}${window.location.search}`;
    void signOut({
      callbackUrl: `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
    });
  }, [enabled]);

  if (!isChecking) return null;

  return (
    <div className="web-session-guard" role="alert" aria-live="assertive">
      <ThetaLoading
        detail={isAdmin ? "Administrator sessions require a fresh browser-tab login." : "Desktop sessions require a fresh browser-tab login."}
        label="Checking secure session"
        size="lg"
      />
    </div>
  );
}
