"use client";

import { MembershipTier, UserRole } from "@prisma/client";
import { useMemo, useState, useTransition } from "react";
import type {
  AdminAnnouncementResult,
  AnnouncementAudienceKind,
  AnnouncementDeliveryChannel
} from "@/modules/admin-moderation/types";

const steps = ["Audience", "Delivery", "Message", "Review"] as const;

const audienceLabels: Record<AnnouncementAudienceKind, string> = {
  ALL_ACTIVE: "All active members",
  TIER: "Membership tier",
  ROLE: "Site role",
  USERS: "Specific users"
};

const channelLabels: Record<AnnouncementDeliveryChannel, string> = {
  CHAT: "Chat",
  MAIL: "Mail",
  LOGIN_POPUP: "Pop-up upon logging in",
  GLOBAL_POST: "Persistent pinned stream post",
  PERSONAL_EMAIL: "Personal email"
};

const channelHelp: Record<AnnouncementDeliveryChannel, string> = {
  CHAT: "Creates announcement chat threads for selected recipients.",
  MAIL: "Sends an internal Theta-Space mail message.",
  LOGIN_POPUP: "Creates alert notices that show at login until read.",
  GLOBAL_POST: "Pins a stream announcement for each member until they dismiss it.",
  PERSONAL_EMAIL: "Queues external personal email delivery. This is not internal mail."
};

function resultLine(label: string, value: number) {
  return (
    <span className="rounded-full border border-[var(--line)] px-3 py-1 text-sm" key={label}>
      {label}: {value}
    </span>
  );
}

export function AdminAnnouncementWizard({ recentAnnouncements }: { recentAnnouncements: AdminAnnouncementResult[] }) {
  const [step, setStep] = useState(0);
  const [audienceKind, setAudienceKind] = useState<AnnouncementAudienceKind>("ALL_ACTIVE");
  const [audienceValue, setAudienceValue] = useState("");
  const [channels, setChannels] = useState<AnnouncementDeliveryChannel[]>(["LOGIN_POPUP"]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reason, setReason] = useState("");
  const [announcements, setAnnouncements] = useState(recentAnnouncements);
  const [published, setPublished] = useState<AdminAnnouncementResult | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedChannelText = useMemo(() => channels.map((channel) => channelLabels[channel]).join(", "), [channels]);

  function toggleChannel(channel: AnnouncementDeliveryChannel) {
    setChannels((current) => (current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]));
  }

  function nextStep() {
    setError("");
    setStep((current) => Math.min(steps.length - 1, current + 1));
  }

  function previousStep() {
    setError("");
    setStep((current) => Math.max(0, current - 1));
  }

  function canContinue() {
    if (step === 0) return audienceKind === "ALL_ACTIVE" || audienceValue.trim().length > 0;
    if (step === 1) return channels.length > 0;
    if (step === 2) return title.trim().length >= 3 && body.trim().length >= 10;
    return true;
  }

  function publish() {
    setMessage("");
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audienceKind,
          audienceValue,
          channels,
          title,
          body,
          reason
        })
      });
      const payload = (await response.json()) as { announcement?: AdminAnnouncementResult; error?: string };

      if (!response.ok || !payload.announcement) {
        setError(payload.error ?? "Could not publish announcement.");
        return;
      }

      setPublished(payload.announcement);
      setAnnouncements((current) => [payload.announcement!, ...current].slice(0, 10));
      setMessage("Announcement published and audited.");
    });
  }

  return (
    <div className="grid gap-5">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Wizard</p>
        <h1 className="mt-3 text-3xl font-semibold">Public Announcements</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Send high-trust platform notices through the channels you choose. External personal email is queued only; internal Mail stays separate.
        </p>
      </section>

      <section className="surface rounded-md p-5">
        <div className="grid gap-3 md:grid-cols-4">
          {steps.map((label, index) => (
            <button
              aria-current={step === index ? "step" : undefined}
              className={step === index ? "module-card rounded-md p-4 text-left ring-1 ring-[var(--gold)]" : "module-card rounded-md p-4 text-left"}
              key={label}
              onClick={() => setStep(index)}
              type="button"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Step {index + 1}</span>
              <strong className="mt-1 block">{label}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="surface rounded-md p-6">
        {step === 0 ? (
          <div className="grid gap-5">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--gold)]">Choose audience</h2>
              <p className="mt-2 text-[var(--muted)]">Pick who should receive this announcement. Specific users accepts usernames or email addresses.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {(Object.keys(audienceLabels) as AnnouncementAudienceKind[]).map((kind) => (
                <button
                  className={audienceKind === kind ? "module-card rounded-md p-4 text-left ring-1 ring-[var(--gold)]" : "module-card rounded-md p-4 text-left"}
                  key={kind}
                  onClick={() => {
                    setAudienceKind(kind);
                    setAudienceValue(kind === "ALL_ACTIVE" ? "" : audienceValue);
                  }}
                  type="button"
                >
                  <strong>{audienceLabels[kind]}</strong>
                </button>
              ))}
            </div>
            {audienceKind === "TIER" ? (
              <label className="grid gap-2">
                <span className="form-label">Tier</span>
                <select className="form-field" onChange={(event) => setAudienceValue(event.target.value)} value={audienceValue}>
                  <option value="">Choose a tier</option>
                  <option value={MembershipTier.FREE}>Free</option>
                  <option value={MembershipTier.CONTRIBUTOR}>Contributor</option>
                  <option value={MembershipTier.PROFESSIONAL}>Professional</option>
                  <option value={MembershipTier.AUDITOR}>Auditor</option>
                </select>
              </label>
            ) : null}
            {audienceKind === "ROLE" ? (
              <label className="grid gap-2">
                <span className="form-label">Role</span>
                <select className="form-field" onChange={(event) => setAudienceValue(event.target.value)} value={audienceValue}>
                  <option value="">Choose a role</option>
                  <option value={UserRole.MEMBER}>Member</option>
                  <option value={UserRole.ADMIN}>Admin</option>
                  <option value={UserRole.GOD}>God</option>
                </select>
              </label>
            ) : null}
            {audienceKind === "USERS" ? (
              <label className="grid gap-2">
                <span className="form-label">Users</span>
                <textarea
                  className="form-field min-h-28 resize-y"
                  onChange={(event) => setAudienceValue(event.target.value)}
                  placeholder="mike@theta-space.net, jules, admin"
                  value={audienceValue}
                />
              </label>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-5">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--gold)]">Choose communication methods</h2>
              <p className="mt-2 text-[var(--muted)]">Check one or more delivery paths. Personal email means external email, not internal Mail.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {(Object.keys(channelLabels) as AnnouncementDeliveryChannel[]).map((channel) => (
                <label className="module-card flex cursor-pointer gap-3 rounded-md p-4" key={channel}>
                  <input checked={channels.includes(channel)} onChange={() => toggleChannel(channel)} type="checkbox" />
                  <span>
                    <strong className="block">{channelLabels[channel]}</strong>
                    <span className="mt-1 block text-sm text-[var(--muted)]">{channelHelp[channel]}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-5">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--gold)]">Draft announcement</h2>
              <p className="mt-2 text-[var(--muted)]">Write member-facing copy and an internal reason for the audit trail.</p>
            </div>
            <label className="grid gap-2">
              <span className="form-label">Title</span>
              <input className="form-field" onChange={(event) => setTitle(event.target.value)} placeholder="Platform update" value={title} />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Announcement body</span>
              <textarea className="form-field min-h-40 resize-y" onChange={(event) => setBody(event.target.value)} value={body} />
            </label>
            <label className="grid gap-2">
              <span className="form-label">Internal reason</span>
              <input className="form-field" onChange={(event) => setReason(event.target.value)} placeholder="Why this is being sent" value={reason} />
            </label>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-5">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--gold)]">Review and publish</h2>
              <p className="mt-2 text-[var(--muted)]">This will create admin and audit records after publishing.</p>
            </div>
            <div className="grid gap-3 rounded-md border border-[var(--line)] bg-black/10 p-4">
              <p><strong>Audience:</strong> {audienceLabels[audienceKind]} {audienceValue ? `- ${audienceValue}` : ""}</p>
              <p><strong>Channels:</strong> {selectedChannelText || "None selected"}</p>
              <p><strong>Title:</strong> {title || "Untitled"}</p>
              <p className="whitespace-pre-wrap"><strong>Body:</strong> {body || "No body yet."}</p>
              {reason ? <p><strong>Audit reason:</strong> {reason}</p> : null}
            </div>
            {published ? (
              <div className="grid gap-3 rounded-md border border-emerald-400/40 bg-emerald-950/30 p-4 text-emerald-100">
                <strong>{published.title} published.</strong>
                <div className="flex flex-wrap gap-2">
                  {resultLine("Recipients", published.recipientCount)}
                  {resultLine("Chat", published.chatDeliveryCount)}
                  {resultLine("Mail", published.mailDeliveryCount)}
                  {resultLine("Login pop-up", published.popupDeliveryCount)}
                  {resultLine("Pinned stream", published.globalPostDeliveryCount)}
                  {resultLine("Personal email queued", published.personalEmailQueuedCount)}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {message ? <p className="mt-5 rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p> : null}
        {error ? <p className="mt-5 rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}

        <div className="mt-6 flex flex-wrap justify-between gap-3">
          <button className="btn-secondary" disabled={step === 0 || isPending} onClick={previousStep} type="button">
            Back
          </button>
          {step < steps.length - 1 ? (
            <button className="btn-primary" disabled={!canContinue() || isPending} onClick={nextStep} type="button">
              Continue
            </button>
          ) : (
            <button className="btn-primary" disabled={!canContinue() || isPending} onClick={publish} type="button">
              {isPending ? "Publishing..." : "Publish announcement"}
            </button>
          )}
        </div>
      </section>

      <section className="surface rounded-md p-6">
        <h2 className="text-2xl font-semibold text-[var(--gold)]">Recent announcements</h2>
        <div className="mt-4 grid gap-3">
          {announcements.length > 0 ? (
            announcements.map((announcement) => (
              <article className="module-card rounded-md p-4" key={announcement.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>{announcement.title}</strong>
                  <span className="text-sm text-[var(--muted)]">{new Date(announcement.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[var(--muted)]">
                  {resultLine("Recipients", announcement.recipientCount)}
                  {resultLine("Chat", announcement.chatDeliveryCount)}
                  {resultLine("Mail", announcement.mailDeliveryCount)}
                  {resultLine("Login pop-up", announcement.popupDeliveryCount)}
                  {resultLine("Pinned stream", announcement.globalPostDeliveryCount)}
                  {resultLine("Personal email queued", announcement.personalEmailQueuedCount)}
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-[var(--line)] p-4 text-[var(--muted)]">No public announcements have been sent yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
