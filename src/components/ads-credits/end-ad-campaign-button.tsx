"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function EndAdCampaignButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function endCampaign() {
    if (!window.confirm("End this ad campaign now?")) return;

    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/ads/campaigns/${campaignId}/end`, {
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(payload?.error ?? "Could not end this campaign.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="grid gap-2">
      <button className="btn-secondary w-fit px-4 py-2 text-sm" disabled={isPending} onClick={endCampaign} type="button">
        {isPending ? "Ending..." : "End campaign"}
      </button>
      {error ? <p className="text-sm text-red-200">{error}</p> : null}
    </div>
  );
}
