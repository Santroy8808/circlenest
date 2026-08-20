"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Check, MessageCircle, ShieldCheck, Star, X } from "lucide-react";

import styles from "./marketplace.module.css";

export type MarketplaceInteractionView = {
  id: string;
  role: "publisher" | "responder";
  status: string;
  listing: { id: string; slug: string; title: string; kind: string; status: string };
  threadId: string | null;
  counterparty: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  myConfirmed: boolean;
  theirConfirmed: boolean;
  completedAt: string | null;
  updatedAt: string;
  review: { id: string; rating: number } | null;
};

export function MarketplaceInteractions({ initialInteractions }: { initialInteractions: MarketplaceInteractionView[] }) {
  const [interactions, setInteractions] = useState(initialInteractions);
  const [filter, setFilter] = useState("CURRENT");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const visible = useMemo(() => interactions.filter((item) => filter === "ALL" || (filter === "CURRENT" ? ["OPEN", "COMPLETED"].includes(item.status) : item.status === filter)), [filter, interactions]);

  function action(interactionId: string, operation: "confirm" | "cancel" | "review") {
    setPendingId(interactionId);
    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/v2/marketplace/interactions/${interactionId}/${operation}`, {
        method: "POST",
        headers: operation === "review" ? { "Content-Type": "application/json" } : undefined,
        body: operation === "review" ? JSON.stringify({ rating, body: reviewBody || null }) : undefined,
      });
      const payload = await response.json() as { error?: string; interaction?: { status: string; requesterConfirmedAt?: string | null; ownerConfirmedAt?: string | null; completedAt?: string | null }; review?: { id: string; rating: number } };
      if (!response.ok) {
        setError(payload.error ?? "Could not update this exchange.");
      } else if (operation === "review" && payload.review) {
        setInteractions((current) => current.map((item) => item.id === interactionId ? { ...item, review: payload.review! } : item));
        setReviewingId(null);
        setReviewBody("");
      } else if (payload.interaction) {
        setInteractions((current) => current.map((item) => item.id === interactionId ? {
          ...item,
          status: payload.interaction!.status,
          myConfirmed: operation === "confirm" ? true : item.myConfirmed,
          completedAt: payload.interaction!.completedAt ?? item.completedAt,
        } : item));
      }
      setPendingId("");
    });
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div><p className={styles.eyebrow}>Marketplace trust</p><h1>My exchanges</h1><p className={styles.subhead}>Confirm completed exchanges and review only people you actually dealt with.</p></div>
        <Link className={styles.secondaryButton} href="/marketplace"><span aria-hidden="true">&larr;</span> Browse listings</Link>
      </header>
      <div className={styles.managerToolbar}><label><span>Show</span><select className={styles.select} onChange={(event) => setFilter(event.target.value)} value={filter}><option value="CURRENT">Current</option><option value="ALL">All</option><option value="OPEN">Open</option><option value="COMPLETED">Completed</option><option value="CANCELED">Canceled</option></select></label></div>
      {error ? <div className={styles.formError} role="alert"><X aria-hidden="true" />{error}</div> : null}
      {visible.length ? <div className={styles.exchangeList}>{visible.map((item) => <article className={styles.exchangeRow} key={item.id}>
        {/* Avatar URLs may be short-lived private media URLs. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className={styles.exchangeAvatar}>{item.counterparty.avatarUrl ? <img alt="" src={item.counterparty.avatarUrl} /> : <span>{(item.counterparty.displayName ?? item.counterparty.username).slice(0, 1).toUpperCase()}</span>}</div>
        <div className={styles.exchangeMain}><p className={styles.sectionLabel}>{item.role} · {item.status}</p><h2><Link href={`/marketplace/${item.listing.slug}`}>{item.listing.title}</Link></h2><p>With <Link href={`/profile/${encodeURIComponent(item.counterparty.username)}`}>{item.counterparty.displayName ?? `@${item.counterparty.username}`}</Link></p><div className={styles.confirmationStatus}><span className={item.myConfirmed ? styles.confirmed : ""}><Check aria-hidden="true" />You {item.myConfirmed ? "confirmed" : "have not confirmed"}</span><span className={item.theirConfirmed ? styles.confirmed : ""}><Check aria-hidden="true" />They {item.theirConfirmed ? "confirmed" : "have not confirmed"}</span></div></div>
        <div className={styles.exchangeActions}>{item.threadId ? <Link aria-label="Open conversation" className={styles.iconButton} data-tooltip="Open conversation." href={`/messages?thread=${encodeURIComponent(item.threadId)}`}><MessageCircle aria-hidden="true" /></Link> : null}{item.status === "OPEN" && !item.myConfirmed ? <button className={styles.primaryButton} disabled={isPending && pendingId === item.id} onClick={() => action(item.id, "confirm")} type="button"><ShieldCheck aria-hidden="true" />Confirm exchange</button> : null}{item.status === "OPEN" ? <button className={styles.secondaryButton} disabled={isPending && pendingId === item.id} onClick={() => action(item.id, "cancel")} type="button"><X aria-hidden="true" />Cancel</button> : null}{item.status === "COMPLETED" && !item.review ? <button className={styles.primaryButton} onClick={() => setReviewingId(item.id)} type="button"><Star aria-hidden="true" />Review</button> : null}{item.review ? <span className={styles.reviewedBadge}><Star aria-hidden="true" />Reviewed {item.review.rating}/5</span> : null}</div>
        {reviewingId === item.id ? <div className={styles.reviewForm}><label className={styles.formField}><span>Rating</span><select className={styles.select} onChange={(event) => setRating(Number(event.target.value))} value={rating}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} star{value === 1 ? "" : "s"}</option>)}</select></label><label className={`${styles.formField} ${styles.reviewComment}`}><span>Review</span><textarea className={styles.textarea} maxLength={2000} onChange={(event) => setReviewBody(event.target.value)} placeholder="Describe this completed exchange." value={reviewBody} /></label><div className={styles.inlineActions}><button className={styles.secondaryButton} onClick={() => setReviewingId(null)} type="button">Cancel</button><button className={styles.primaryButton} disabled={isPending && pendingId === item.id} onClick={() => action(item.id, "review")} type="button"><Star aria-hidden="true" />Publish review</button></div></div> : null}
      </article>)}</div> : <div className={styles.emptyState}><div><ShieldCheck aria-hidden="true" /><h2>No exchanges here</h2><p>When you contact a publisher, the exchange appears here for confirmation.</p></div></div>}
    </div>
  );
}
