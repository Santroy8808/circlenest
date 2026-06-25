"use client";

import { useState, useTransition } from "react";

export function ManuscriptSubscribeButton({
  initialSubscribed,
  manuscriptSlug,
  title
}: {
  initialSubscribed: boolean;
  manuscriptSlug: string;
  title: string;
}) {
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggle() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch(`/api/writers/manuscripts/${manuscriptSlug}/subscription`, {
        method: subscribed ? "DELETE" : "POST",
        headers: subscribed ? undefined : { "Content-Type": "application/json" },
        body: subscribed ? undefined : JSON.stringify({ notify: true })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setMessage(payload.error ?? "Could not update subscription.");
        return;
      }

      setSubscribed(!subscribed);
      setMessage(subscribed ? "Subscription removed." : `Subscribed to ${title}.`);
    });
  }

  return (
    <div className="writer-subscribe-action">
      <button className={subscribed ? "btn-secondary" : "btn-primary"} disabled={isPending} onClick={toggle} type="button">
        {subscribed ? "Subscribed" : isPending ? "Subscribing..." : "Subscribe"}
      </button>
      {message ? <p className="text-sm text-[var(--muted)]">{message}</p> : null}
    </div>
  );
}
