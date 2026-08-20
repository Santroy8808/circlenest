"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Bookmark, Check, ChevronLeft, Flag, Mail, MapPin, MessageCircle, Pencil, Phone, Send, Share2, Star, X } from "lucide-react";

import type { MarketplaceListingDetailView } from "@/modules/marketplace/marketplace-view";
import { MARKETPLACE_TEMPLATES } from "@/modules/marketplace/marketplace-templates";
import { marketplaceDateLabel, marketplaceKindLabels, marketplaceLocationLabel, marketplacePriceLabel } from "./marketplace-format";
import styles from "./marketplace.module.css";

function attributeValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return new Intl.NumberFormat("en").format(value);
  return typeof value === "string" ? value : null;
}

export function MarketplaceDetail({
  initialSaved,
  listing,
  signedIn,
}: {
  initialSaved: boolean;
  listing: MarketplaceListingDetailView;
  signedIn: boolean;
}) {
  const [selectedMediaId, setSelectedMediaId] = useState(listing.primaryMedia?.id ?? listing.media[0]?.id ?? "");
  const [saved, setSaved] = useState(initialSaved);
  const [showInquiry, setShowInquiry] = useState(false);
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedMedia = listing.media.find((item) => item.id === selectedMediaId) ?? listing.media[0] ?? null;
  const facts = useMemo(() => {
    const labels = new Map(MARKETPLACE_TEMPLATES[listing.kind].fields.map((field) => [field.key, field.label]));
    return Object.entries(listing.attributes as Record<string, unknown>)
      .map(([key, value]) => ({ key, label: labels.get(key) ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()), value: attributeValue(value) }))
      .filter((item) => item.value);
  }, [listing.attributes, listing.kind]);

  function toggleSaved() {
    if (!signedIn) {
      window.location.href = `/login?callbackUrl=${encodeURIComponent(`/marketplace/${listing.slug}`)}`;
      return;
    }
    startTransition(async () => {
      const next = !saved;
      const response = await fetch(`/api/v2/marketplace/listings/${listing.id}/save`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saved: next }) });
      const payload = await response.json() as { error?: string };
      if (response.ok) { setSaved(next); setFeedback(next ? "Listing saved." : "Listing removed from saved items."); }
      else setFeedback(payload.error ?? "Could not update saved listings.");
    });
  }

  function submitInquiry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const response = await fetch(`/api/v2/marketplace/listings/${listing.id}/inquiries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: listing.kind === "JOB" ? "APPLICATION" : listing.kind === "RENTAL" ? "TOUR_REQUEST" : listing.priceType === "QUOTE" ? "QUOTE_REQUEST" : "GENERAL", message }) });
      const payload = await response.json() as { error?: string; threadId?: string; warning?: string };
      if (!response.ok) { setFeedback(payload.error ?? "Could not send your message."); return; }
      setFeedback(payload.warning ?? "Your message was sent.");
      setShowInquiry(false);
      setMessage("");
      if (payload.threadId) window.setTimeout(() => { window.location.href = `/messages?thread=${encodeURIComponent(payload.threadId!)}`; }, 500);
    });
  }

  async function shareListing() {
    const share = { title: listing.title, text: listing.summary ?? listing.title, url: window.location.href };
    if (navigator.share) await navigator.share(share).catch(() => undefined);
    else { await navigator.clipboard.writeText(window.location.href); setFeedback("Listing link copied."); }
  }

  return (
    <div className={styles.page}>
      <div className={styles.detailTopbar}>
        <Link className={styles.backLink} href="/marketplace"><ChevronLeft aria-hidden="true" />Marketplace</Link>
        <div className={styles.inlineActions}>
          {listing.canManage ? <Link className={styles.secondaryButton} href={`/marketplace/${listing.slug}/edit`}><Pencil aria-hidden="true" />Edit</Link> : null}
          <button className={styles.iconButton} data-tooltip="Share this listing." onClick={shareListing} type="button"><Share2 aria-hidden="true" /><span className={styles.srOnly}>Share</span></button>
          <button aria-pressed={saved} className={styles.secondaryButton} disabled={isPending} onClick={toggleSaved} type="button"><Bookmark aria-hidden="true" fill={saved ? "currentColor" : "none"} />{saved ? "Saved" : "Save"}</button>
        </div>
      </div>

      <div className={styles.detailLayout}>
        <main>
          <div className={styles.detailMedia}>
            {selectedMedia?.url ? (
              selectedMedia.mimeType.startsWith("video/")
                ? <video controls src={selectedMedia.url} />
                // eslint-disable-next-line @next/next/no-img-element
                : <img alt={selectedMedia.altText ?? listing.title} src={selectedMedia.url} />
            ) : <div className={styles.detailMediaEmpty}>{marketplaceKindLabels[listing.kind]}</div>}
          </div>
          {/* Private media URLs are already authorized and should bypass the public image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {listing.media.length > 1 ? <div className={styles.thumbnailStrip}>{listing.media.map((media) => <button aria-label="Show media" className={media.id === selectedMedia?.id ? styles.thumbnailActive : ""} key={media.id} onClick={() => setSelectedMediaId(media.id)} type="button">{media.url && media.mimeType.startsWith("image/") ? <img alt="" src={media.url} /> : <span>Video</span>}</button>)}</div> : null}

          <header className={styles.detailHeader}>
            <div className={styles.cardEyebrow}><span>{listing.intent === "WANTED" ? "Wanted" : "Offering"} · {marketplaceKindLabels[listing.kind]}</span><span>{listing.category}</span></div>
            <h1>{listing.title}</h1>
            {listing.summary ? <p className={styles.detailSummary}>{listing.summary}</p> : null}
            <div className={styles.detailMeta}><strong>{marketplacePriceLabel(listing)}</strong><span><MapPin aria-hidden="true" />{marketplaceLocationLabel(listing)}</span></div>
          </header>

          <section className={styles.detailSection}><h2>Description</h2><p className={styles.longCopy}>{listing.description}</p></section>
          {facts.length ? <section className={styles.detailSection}><h2>Listing details</h2><dl className={styles.factGrid}>{facts.map((fact) => <div key={fact.key}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl></section> : null}
        </main>

        <aside className={styles.detailSidebar}>
          <section className={styles.publisherPanel}>
            <p className={styles.sectionLabel}>Publisher</p>
            <h2>{listing.publisher.name}</h2>
            {listing.publisher.handle ? <p>@{listing.publisher.handle}</p> : null}
            <p>Member since {marketplaceDateLabel(listing.publisher.memberSince)}</p>
            {listing.publisher.reviewScorePublic ? <p className={styles.rating}><Star aria-hidden="true" fill="currentColor" />{listing.publisher.reviewAverage} from {listing.publisher.reviewCount} verified reviews</p> : listing.publisher.reviewCount ? <p>{listing.publisher.reviewCount} verified interactions; rating appears after 3 reviews.</p> : null}
          </section>
          <section className={styles.actionPanel}>
            <strong>{marketplacePriceLabel(listing)}</strong>
            {listing.canManage ? <p>This is your listing.</p> : signedIn && listing.allowInAppMessages ? <button className={styles.primaryButton} onClick={() => setShowInquiry(true)} type="button"><MessageCircle aria-hidden="true" />Contact publisher</button> : !signedIn ? <Link className={styles.primaryButton} href={`/login?callbackUrl=${encodeURIComponent(`/marketplace/${listing.slug}`)}`}><MessageCircle aria-hidden="true" />Log in to contact</Link> : null}
            {listing.contactEmail ? <a className={styles.contactLink} href={`mailto:${listing.contactEmail}`}><Mail aria-hidden="true" />{listing.contactEmail}</a> : null}
            {listing.contactPhone ? <a className={styles.contactLink} href={`tel:${listing.contactPhone}`}><Phone aria-hidden="true" />{listing.contactPhone}</a> : null}
            {listing.contactWebsite ? <a className={styles.contactLink} href={listing.contactWebsite} rel="noreferrer" target="_blank">Website</a> : null}
            {listing.contactInstructions ? <p>{listing.contactInstructions}</p> : null}
          </section>
          <Link className={styles.reportLink} href={`/feedback/new?sourceUrl=${encodeURIComponent(`/marketplace/${listing.slug}`)}`}><Flag aria-hidden="true" />Report listing</Link>
          <p className={styles.safetyNote}>Meet safely, verify details, and never send payment solely because a listing asks you to.</p>
        </aside>
      </div>

      {feedback ? <div className={styles.toast} role="status"><Check aria-hidden="true" />{feedback}<button aria-label="Dismiss" onClick={() => setFeedback("")} type="button"><X aria-hidden="true" /></button></div> : null}
      {showInquiry ? <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.currentTarget === event.target) setShowInquiry(false); }} role="presentation"><section aria-labelledby="inquiry-title" aria-modal="true" className={styles.modal} role="dialog"><header><div><p className={styles.eyebrow}>Contact publisher</p><h2 id="inquiry-title">Ask about {listing.title}</h2></div><button aria-label="Close" className={styles.iconButton} onClick={() => setShowInquiry(false)} type="button"><X aria-hidden="true" /></button></header><form onSubmit={submitInquiry}><label className={styles.formField}><span>Message</span><textarea autoFocus className={styles.textarea} maxLength={3500} onChange={(event) => setMessage(event.target.value)} required value={message} /></label><div className={styles.modalActions}><button className={styles.secondaryButton} onClick={() => setShowInquiry(false)} type="button">Cancel</button><button className={styles.primaryButton} disabled={isPending || !message.trim()} type="submit"><Send aria-hidden="true" />{isPending ? "Sending..." : "Send message"}</button></div></form></section></div> : null}
    </div>
  );
}
