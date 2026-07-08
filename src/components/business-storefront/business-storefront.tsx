"use client";

import { BusinessProfileKind } from "@prisma/client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { InAppImageViewer } from "@/components/media/in-app-image-viewer";
import type { BusinessProfileView } from "@/modules/business-storefront/types";

function priceLabel(listing: BusinessProfileView["marketListings"][number]) {
  if (listing.priceCents === null || listing.priceCents === undefined) return "Contact";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: listing.currency
  }).format(listing.priceCents / 100);
}

export function BusinessStorefront({ profile }: { profile: BusinessProfileView }) {
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const isOrgProfile = profile.profileKind === BusinessProfileKind.ORG;
  const entityLabel = isOrgProfile ? "org" : "business";

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setError("");

    startTransition(async () => {
      const response = await fetch(`/api/storefront/${profile.slug}/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderName,
          senderEmail,
          message
        })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not send inquiry.");
        return;
      }

      setSenderName("");
      setSenderEmail("");
      setMessage("");
      setStatus(`Inquiry sent. The ${entityLabel} contact will see it inside Theta-Space.`);
    });
  }

  return (
    <div className="public-storefront-view">
      <section
        className="business-storefront-hero rounded-md p-6"
        style={
          profile.bannerUrl
            ? {
                backgroundImage: `linear-gradient(90deg, rgba(8, 11, 16, 0.86), rgba(8, 11, 16, 0.46)), url(${profile.bannerUrl})`
              }
            : undefined
        }
      >
        <div className={profile.heroImageUrl ? "business-storefront-hero-grid" : undefined}>
          <div>
            <div className="business-storefront-brand">
              <div className="business-storefront-logo">
                {profile.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={`${profile.businessName} logo`} src={profile.logoUrl} />
                ) : (
                  profile.businessName.slice(0, 2).toUpperCase()
                )}
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">
                  {isOrgProfile ? "Theta-Space Org Profile" : "Theta-Space Storefront"}
                </p>
                <h1 className="mt-3 max-w-3xl text-4xl font-semibold">{profile.businessName}</h1>
              </div>
            </div>
            {profile.tagline ? <p className="mt-4 max-w-2xl text-lg text-[var(--muted)]">{profile.tagline}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.location ? <span className="pill rounded-full px-3 py-1 text-sm">{profile.location}</span> : null}
              <span className="pill rounded-full px-3 py-1 text-sm">{isOrgProfile ? "Public org profile" : "Public business profile"}</span>
            </div>
          </div>
          {profile.heroImageUrl ? (
            <div className="business-storefront-hero-image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={`${profile.businessName} storefront feature`} src={profile.heroImageUrl} />
            </div>
          ) : null}
        </div>
      </section>

      <div className="public-storefront-body">
        <div className="public-storefront-main">
          {profile.blogEnabled ? (
            <nav aria-label="Storefront blogs" className="storefront-blog-nav rounded-md">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{isOrgProfile ? "Org blogs" : "Business blogs"}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">Articles and updates from {profile.businessName}.</p>
              </div>
              <div className="storefront-blog-links">
                {profile.storefrontBlogs.length ? (
                  profile.storefrontBlogs.map((blog) => (
                    <Link className="storefront-blog-link" href={blog.publicUrl} key={blog.id}>
                      <span>{blog.title}</span>
                      <small>
                        {blog.chapterCount} chapters / {blog.wordCount.toLocaleString()} words
                      </small>
                    </Link>
                  ))
                ) : (
                  <span className="storefront-blog-empty">No published blogs yet.</span>
                )}
              </div>
            </nav>
          ) : null}

          <section className="surface rounded-md p-6">
            <h2 className="text-2xl font-semibold text-[var(--gold)]">About</h2>
            <p className="mt-4 whitespace-pre-wrap leading-7 text-[var(--text)]">
              {profile.description ?? `This ${entityLabel} has not added a full description yet.`}
            </p>
            <div className="mt-6 grid gap-3 text-sm text-[var(--muted)]">
              {profile.contactPersonName ? <p>Account contact: {profile.contactPersonName}</p> : null}
              {profile.publicEmail ? <p>Email: {profile.publicEmail}</p> : null}
              {profile.phone ? <p>Phone: {profile.phone}</p> : null}
              {profile.website ? (
                <p>
                  Website:{" "}
                  <a className="text-[var(--gold)] underline" href={profile.website} rel="noreferrer" target="_blank">
                    {profile.website}
                  </a>
                </p>
              ) : null}
            </div>
          </section>

          {profile.galleryImageUrls.length > 0 ? (
            <section className="surface rounded-md p-6">
              <h2 className="text-2xl font-semibold text-[var(--gold)]">Gallery</h2>
              <div className="business-storefront-gallery mt-5">
                {profile.galleryImageUrls.map((url) => (
                  <InAppImageViewer alt={`${profile.businessName} storefront photo`} className="business-storefront-gallery-image" key={url} src={url}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={`${profile.businessName} storefront photo`} src={url} />
                  </InAppImageViewer>
                ))}
              </div>
            </section>
          ) : null}

          {profile.marketListings.length > 0 ? (
            <section className="surface rounded-md p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-[var(--gold)]">Listings</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    Active product and service listings from this storefront. Removed, archived, sold, and expired listings stay hidden.
                  </p>
                </div>
                <Link className="btn-secondary" href="/market">
                  Browse The Market
                </Link>
              </div>
              <div className="listing-grid mt-5">
                {profile.marketListings.map((listing) => (
                  <Link className="listing-square-card market-card" href={`/market/${listing.slug}`} key={listing.id}>
                    <div className="listing-square-visual">
                      {listing.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" src={listing.thumbnailUrl} />
                      ) : (
                        <span className="listing-square-fallback">{listing.categoryLabel}</span>
                      )}
                    </div>
                    <span className="listing-square-top-badge">{priceLabel(listing)}</span>
                    <div className="listing-square-meta">
                      <p className="listing-square-kicker">{listing.categoryLabel}</p>
                      <h2>{listing.title}</h2>
                      <p className="listing-square-subtitle">{listing.location || "Location TBD"}</p>
                      <div className="listing-square-facts">
                        <span>{new Date(listing.createdAt).toLocaleDateString()}</span>
                        <strong>{priceLabel(listing)}</strong>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {profile.articles.length > 0 ? (
            <section className="surface rounded-md p-6">
              <h2 className="text-2xl font-semibold text-[var(--gold)]">Articles</h2>
              <div className="business-article-grid mt-5">
                {profile.articles.map((article) => (
                  <a className="business-article-card" href={article.publicUrl} key={article.id}>
                    {article.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt={article.title} src={article.coverImageUrl} />
                    ) : null}
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">{isOrgProfile ? "Org post" : "Article"}</span>
                    <strong className="mt-2 block">{article.title}</strong>
                    {article.summary ? <span className="mt-2 block text-sm leading-6 text-[var(--muted)]">{article.summary}</span> : null}
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <form className="public-storefront-inquiry surface grid gap-4 rounded-md p-6" onSubmit={submit}>
          <div>
            <h2 className="text-2xl font-semibold text-[var(--gold)]">Send an inquiry</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              This sends a private inquiry to the {isOrgProfile ? "org contact" : "storefront owner"} inside Theta-Space.
            </p>
          </div>
          <label className="grid gap-2">
            <span className="form-label">Your name</span>
            <input className="form-field" onChange={(event) => setSenderName(event.target.value)} value={senderName} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Email, optional</span>
            <input className="form-field" onChange={(event) => setSenderEmail(event.target.value)} value={senderEmail} />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Message</span>
            <textarea className="form-field min-h-28 resize-y" onChange={(event) => setMessage(event.target.value)} value={message} />
          </label>
          {status ? <p className="rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{status}</p> : null}
          {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
          <button className="btn-primary send-logo-button" disabled={isPending || senderName.trim().length < 2 || message.trim().length < 10} type="submit">
            <span aria-hidden="true" className="send-logo-icon" />
            <span className="sr-only">{isPending ? "Sending..." : "Send inquiry"}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
