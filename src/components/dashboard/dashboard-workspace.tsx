"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DashboardWidgetResult } from "@/modules/dashboard/dashboard.service";
import {
  createDefaultDashboardConfiguration,
  dashboardLayoutModes,
  dashboardVisibleSlots,
  type DashboardConfiguration,
  type DashboardLayoutMode,
  type DashboardSlotId,
  type DashboardWidgetKey
} from "@/modules/dashboard/types";

const widgetDetails: Record<DashboardWidgetKey, { label: string; href: string; description: string }> = {
  market: { label: "Market", href: "/market", description: "Fresh listings and member offers." },
  jobs: { label: "Jobs", href: "/jobs", description: "Current opportunities and employer listings." },
  messages: { label: "Messages", href: "/messages", description: "Recent direct and group conversations." },
  stream: { label: "Stream", href: "/home", description: "Recent posts from your Theta-Space stream." },
  groups: { label: "Groups", href: "/groups", description: "Your current community spaces." },
  gallery: { label: "Gallery", href: "/profile/gallery", description: "Your recent pictures and albums." },
  business: { label: "Business", href: "/business-center", description: "Your storefront and active business content." }
};

const layoutLabels: Record<DashboardLayoutMode, string> = {
  quad: "Four cards",
  stacked: "Two stacked",
  split: "Two side-by-side",
  single: "One card"
};

function truncate(value: string, length = 105) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length - 1)}...` : normalized;
}

function priceLabel(priceCents: number | null | undefined, currency: string) {
  if (priceCents === null || priceCents === undefined) return "Contact";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(priceCents / 100);
}

function WidgetBody({ result }: { result?: DashboardWidgetResult }) {
  if (!result || result.status === "error") {
    return <p className="dashboard-widget-empty">This dashboard item is unavailable right now. Open the full page to try again.</p>;
  }

  switch (result.widget) {
    case "market":
      return result.listings.length ? (
        <div className="dashboard-widget-list">
          {result.listings.map((listing) => (
            <Link className="dashboard-widget-row" href={`/market/${listing.slug}`} key={listing.id}>
              <span className="dashboard-widget-thumb">
                {listing.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={listing.thumbnailUrl} />
                ) : <span>{listing.categoryLabel.slice(0, 1)}</span>}
              </span>
              <span className="dashboard-widget-row-copy">
                <strong>{listing.title}</strong>
                <small>{listing.location || "Location to be confirmed"} · {listing.seller.displayName}</small>
              </span>
              <b>{priceLabel(listing.priceCents, listing.currency)}</b>
            </Link>
          ))}
        </div>
      ) : <p className="dashboard-widget-empty">No active Market listings yet.</p>;
    case "jobs":
      return result.listings.length ? (
        <div className="dashboard-widget-list">
          {result.listings.map((job) => (
            <Link className="dashboard-widget-row" href={`/jobs/${job.slug}`} key={job.id}>
              <span className="dashboard-widget-thumb is-job">
                {job.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={job.imageUrl} />
                ) : <span>{job.categoryLabel.slice(0, 1)}</span>}
              </span>
              <span className="dashboard-widget-row-copy">
                <strong>{job.title}</strong>
                <small>{job.companyName || job.business?.businessName || job.employer.displayName} · {job.remote ? "Remote" : job.location || "Location to be confirmed"}</small>
              </span>
              <b>{job.compensation || job.employmentTypeLabel}</b>
            </Link>
          ))}
        </div>
      ) : <p className="dashboard-widget-empty">No active jobs yet.</p>;
    case "messages":
      return result.threads.length ? (
        <div className="dashboard-widget-list">
          {result.threads.map((thread) => (
            <Link className="dashboard-widget-row" href={`/messages?thread=${encodeURIComponent(thread.id)}`} key={thread.id}>
              <span className="dashboard-widget-thread-mark">{thread.unread ? "New" : "Chat"}</span>
              <span className="dashboard-widget-row-copy">
                <strong>{thread.title}</strong>
                <small>{truncate(thread.lastMessage?.body || "No messages yet.", 80)}</small>
              </span>
            </Link>
          ))}
        </div>
      ) : <p className="dashboard-widget-empty">No conversations yet. Start a chat from Comm Center.</p>;
    case "stream":
      return result.posts.length ? (
        <div className="dashboard-widget-list">
          {result.posts.map((post) => (
            <Link className="dashboard-widget-post" href={`/posts/${post.id}`} key={post.id}>
              <strong>{post.author.displayName}</strong>
              <span>{truncate(post.body, 145)}</span>
            </Link>
          ))}
        </div>
      ) : <p className="dashboard-widget-empty">Your stream is quiet right now.</p>;
    case "groups":
      return result.groups.length ? (
        <div className="dashboard-widget-list">
          {result.groups.map((group) => (
            <Link className="dashboard-widget-row" href={`/groups/${group.slug}`} key={group.id}>
              <span className="dashboard-widget-thumb is-group">
                {group.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={group.avatarUrl} />
                ) : <span>{group.name.slice(0, 1)}</span>}
              </span>
              <span className="dashboard-widget-row-copy">
                <strong>{group.name}</strong>
                <small>{group.tagline || `${group.memberCount} members`}</small>
              </span>
            </Link>
          ))}
        </div>
      ) : <p className="dashboard-widget-empty">You have not joined any groups yet.</p>;
    case "gallery":
      return result.assets.length ? (
        <div className="dashboard-gallery-grid">
          {result.assets.map((asset) => (
            <Link className="dashboard-gallery-item" href={`/profile/gallery/${asset.id}`} key={asset.id}>
              {asset.thumbnailUrl || asset.publicUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={asset.caption || asset.originalName || "Gallery item"} src={asset.thumbnailUrl || asset.publicUrl || ""} />
              ) : <span>Photo</span>}
            </Link>
          ))}
        </div>
      ) : <p className="dashboard-widget-empty">Your gallery has no pictures yet.</p>;
    case "business": {
      const profile = result.business.profile;
      if (!profile) return <p className="dashboard-widget-empty">Set up a Business Profile to manage a storefront and show your listings.</p>;
      return (
        <div className="dashboard-business-summary">
          <strong>{profile.businessName}</strong>
          <span>{profile.publicStorefrontEnabled ? "Public storefront is live" : "Storefront is private"}</span>
          <small>{profile.marketListings.length} Market listing{profile.marketListings.length === 1 ? "" : "s"} · {profile.jobListings.length} job{profile.jobListings.length === 1 ? "" : "s"}</small>
          {profile.publicStorefrontEnabled ? <Link href={profile.publicUrl}>View storefront</Link> : null}
        </div>
      );
    }
  }
}

export function DashboardWorkspace({
  availableWidgets,
  configuration: initialConfiguration,
  initialWidgetResults
}: {
  availableWidgets: DashboardWidgetKey[];
  configuration: DashboardConfiguration;
  initialWidgetResults: Record<string, DashboardWidgetResult>;
}) {
  const router = useRouter();
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [error, setError] = useState("");
  const [isSaving, startTransition] = useTransition();
  const visibleSlots = dashboardVisibleSlots(configuration);

  function persist(next: DashboardConfiguration) {
    setConfiguration(next);
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/preferences/dashboard", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configuration: next })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; configuration?: DashboardConfiguration };
      if (!response.ok || !payload.configuration) {
        setError(payload.error || "Dashboard changes could not be saved.");
        setConfiguration(initialConfiguration);
        return;
      }
      setConfiguration(payload.configuration);
      router.refresh();
    });
  }

  function setLayout(layout: DashboardLayoutMode) {
    persist({ ...configuration, layout });
  }

  function setPrimarySlot(primarySlot: DashboardSlotId) {
    persist({ ...configuration, layout: "single", primarySlot });
  }

  function replaceWidget(slotId: DashboardSlotId, nextWidget: DashboardWidgetKey) {
    const current = configuration.slots.find((slot) => slot.id === slotId);
    if (!current || current.widget === nextWidget) return;
    const occupiedSlot = configuration.slots.find((slot) => slot.widget === nextWidget);
    const slots = configuration.slots.map((slot) => {
      if (slot.id === slotId) return { ...slot, widget: nextWidget };
      if (slot.id === occupiedSlot?.id) return { ...slot, widget: current.widget };
      return slot;
    });
    persist({ ...configuration, slots });
  }

  function restoreDefault() {
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/preferences/dashboard", { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; configuration?: DashboardConfiguration };
      if (!response.ok || !payload.configuration) {
        setError(payload.error || "Dashboard could not be restored.");
        return;
      }
      setConfiguration(payload.configuration || createDefaultDashboardConfiguration(availableWidgets));
      router.refresh();
    });
  }

  return (
    <section className="dashboard-workspace" data-dashboard-layout={configuration.layout}>
      <header className="dashboard-header surface rounded-md p-5">
        <div>
          <p className="dashboard-kicker">Theta-Space</p>
          <h1>Dashboard</h1>
          <p>Keep up with the parts of Theta-Space that matter most to you.</p>
        </div>
        <div className="dashboard-controls" aria-label="Dashboard layout controls">
          <div className="dashboard-layout-picker" role="group" aria-label="Choose dashboard layout">
            {dashboardLayoutModes.map((layout) => (
              <button
                aria-pressed={configuration.layout === layout}
                className={configuration.layout === layout ? "is-selected" : ""}
                disabled={isSaving}
                key={layout}
                onClick={() => setLayout(layout)}
                type="button"
              >
                {layoutLabels[layout]}
              </button>
            ))}
          </div>
          <button className="btn-secondary" disabled={isSaving} onClick={restoreDefault} type="button">Restore</button>
        </div>
      </header>

      {error ? <p className="dashboard-status is-error" role="alert">{error}</p> : null}
      {isSaving ? <p className="dashboard-status" role="status">Saving dashboard...</p> : null}

      <div className={`dashboard-grid dashboard-grid--${configuration.layout}`}>
        {visibleSlots.map((slot) => {
          const detail = widgetDetails[slot.widget];
          return (
            <article className="dashboard-widget surface" data-dashboard-slot={slot.id} key={slot.id}>
              <header className="dashboard-widget-header">
                <div>
                  <p>{detail.label}</p>
                  <h2>{detail.description}</h2>
                </div>
                <div className="dashboard-widget-actions">
                  <Link className="btn-secondary" href={detail.href}>Open</Link>
                  <button className="btn-secondary" disabled={isSaving} onClick={() => setPrimarySlot(slot.id)} type="button">Expand</button>
                </div>
              </header>
              <WidgetBody result={initialWidgetResults[slot.widget]} />
              <label className="dashboard-widget-replace">
                <span>Show</span>
                <select disabled={isSaving} onChange={(event) => replaceWidget(slot.id, event.target.value as DashboardWidgetKey)} value={slot.widget}>
                  {availableWidgets.map((widget) => <option key={widget} value={widget}>{widgetDetails[widget].label}</option>)}
                </select>
              </label>
            </article>
          );
        })}
      </div>
    </section>
  );
}
