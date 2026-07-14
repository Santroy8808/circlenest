import type { AdminFunctionEntry, AdminWorkflowCategory } from "@/modules/admin-moderation/admin-workflows";

export type AdminHatDefinition = {
  term: string;
  definition: string;
};

export type AdminHatFigure = {
  title: string;
  caption: string;
  callouts: string[];
};

export type AdminHatFunctionGuide = AdminFunctionEntry & {
  whenToUse: string;
  beforeYouStart: string[];
  cautions: string[];
  expectedResult: string;
  figure: AdminHatFigure;
};

export type AdminHatWorkflowGuide = {
  key: string;
  href: string;
  title: string;
  eyebrow: string;
  description: string;
  groups: Array<{
    key: string;
    title: string;
    description: string;
    entries: AdminHatFunctionGuide[];
  }>;
};

export type AdminHatManual = {
  definitions: AdminHatDefinition[];
  operatingRules: string[];
  dashboardSurfaces: Array<{
    title: string;
    href: string;
    purpose: string;
    useWhen: string;
    cautions: string[];
    figure: AdminHatFigure;
  }>;
  workflows: AdminHatWorkflowGuide[];
};

const defaultFunctionDetails = {
  whenToUse: "Use this when the admin function title matches the work being done and the target account, object, or setting is already understood.",
  beforeYouStart: ["Confirm you are acting on the correct user, object, tier, or platform setting.", "Write a clear audit reason before submitting any change."],
  cautions: ["Do not use admin tools to bypass normal user-facing policy unless the reason is documented.", "Avoid changing multiple unrelated things in a single admin action."],
  expectedResult: "The tool completes the requested admin action and writes an audit trail when the operation changes platform state."
};

const functionDetailsByTitle: Record<
  string,
  Partial<Pick<AdminHatFunctionGuide, "whenToUse" | "beforeYouStart" | "cautions" | "expectedResult">>
> = {
  "Search Account": {
    whenToUse: "Use this before any account-scoped action when you only know an email address, username, or display name.",
    beforeYouStart: ["Ask for the exact email or username if the search result is ambiguous.", "Check whether the account is revoked or suspended before making changes."],
    cautions: ["Do not assume two similar usernames are the same person.", "Search is a starting point; it does not by itself change the account."],
    expectedResult: "You identify the correct account and can move to membership, password, invite, credit, or support work."
  },
  "Create Invite": {
    whenToUse: "Use this to give an approved person a one-time path into the invite-only site.",
    beforeYouStart: ["Confirm the invite recipient is intended to receive Free account access.", "Confirm the delivery email address if you plan to email the invite."],
    cautions: ["Do not create bulk invites without a specific launch or admin reason.", "Treat unused invite codes as account access tokens."],
    expectedResult: "The invite code exists, can be copied or emailed, and can be reviewed later from Launch Access."
  },
  "Create Account": {
    whenToUse: "Use this when an admin needs to create a preverified account directly for an approved user.",
    beforeYouStart: ["Confirm username, email, and temporary credential handling.", "Have an audit reason that explains why direct creation is appropriate."],
    cautions: ["Direct account creation bypasses the normal invite acceptance path.", "Do not reuse temporary passwords across accounts."],
    expectedResult: "A preverified user account is created and the action is audited."
  },
  "Membership Management": {
    whenToUse: "Use this to correct a membership tier or to suspend, restore, or permanently delete an account.",
    beforeYouStart: ["Search for the exact account.", "Confirm whether the action is a tier correction, suspension, restoration, or permanent deletion.", "For delete, confirm the warning text and permanent impact."],
    cautions: ["Permanent delete is destructive and should be rare.", "Suspension affects the user's ability to use the platform.", "Changing tier does not process Stripe billing."],
    expectedResult: "The account access state or membership tier changes and a high-risk audit entry is written."
  },
  "Ad Credit Management": {
    whenToUse: "Use this to grant or remove platform-only ad credits for a member.",
    beforeYouStart: ["Find the member account.", "Confirm the number of credits and whether the entry is a grant or removal.", "Write the business reason."],
    cautions: ["Platform credits are not cash refunds.", "Do not alter real-money balances from this tool."],
    expectedResult: "The member credit ledger is updated and the balance change is audited."
  },
  "Account Support": {
    whenToUse: "Use this for password reset and session revocation support.",
    beforeYouStart: ["Verify the account owner through an approved support path.", "Decide whether active sessions should be revoked."],
    cautions: ["Do not disclose whether an email exists to an unverified requester.", "Treat password reset as a security event."],
    expectedResult: "The password is reset or sessions are revoked, with audit history."
  },
  "Account Reports": {
    whenToUse: "Use this to review feedback, bug, abuse, content, and support tickets connected to accounts.",
    beforeYouStart: ["Open the report source page if present.", "Read the latest event history before changing status."],
    cautions: ["Do not close reports without enough notes for another admin to understand the decision.", "Reports may reference people who are not the reporter."],
    expectedResult: "The report is triaged, moved into review, resolved, or left with admin notes."
  },
  "Promotional Grant": {
    whenToUse: "Use this for temporary launch-era access to Contributor or Professional features.",
    beforeYouStart: ["Confirm the target account and duration.", "Confirm whether the grant is Contributor or Professional."],
    cautions: ["Promotional grants expire; they are not permanent paid subscriptions.", "Do not use grants to hide unresolved billing setup."],
    expectedResult: "The account receives temporary access until the selected expiration."
  },
  "Founder Pricing": {
    whenToUse: "Use this to review launch pricing references and founder windows.",
    beforeYouStart: ["Confirm the current launch period and intended public offer language."],
    cautions: ["Changing pricing references can affect user expectations.", "Stripe payment activation remains separate from displayed policy."],
    expectedResult: "Admins understand the current founder pricing and launch caps."
  },
  "Review Active Access": {
    whenToUse: "Use this to inspect active promotional grants and recently generated invite codes.",
    beforeYouStart: ["Know whether you are reviewing a grant, invite, or launch policy item."],
    cautions: ["Review does not automatically revoke access.", "Expired or used invites should not be treated as active access."],
    expectedResult: "Current launch access state is visible for follow-up decisions."
  },
  "Global Tier Permissions": {
    whenToUse: "Use this only when the platform-wide capability matrix needs to change for an entire membership tier.",
    beforeYouStart: ["Confirm the exact capability and tier.", "Understand every downstream feature affected by that permission.", "Have God-level authorization ready if required."],
    cautions: ["This is global; one cell can change access for every user on that tier.", "Do not use this to solve a single user's support issue."],
    expectedResult: "The selected tier capability is updated globally and a critical audit entry is written."
  },
  "Status Change": {
    whenToUse: "Use this to permanently correct an account's membership status.",
    beforeYouStart: ["Search the target account.", "Confirm the desired tier: Free, Contributor, Professional, Auditor, or Org if available."],
    cautions: ["This does not charge or refund the user.", "Do not use status change when a temporary grant is the correct action."],
    expectedResult: "The account membership status changes and the reason is audited."
  },
  "Pricing Rules": {
    whenToUse: "Use this to edit global platform-credit costs for ad and marketplace-related packages.",
    beforeYouStart: ["Know which package or rule is changing.", "Confirm whether the rule should remain active."],
    cautions: ["Pricing changes can affect every future purchase or ad placement.", "Do not change pricing to fix one user's balance."],
    expectedResult: "The selected pricing rule is updated and saved for future platform-credit operations."
  },
  "Member Credits": {
    whenToUse: "Use this when the work is specifically about one member's platform-credit balance.",
    beforeYouStart: ["Find the member account.", "Confirm positive grant or negative removal amount."],
    cautions: ["Use Pricing Rules for global prices; use Member Credits for one member's balance.", "Do not represent platform credits as cash."],
    expectedResult: "A ledger entry changes the member's platform-credit balance."
  },
  "Global Ad Schedule": {
    whenToUse: "Use this after ad demand, timing, or policy changes require same-day schedule recalculation.",
    beforeYouStart: ["Review the latest schedule status.", "Confirm that recalculation should affect the rest of the current platform day."],
    cautions: ["This can affect ad visibility timing for active campaigns.", "It does not skip the next automatic midnight calculation."],
    expectedResult: "Future slots for today are rebuilt and audited."
  },
  "Experience Guardrails": {
    whenToUse: "Use this to review ad density, sponsored-message caps, sender cooldowns, and boost limits.",
    beforeYouStart: ["Know which ad-experience limit you are checking."],
    cautions: ["Guardrails protect user experience; avoid loosening them without a launch policy reason.", "Some values may be review-only until the matching control is implemented."],
    expectedResult: "Admins understand current ad-experience constraints before approving campaigns or policy changes."
  },
  "Stripe Setup": {
    whenToUse: "Use this to configure payment plumbing, webhook readiness, subscription price IDs, and credit package price IDs.",
    beforeYouStart: ["Confirm Stripe mode and keys.", "Have webhook endpoint and price IDs ready.", "Know whether checkout should be enabled."],
    cautions: ["Never paste secrets into public notes or support tickets.", "Sandbox and live Stripe resources must not be mixed.", "Payment configuration affects real checkout."],
    expectedResult: "Stripe readiness, membership prices, webhook status, and credit packages are configured for checkout."
  },
  "Public Announcement": {
    whenToUse: "Use this to publish platform-wide, tier-targeted, role-targeted, or user-targeted notices.",
    beforeYouStart: ["Choose the exact audience.", "Choose delivery channels.", "Draft title, body, and internal reason."],
    cautions: ["Announcements can interrupt users, pin stream content, or queue email depending on channels.", "Keep admin/system wording distinct from normal user posts."],
    expectedResult: "The announcement is delivered through selected channels and recent announcements can be reviewed or dismissed."
  },
  "Reports Queue": {
    whenToUse: "Use this for inbound bug, abuse, content, feedback, and support work.",
    beforeYouStart: ["Open the ticket and source URL if available.", "Check severity and current status."],
    cautions: ["Abuse/content reports may require preserving evidence.", "Do not expose reporter identity unnecessarily."],
    expectedResult: "The ticket receives review status, resolution, or admin notes."
  },
  "Stream Retention": {
    whenToUse: "Use this to review public Stream lifecycle state, place or release admin holds, and export/import full post threads.",
    beforeYouStart: ["Search by exact post ID when possible.", "Decide whether the whole thread and contents must be held.", "Write a reason that explains the hold or release."],
    cautions: ["Admin holds hide the post from normal users but keep it visible to admins.", "Held posts should be treated as preserved evidence or protected review material.", "Exported/imported threads can include user content and should be handled as sensitive admin material."],
    expectedResult: "The selected post is held, released, exported, imported, or processed through the Stream retention policy with an audit trail."
  },
  "Object ID Lookup": {
    whenToUse: "Use this when an admin-visible object ID needs to be resolved to a destination or object type.",
    beforeYouStart: ["Copy the exact ID from the admin-visible UI.", "Check for extra spaces before searching."],
    cautions: ["Partial IDs are unreliable.", "Lookup is read-oriented; use the destination tool for actual moderation or edits."],
    expectedResult: "The matching object type, creation details, and destination are shown when the ID exists."
  },
  "Feature Flags": {
    whenToUse: "Use this to turn risky, incomplete, or staged modules on or off without redeploying.",
    beforeYouStart: ["Know the exact feature key.", "Know whether enabled or disabled is the intended state.", "Write a reason that explains the rollout or rollback."],
    cautions: ["A feature flag can hide or expose unfinished functionality.", "Use stable feature key names; typos create new flags."],
    expectedResult: "The feature flag state is saved and appears in the admin dashboard."
  },
  "Launch Access Hub": {
    whenToUse: "Use this as the central launch operations surface for invites, founder pricing, promo grants, guardrails, and review.",
    beforeYouStart: ["Choose which launch task you are doing before changing anything."],
    cautions: ["Launch hub actions can affect access and public offer behavior.", "Do not combine invite, grant, and pricing work unless the audit reason covers all of it."],
    expectedResult: "The relevant launch access workflow is opened for action or review."
  },
  "Open Admin Hat": {
    whenToUse: "Use this when an administrator needs the operating manual while working.",
    beforeYouStart: ["Open the manual in a second position or resize it so it does not cover the active form."],
    cautions: ["The manual explains admin operation; it does not replace judgment or audit reasons."],
    expectedResult: "The floating manual opens with a table of contents, definitions, links, and function-specific guidance."
  }
};

export const adminHatDefinitions: AdminHatDefinition[] = [
  {
    term: "Admin Hat",
    definition: "The operating manual for administrators. In Theta-Space usage, a hat is a role writeup: what the administrator is responsible for, what each tool means, and how to use it without guessing."
  },
  {
    term: "Administrator",
    definition: "A trusted account with access to Admin Tools. Administrators can review platform state, support users, and perform audited operational changes."
  },
  {
    term: "God",
    definition: "The highest-risk administrator authority used for global capability changes, especially tier permission matrix changes that affect every account on a tier."
  },
  {
    term: "Workflow",
    definition: "A grouped admin subject area, such as Account Management or Ads And Spend. Workflows organize related functions so the administrator starts from the correct operational area."
  },
  {
    term: "Function",
    definition: "A specific admin tool or action page, such as Status Change, Stripe Setup, Reports Queue, or Object ID Lookup."
  },
  {
    term: "Audit Log",
    definition: "A permanent record of admin activity that changed or reviewed important platform state. Audit reasons must be written so another admin can understand the decision later."
  },
  {
    term: "Diagnostic Log",
    definition: "A technical platform signal used to spot errors or operational issues. Diagnostics are not a substitute for audit reasons."
  },
  {
    term: "Feature Flag",
    definition: "A named switch that can enable or disable a feature without redeploying the site. A typo can create a separate flag, so exact keys matter."
  },
  {
    term: "Membership Tier",
    definition: "A user's access level, such as Free, Contributor, Professional, Auditor, or Org where available. Tier policy controls what each level can use."
  },
  {
    term: "Launch Access",
    definition: "Temporary launch-era access operations, including promotional grants, founder pricing review, invites, guardrails, and active access review."
  },
  {
    term: "Platform Credits",
    definition: "Theta-Space internal credits used for ad and promotion features. They are not cash balances and should not be treated as refunds."
  },
  {
    term: "Object ID",
    definition: "A database identifier exposed to admins for exact lookup of posts, listings, ads, chat, media, mail, reports, and related objects."
  },
  {
    term: "Public Announcement",
    definition: "An admin-created notice delivered by selected channels such as login pop-up, pinned stream announcement, chat, mail, or queued personal email."
  },
  {
    term: "Stream Retention",
    definition: "The lifecycle policy for public Stream posts: media is subject to compression after 48 hours without a view, posts are removed from the active Stream after 1 week and kept in archive, and posts are permanently deleted after 3 months unless held."
  },
  {
    term: "Admin Hold",
    definition: "An indefinite administrator hold on a post/thread. Held content is hidden from normal users, visible to admins with a red outline, and excluded from normal retention cleanup until released."
  },
  {
    term: "Suspension",
    definition: "A reversible restriction on an account's platform access. Suspension is different from deletion and should include a clear reason."
  },
  {
    term: "Permanent Delete",
    definition: "A destructive account lifecycle action. It should be used rarely, only after confirmation warnings and a clear audit reason."
  }
];

export const adminHatOperatingRules = [
  "Start from the workflow that matches the job. Do not jump into a high-risk tool just because it is familiar.",
  "Search and verify the exact account or object before changing anything.",
  "Use one admin action for one operational purpose. Separate unrelated changes so the audit trail stays readable.",
  "Every high-risk change needs a clear reason that a future administrator can understand without asking you.",
  "Do not use direct tier, credit, or flag changes to hide missing product functionality. Fix the product issue or document the temporary exception.",
  "Keep payment configuration, platform-credit adjustments, and membership status changes conceptually separate.",
  "If a function says review, treat it as read-oriented unless the UI explicitly offers a mutation button.",
  "For destructive actions, stop and confirm identity, impact, and reason before pressing the final button.",
  "Use Stream Retention holds when public post/thread evidence must be preserved or hidden from normal view. Export before import or restoration work. Content older than 3 months that is not held can be permanently deleted by the retention policy."
];

function figureFor(entry: AdminFunctionEntry): AdminHatFigure {
  return {
    title: `${entry.title} screen reference`,
    caption: "Use the linked button to open the live function. The visual map shows the usual reading order inside the admin screen.",
    callouts: ["Read the page heading and risk note.", "Complete fields from top to bottom.", "Confirm the audit reason before submitting."]
  };
}

function guideFor(entry: AdminFunctionEntry): AdminHatFunctionGuide {
  const details = functionDetailsByTitle[entry.title] ?? {};

  return {
    ...entry,
    whenToUse: details.whenToUse ?? defaultFunctionDetails.whenToUse,
    beforeYouStart: details.beforeYouStart ?? defaultFunctionDetails.beforeYouStart,
    cautions: details.cautions ?? defaultFunctionDetails.cautions,
    expectedResult: details.expectedResult ?? defaultFunctionDetails.expectedResult,
    figure: figureFor(entry)
  };
}

export function buildAdminHatManual(categories: AdminWorkflowCategory[]): AdminHatManual {
  const visibleCategories = categories.filter((category) => category.key !== "admin-hat");

  return {
    definitions: adminHatDefinitions,
    operatingRules: adminHatOperatingRules,
    dashboardSurfaces: [
      {
        title: "Admin Portal search",
        href: "/admin",
        purpose: "Find admin functions by keyword when you know the job but not the workflow.",
        useWhen: "Use this from the Admin Portal before opening a function if the correct tool is not obvious.",
        cautions: ["Search only finds registered admin functions.", "A search result is a navigation helper, not a permission grant."],
        figure: {
          title: "Admin Portal search map",
          caption: "The search box sits above workflow cards and filters function links.",
          callouts: ["Type a job keyword.", "Review matching functions.", "Open the matching tool."]
        }
      },
      {
        title: "Platform Metrics",
        href: "/admin",
        purpose: "Show high-level route and action activity without reading user mail, chat, or post content.",
        useWhen: "Use this for operational awareness and basic traffic sanity checks.",
        cautions: ["Metrics are aggregate signals.", "Do not use metrics as evidence of user misconduct."],
        figure: {
          title: "Metrics panel map",
          caption: "The metrics surface shows active users, page views, actions, and top routes.",
          callouts: ["Check current activity.", "Review top routes.", "Use diagnostics for technical investigation."]
        }
      },
      {
        title: "Recent Audit",
        href: "/admin",
        purpose: "Review recent admin actions and the targets they affected.",
        useWhen: "Use this after a change, during handoff, or when checking what another admin recently did.",
        cautions: ["Recent Audit is a summary; deeper investigation may require database or log review.", "Missing context usually means the audit reason was too weak."],
        figure: {
          title: "Audit panel map",
          caption: "The audit list shows recent admin module/action labels and targets.",
          callouts: ["Read newest first.", "Check target type and ID.", "Use Object ID Lookup for exact destinations."]
        }
      },
      {
        title: "Recent Diagnostics",
        href: "/admin",
        purpose: "Review recent technical errors, warnings, or operational messages.",
        useWhen: "Use this when a user reports a breakage or an admin function does not behave as expected.",
        cautions: ["Diagnostics can be technical and incomplete.", "Do not expose internal errors to users without translating them."],
        figure: {
          title: "Diagnostics panel map",
          caption: "The diagnostics list gives recent platform-level technical signals.",
          callouts: ["Read severity.", "Check module.", "Correlate time with user report."]
        }
      }
    ],
    workflows: visibleCategories.map((category) => ({
      key: category.key,
      href: category.href,
      title: category.title,
      eyebrow: category.eyebrow,
      description: category.description,
      groups: category.groups.map((group) => ({
        key: group.key,
        title: group.title,
        description: group.description,
        entries: group.entries.map(guideFor)
      }))
    }))
  };
}
