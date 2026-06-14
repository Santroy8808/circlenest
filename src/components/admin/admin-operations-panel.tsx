import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { hasFreshPrivilegedActionAccess } from "@/lib/security/action-access";
import { isAdminUser } from "@/lib/auth/admin";
import {
  ADMIN_MONEY_BOUNDARY,
  addSupportNote,
  createDataPrivacyRequest,
  createPlatformThrottle,
  forceTermsAcceptance,
  queueWebhookReplay,
  recordPlatformAnnouncement,
  resendEmailVerification,
  revokeUserSessions,
  updateBusinessVerification,
  upsertFeatureFlag,
  upsertPlatformCategory,
} from "@/lib/admin/admin-ops";
import { dispatchAdminAnnouncement } from "@/lib/admin/admin-console";

type UserOption = {
  id: string;
  email: string;
  username: string;
  role: string;
  subscriptionTier: string;
};

type SecurityEventRow = {
  id: string;
  eventType: string;
  createdAt: string;
  user: { username: string; email: string } | null;
  ipAddress: string | null;
  metadata: string | null;
};

type FeatureFlagRow = {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
};

type CategoryRow = {
  id: string;
  area: string;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
};

type AnnouncementRow = {
  id: string;
  headline: string;
  audienceType: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
};

type BusinessRow = {
  id: string;
  businessName: string;
  status: string;
  verificationStatus: string;
  owner: { username: string; email: string };
};

type QueueRow = {
  id: string;
  label: string;
  status: string;
  createdAt: string;
};

type ViewRole = "FREE" | "CONTRIBUTOR" | "PRO" | "AUDITOR" | "ADMIN";

type Props = {
  users: UserOption[];
  securityEvents: SecurityEventRow[];
  featureFlags: FeatureFlagRow[];
  categories: CategoryRow[];
  announcements: AnnouncementRow[];
  businesses: BusinessRow[];
  supportNotes: QueueRow[];
  webhookReplays: QueueRow[];
  dataRequests: QueueRow[];
  throttles: QueueRow[];
  previewRole: ViewRole;
};

async function requireAdminAction() {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (!(await isAdminUser(session.user.id))) return null;
  if (!hasFreshPrivilegedActionAccess(session.user.id)) return null;
  return session.user.id;
}

function roleLabel(role: ViewRole) {
  if (role === "CONTRIBUTOR") return "Contributor";
  if (role === "PRO") return "Biz";
  return role[0] + role.slice(1).toLowerCase();
}

function previewCapabilities(role: ViewRole) {
  if (role === "FREE") return ["Browse jobs", "Browse The Market", "Create small groups", "No ads, job posts, or Market posting"];
  if (role === "CONTRIBUTOR") return ["Browse jobs", "Create 6 Market listings every 2 weeks", "Create events and fundraisers", "No job posting"];
  if (role === "PRO") return ["Post jobs", "Unlimited Market listings", "Create ads", "Business profile and storefront tools"];
  if (role === "AUDITOR") return ["Auditor profile tools", "Biz-style promotion tools", "Directory visibility", "Ad credits"];
  return ["Admin tools visible only with Administrator Mode", "Can manage privileges and safety", "Cannot create real money", "Can grant platform-only credits"];
}

export function AdminOperationsPanel(props: Props) {
  const userOptions = props.users.slice(0, 100);
  const roleOptions: ViewRole[] = ["FREE", "CONTRIBUTOR", "PRO", "AUDITOR", "ADMIN"];

  return (
    <section className="space-y-4 rounded border border-[var(--border)] p-3">
      <div>
        <h2 className="text-lg font-semibold">Admin operations</h2>
        <p className="text-xs text-amber-200">{ADMIN_MONEY_BOUNDARY}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <form
          action={async (formData) => {
            "use server";
            const actorUserId = await requireAdminAction();
            if (!actorUserId) return;
            const targetUserId = String(formData.get("targetUserId") ?? "").trim();
            const operation = String(formData.get("operation") ?? "").trim();
            const reason = String(formData.get("reason") ?? "").trim() || null;
            if (!targetUserId) return;
            if (operation === "REVOKE_SESSIONS") await revokeUserSessions({ actorUserId, targetUserId, reason });
            if (operation === "RESEND_VERIFICATION") await resendEmailVerification({ actorUserId, targetUserId });
            if (operation === "FORCE_TERMS") await forceTermsAcceptance({ actorUserId, targetUserId, reason });
            revalidatePath("/admin");
          }}
          className="rounded border border-[var(--border)] p-3"
        >
          <h3 className="font-semibold">Account and security support</h3>
          <p className="mb-2 text-xs text-slate-400">Force log-out, resend verification, or force terms acceptance.</p>
          <select name="targetUserId" className="mb-2 w-full rounded border px-3 py-2 text-sm" required>
            <option value="">Select user</option>
            {userOptions.map((user) => (
              <option key={user.id} value={user.id}>
                @{user.username} - {user.email}
              </option>
            ))}
          </select>
          <select name="operation" className="mb-2 w-full rounded border px-3 py-2 text-sm" required>
            <option value="REVOKE_SESSIONS">Force log-out</option>
            <option value="RESEND_VERIFICATION">Resend email verification</option>
            <option value="FORCE_TERMS">Force terms acceptance</option>
          </select>
          <input name="reason" placeholder="Reason / note" className="mb-2 w-full rounded border px-3 py-2 text-sm" />
          <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white" type="submit">
            Run guided action
          </button>
        </form>

        <div className="rounded border border-[var(--border)] p-3">
          <h3 className="font-semibold">Login/security event viewer</h3>
          <div className="mt-2 max-h-64 space-y-2 overflow-auto pr-1">
            {props.securityEvents.map((event) => (
              <article key={event.id} className="rounded bg-[#0e1524] p-2 text-xs">
                <p className="font-semibold">{event.eventType}</p>
                <p className="text-slate-400">
                  {event.user ? `@${event.user.username}` : "No user"} | {new Date(event.createdAt).toLocaleString()}
                </p>
                {event.ipAddress ? <p className="text-slate-500">IP: {event.ipAddress}</p> : null}
                {event.metadata ? <p className="truncate text-slate-500">{event.metadata}</p> : null}
              </article>
            ))}
            {props.securityEvents.length === 0 ? <p className="text-sm text-slate-500">No security events yet.</p> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <form
          action={async (formData) => {
            "use server";
            const actorUserId = await requireAdminAction();
            if (!actorUserId) return;
            await upsertFeatureFlag({
              actorUserId,
              key: String(formData.get("key") ?? ""),
              enabled: String(formData.get("enabled") ?? "") === "true",
              description: String(formData.get("description") ?? "") || null,
            });
            revalidatePath("/admin");
          }}
          className="rounded border border-[var(--border)] p-3"
        >
          <h3 className="font-semibold">Feature flag control</h3>
          <input name="key" placeholder="FEATURE_NAME" className="mt-2 w-full rounded border px-3 py-2 text-sm" required />
          <input name="description" placeholder="Description" className="mt-2 w-full rounded border px-3 py-2 text-sm" />
          <select name="enabled" className="mt-2 w-full rounded border px-3 py-2 text-sm">
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
          <button className="mt-2 rounded bg-slate-900 px-3 py-2 text-sm text-white" type="submit">
            Save flag
          </button>
          <div className="mt-3 space-y-1 text-xs text-slate-400">
            {props.featureFlags.map((flag) => (
              <p key={flag.id}>
                {flag.key}: {flag.enabled ? "on" : "off"}
              </p>
            ))}
          </div>
        </form>

        <form
          action={async (formData) => {
            "use server";
            const actorUserId = await requireAdminAction();
            if (!actorUserId) return;
            await upsertPlatformCategory({
              actorUserId,
              area: String(formData.get("area") ?? ""),
              name: String(formData.get("name") ?? ""),
              isActive: String(formData.get("isActive") ?? "") === "true",
              sortOrder: Number(formData.get("sortOrder") ?? "0") || 0,
            });
            revalidatePath("/admin");
          }}
          className="rounded border border-[var(--border)] p-3"
        >
          <h3 className="font-semibold">Category management</h3>
          <select name="area" className="mt-2 w-full rounded border px-3 py-2 text-sm">
            <option value="MARKET">Market</option>
            <option value="JOBS">Jobs</option>
            <option value="EVENTS">Events</option>
            <option value="FUNDRAISERS">Fundraisers</option>
          </select>
          <input name="name" placeholder="Category name" className="mt-2 w-full rounded border px-3 py-2 text-sm" required />
          <input name="sortOrder" type="number" placeholder="Sort order" className="mt-2 w-full rounded border px-3 py-2 text-sm" />
          <select name="isActive" className="mt-2 w-full rounded border px-3 py-2 text-sm">
            <option value="true">Active</option>
            <option value="false">Hidden</option>
          </select>
          <button className="mt-2 rounded bg-slate-900 px-3 py-2 text-sm text-white" type="submit">
            Save category
          </button>
          <div className="mt-3 space-y-1 text-xs text-slate-400">
            {props.categories.map((category) => (
              <p key={category.id}>
                {category.area}: {category.name} ({category.isActive ? "active" : "hidden"})
              </p>
            ))}
          </div>
        </form>
      </div>

      <form
        action={async (formData) => {
          "use server";
          const actorUserId = await requireAdminAction();
          if (!actorUserId) return;
          const headline = String(formData.get("headline") ?? "").trim();
          const body = String(formData.get("body") ?? "").trim();
          const targetUrl = String(formData.get("targetUrl") ?? "").trim() || null;
          const audienceType = String(formData.get("audienceType") ?? "GLOBAL");
          const publish = String(formData.get("publish") ?? "") === "true";
          const deliveryModes = [String(formData.get("deliveryMode") ?? "BANNER")];
          if (!headline || !body) return;
          await recordPlatformAnnouncement({
            actorUserId,
            headline,
            body,
            targetUrl,
            audienceType,
            deliveryModesJson: JSON.stringify(deliveryModes),
            publish,
          });
          if (publish) {
            await dispatchAdminAnnouncement({
              actorUserId,
              headline,
              body,
              targetUrl,
              deliveryModes: deliveryModes as ["BANNER"],
              sendToSite: audienceType === "GLOBAL",
              sendToGroups: false,
              sendToTiers: false,
              groupIds: [],
              tierValues: [],
              adSpendCredits: 0,
              adBoostFactor: 1,
            });
          }
          revalidatePath("/admin");
        }}
        className="rounded border border-[var(--border)] p-3"
      >
        <h3 className="font-semibold">Public announcement system</h3>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <input name="headline" placeholder="Headline" className="rounded border px-3 py-2 text-sm" required />
          <input name="targetUrl" placeholder="Optional target URL" className="rounded border px-3 py-2 text-sm" />
          <select name="audienceType" className="rounded border px-3 py-2 text-sm">
            <option value="GLOBAL">Global</option>
            <option value="TIER">Tier-specific draft</option>
            <option value="TARGETED">Targeted draft</option>
          </select>
          <select name="publish" className="rounded border px-3 py-2 text-sm">
            <option value="false">Save draft</option>
            <option value="true">Publish notification</option>
          </select>
          <textarea name="body" placeholder="Announcement body" className="rounded border px-3 py-2 text-sm md:col-span-2" required />
        </div>
        <button className="mt-2 rounded bg-slate-900 px-3 py-2 text-sm text-white" type="submit">
          Save announcement
        </button>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {props.announcements.map((announcement) => (
            <p key={announcement.id} className="rounded bg-[#0e1524] p-2 text-xs text-slate-300">
              {announcement.headline} | {announcement.audienceType} | {announcement.status}
            </p>
          ))}
        </div>
      </form>

      <div className="grid gap-3 lg:grid-cols-2">
        <form
          action={async (formData) => {
            "use server";
            const actorUserId = await requireAdminAction();
            if (!actorUserId) return;
            await updateBusinessVerification({
              actorUserId,
              businessProfileId: String(formData.get("businessProfileId") ?? ""),
              status: String(formData.get("status") ?? "ACTIVE"),
              verificationStatus: String(formData.get("verificationStatus") ?? "PENDING"),
              note: String(formData.get("note") ?? "") || null,
            });
            revalidatePath("/admin");
          }}
          className="rounded border border-[var(--border)] p-3"
        >
          <h3 className="font-semibold">Business verification workflow</h3>
          <select name="businessProfileId" className="mt-2 w-full rounded border px-3 py-2 text-sm" required>
            <option value="">Select business</option>
            {props.businesses.map((business) => (
              <option key={business.id} value={business.id}>
                {business.businessName} - @{business.owner.username}
              </option>
            ))}
          </select>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <select name="status" className="rounded border px-3 py-2 text-sm">
              <option value="ACTIVE">Active</option>
              <option value="HOLD">Hold</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <select name="verificationStatus" className="rounded border px-3 py-2 text-sm">
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approve</option>
              <option value="CHANGES_REQUESTED">Request changes</option>
              <option value="REJECTED">Reject</option>
            </select>
          </div>
          <input name="note" placeholder="Review note" className="mt-2 w-full rounded border px-3 py-2 text-sm" />
          <button className="mt-2 rounded bg-slate-900 px-3 py-2 text-sm text-white" type="submit">
            Save business decision
          </button>
        </form>

        <form
          action={async (formData) => {
            "use server";
            const actorUserId = await requireAdminAction();
            if (!actorUserId) return;
            await createPlatformThrottle({
              actorUserId,
              targetType: String(formData.get("targetType") ?? ""),
              targetId: String(formData.get("targetId") ?? ""),
              throttleKey: String(formData.get("throttleKey") ?? ""),
              reason: String(formData.get("reason") ?? "") || null,
            });
            revalidatePath("/admin");
          }}
          className="rounded border border-[var(--border)] p-3"
        >
          <h3 className="font-semibold">Abuse / rate-limit controls</h3>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <input name="targetType" placeholder="USER / BUSINESS" className="rounded border px-3 py-2 text-sm" required />
            <input name="targetId" placeholder="Target ID" className="rounded border px-3 py-2 text-sm" required />
            <input name="throttleKey" placeholder="POSTS / MESSAGES / ADS" className="rounded border px-3 py-2 text-sm" required />
            <input name="reason" placeholder="Reason" className="rounded border px-3 py-2 text-sm" />
          </div>
          <button className="mt-2 rounded bg-slate-900 px-3 py-2 text-sm text-white" type="submit">
            Apply throttle
          </button>
        </form>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <form
          action={async (formData) => {
            "use server";
            const actorUserId = await requireAdminAction();
            if (!actorUserId) return;
            await addSupportNote({
              actorUserId,
              targetType: String(formData.get("targetType") ?? ""),
              targetId: String(formData.get("targetId") ?? ""),
              body: String(formData.get("body") ?? ""),
            });
            revalidatePath("/admin");
          }}
          className="rounded border border-[var(--border)] p-3"
        >
          <h3 className="font-semibold">Support case notes</h3>
          <input name="targetType" placeholder="USER / BUSINESS / REPORT" className="mt-2 w-full rounded border px-3 py-2 text-sm" required />
          <input name="targetId" placeholder="Target ID" className="mt-2 w-full rounded border px-3 py-2 text-sm" required />
          <textarea name="body" placeholder="Internal note" className="mt-2 w-full rounded border px-3 py-2 text-sm" required />
          <button className="mt-2 rounded bg-slate-900 px-3 py-2 text-sm text-white" type="submit">
            Add note
          </button>
        </form>

        <form
          action={async (formData) => {
            "use server";
            const actorUserId = await requireAdminAction();
            if (!actorUserId) return;
            await queueWebhookReplay({
              actorUserId,
              provider: String(formData.get("provider") ?? ""),
              eventId: String(formData.get("eventId") ?? ""),
              payloadSummary: String(formData.get("payloadSummary") ?? "") || null,
            });
            revalidatePath("/admin");
          }}
          className="rounded border border-[var(--border)] p-3"
        >
          <h3 className="font-semibold">Webhook replay console</h3>
          <input name="provider" placeholder="STRIPE / NEON / R2" className="mt-2 w-full rounded border px-3 py-2 text-sm" required />
          <input name="eventId" placeholder="Provider event ID" className="mt-2 w-full rounded border px-3 py-2 text-sm" required />
          <input name="payloadSummary" placeholder="Safe summary only" className="mt-2 w-full rounded border px-3 py-2 text-sm" />
          <button className="mt-2 rounded bg-slate-900 px-3 py-2 text-sm text-white" type="submit">
            Queue replay
          </button>
        </form>

        <form
          action={async (formData) => {
            "use server";
            const actorUserId = await requireAdminAction();
            if (!actorUserId) return;
            await createDataPrivacyRequest({
              actorUserId,
              requesterId: String(formData.get("requesterId") ?? "") || null,
              requesterEmail: String(formData.get("requesterEmail") ?? "") || null,
              requestType: String(formData.get("requestType") ?? ""),
              notes: String(formData.get("notes") ?? "") || null,
            });
            revalidatePath("/admin");
          }}
          className="rounded border border-[var(--border)] p-3"
        >
          <h3 className="font-semibold">Data export/deletion workflow</h3>
          <input name="requesterId" placeholder="Optional user ID" className="mt-2 w-full rounded border px-3 py-2 text-sm" />
          <input name="requesterEmail" placeholder="Optional email" className="mt-2 w-full rounded border px-3 py-2 text-sm" />
          <select name="requestType" className="mt-2 w-full rounded border px-3 py-2 text-sm">
            <option value="EXPORT">Export</option>
            <option value="DELETION">Deletion</option>
            <option value="CORRECTION">Correction</option>
          </select>
          <input name="notes" placeholder="Notes" className="mt-2 w-full rounded border px-3 py-2 text-sm" />
          <button className="mt-2 rounded bg-slate-900 px-3 py-2 text-sm text-white" type="submit">
            Track request
          </button>
        </form>
      </div>

      <div className="rounded border border-[var(--border)] p-3">
        <h3 className="font-semibold">View as role preview</h3>
        <form action="/admin" method="get" className="mt-2 flex flex-wrap gap-2">
          <select name="previewRole" defaultValue={props.previewRole} className="rounded border px-3 py-2 text-sm">
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
          <button className="rounded border border-[var(--border)] px-3 py-2 text-sm" type="submit">
            Preview capabilities
          </button>
        </form>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {previewCapabilities(props.previewRole).map((item) => (
            <p key={item} className="rounded bg-[#0e1524] px-3 py-2 text-sm text-slate-300">
              {item}
            </p>
          ))}
        </div>
      </div>

      <div className="grid gap-3 text-xs text-slate-400 md:grid-cols-4">
        <QueueList title="Support notes" rows={props.supportNotes} />
        <QueueList title="Webhook replays" rows={props.webhookReplays} />
        <QueueList title="Data requests" rows={props.dataRequests} />
        <QueueList title="Throttles" rows={props.throttles} />
      </div>
    </section>
  );
}

function QueueList({ title, rows }: { title: string; rows: QueueRow[] }) {
  return (
    <div className="rounded border border-[var(--border)] p-3">
      <h3 className="font-semibold text-slate-200">{title}</h3>
      <div className="mt-2 space-y-1">
        {rows.map((row) => (
          <p key={row.id} className="rounded bg-[#0e1524] p-2">
            {row.label} | {row.status}
          </p>
        ))}
        {rows.length === 0 ? <p>No records yet.</p> : null}
      </div>
    </div>
  );
}
