import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { listRegisteredFeatureFlags } from "@/modules/feature-flags/feature-flags.service";
import { listFeedPostsPage } from "@/modules/feed-stream/feed-stream.service";
import { safeListMyPics } from "@/modules/gallery-media-storage/gallery-media-storage.service";
import { listGroupsPage } from "@/modules/groups/groups.service";
import { viewerCanCreateJob, safeListJobListings } from "@/modules/jobs/jobs.service";
import { getMarketCreateState, safeListMarketListings } from "@/modules/market/market.service";
import { getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";
import { safeListChatThreads } from "@/modules/chat-messages/chat-messages.service";
import { getBusinessCenterView } from "@/modules/business-storefront/business-storefront.service";
import {
  createDefaultDashboardConfiguration,
  dashboardConfigurationSchema,
  type DashboardConfiguration,
  type DashboardWidgetKey,
  normalizeDashboardConfiguration
} from "@/modules/dashboard/types";

const MODULE_KEY = "dashboard";
const PROFILE_DASHBOARD_KEY = "dashboard";

type JsonRecord = Record<string, unknown>;

export type DashboardAvailabilityContext = {
  features: Record<string, boolean>;
  platformFeatures: Record<string, boolean>;
};

export type DashboardSettings = {
  availableWidgets: DashboardWidgetKey[];
  configuration: DashboardConfiguration;
};

export type DashboardWidgetResult =
  | {
      widget: "market";
      status: "ready";
      listings: Awaited<ReturnType<typeof safeListMarketListings>>;
      viewerCanCreate: boolean;
    }
  | {
      widget: "jobs";
      status: "ready";
      listings: Awaited<ReturnType<typeof safeListJobListings>>;
      viewerCanCreate: boolean;
    }
  | {
      widget: "messages";
      status: "ready";
      threads: Awaited<ReturnType<typeof safeListChatThreads>>;
    }
  | {
      widget: "stream";
      status: "ready";
      posts: Awaited<ReturnType<typeof listFeedPostsPage>>["items"];
    }
  | {
      widget: "groups";
      status: "ready";
      groups: Awaited<ReturnType<typeof listGroupsPage>>["groups"];
    }
  | {
      widget: "gallery";
      status: "ready";
      assets: Awaited<ReturnType<typeof safeListMyPics>>;
    }
  | {
      widget: "business";
      status: "ready";
      business: Awaited<ReturnType<typeof getBusinessCenterView>>;
    }
  | {
      widget: DashboardWidgetKey;
      status: "error";
    };

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dashboardConfigFromTheme(theme: unknown) {
  return isRecord(theme) ? theme[PROFILE_DASHBOARD_KEY] : undefined;
}

function themeWithDashboard(theme: unknown, configuration: DashboardConfiguration): Prisma.InputJsonObject {
  return {
    ...(isRecord(theme) ? theme : {}),
    [PROFILE_DASHBOARD_KEY]: configuration
  } as unknown as Prisma.InputJsonObject;
}

export function buildDashboardAvailableWidgets(context: DashboardAvailabilityContext): DashboardWidgetKey[] {
  const widgets: DashboardWidgetKey[] = ["stream"];

  if (context.platformFeatures["marketplace.member_market"] !== false && context.features["market.browse"] !== false) {
    widgets.unshift("market");
  }
  if (context.features["jobs.browse"] === true) widgets.splice(Math.min(1, widgets.length), 0, "jobs");
  if (context.platformFeatures["communication.direct_messages"] !== false) widgets.push("messages");
  if (context.platformFeatures["community.groups"] !== false) widgets.push("groups");
  if (context.platformFeatures["media.personal_gallery"] !== false) widgets.push("gallery");
  if (context.features["market.storefront"] === true || context.features["org.profile"] === true) widgets.push("business");

  return [...new Set(widgets)];
}

async function getDashboardAvailabilityContext(userId: string): Promise<DashboardAvailabilityContext> {
  const [policy, flags] = await Promise.all([
    getEffectivePolicyForUser(userId),
    listRegisteredFeatureFlags()
  ]);

  return {
    features: policy?.features ?? {},
    platformFeatures: Object.fromEntries(flags.map((flag) => [flag.key, flag.enabled]))
  };
}

export async function getDashboardSettings(userId: string): Promise<DashboardSettings> {
  const [profile, context] = await Promise.all([
    prisma.profile.findUnique({ where: { userId }, select: { theme: true } }),
    getDashboardAvailabilityContext(userId)
  ]);
  const availableWidgets = buildDashboardAvailableWidgets(context);

  return {
    availableWidgets,
    configuration: normalizeDashboardConfiguration(dashboardConfigFromTheme(profile?.theme), availableWidgets)
  };
}

export async function saveDashboardConfiguration(userId: string, input: unknown) {
  const parsed = dashboardConfigurationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Choose a valid dashboard layout." };
  }

  const [settings, profile] = await Promise.all([
    getDashboardSettings(userId),
    prisma.profile.findUnique({ where: { userId }, select: { theme: true } })
  ]);
  const configuration = normalizeDashboardConfiguration(parsed.data, settings.availableWidgets);

  await prisma.profile.upsert({
    where: { userId },
    update: { theme: themeWithDashboard(profile?.theme, configuration) },
    create: { userId, theme: { [PROFILE_DASHBOARD_KEY]: configuration } }
  });

  await diagnostics.info(MODULE_KEY, "Dashboard configuration updated.", { userId, configuration });
  return { ok: true as const, availableWidgets: settings.availableWidgets, configuration };
}

export async function resetDashboardConfiguration(userId: string) {
  const [settings, profile] = await Promise.all([
    getDashboardSettings(userId),
    prisma.profile.findUnique({ where: { userId }, select: { theme: true } })
  ]);
  const configuration = createDefaultDashboardConfiguration(settings.availableWidgets);

  await prisma.profile.upsert({
    where: { userId },
    update: { theme: themeWithDashboard(profile?.theme, configuration) },
    create: { userId, theme: { [PROFILE_DASHBOARD_KEY]: configuration } }
  });

  await diagnostics.info(MODULE_KEY, "Dashboard configuration reset.", { userId });
  return { ok: true as const, availableWidgets: settings.availableWidgets, configuration };
}

async function loadWidget<T extends DashboardWidgetKey>(widget: T, load: () => Promise<DashboardWidgetResult>) {
  try {
    return await load();
  } catch (error) {
    await diagnostics.warn(MODULE_KEY, "Dashboard widget could not load.", {
      widget,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { widget, status: "error" } as DashboardWidgetResult;
  }
}

export async function loadDashboardWidgetResults(input: {
  userId: string;
  actorUserId: string;
  widgets: readonly DashboardWidgetKey[];
}) {
  const widgets = [...new Set(input.widgets)];
  const results = await Promise.all(
    widgets.map(async (widget): Promise<DashboardWidgetResult> => {
      switch (widget) {
        case "market":
          return loadWidget(widget, async () => {
            const [listings, createState] = await Promise.all([
              safeListMarketListings(),
              getMarketCreateState(input.actorUserId)
            ]);
            return { widget, status: "ready", listings: listings.slice(0, 3), viewerCanCreate: createState.viewerCanCreate };
          });
        case "jobs":
          return loadWidget(widget, async () => {
            const [listings, viewerCanCreate] = await Promise.all([
              safeListJobListings(),
              viewerCanCreateJob(input.actorUserId)
            ]);
            return { widget, status: "ready", listings: listings.slice(0, 3), viewerCanCreate };
          });
        case "messages":
          return loadWidget(widget, async () => ({
            widget,
            status: "ready",
            threads: (await safeListChatThreads(input.actorUserId)).slice(0, 4)
          }));
        case "stream":
          return loadWidget(widget, async () => ({
            widget,
            status: "ready",
            posts: (await listFeedPostsPage({ limit: 4 }, input.actorUserId)).items.slice(0, 4)
          }));
        case "groups":
          return loadWidget(widget, async () => ({
            widget,
            status: "ready",
            groups: (await listGroupsPage({ viewerUserId: input.actorUserId, mode: "joined" })).groups.slice(0, 4)
          }));
        case "gallery":
          return loadWidget(widget, async () => ({
            widget,
            status: "ready",
            assets: (await safeListMyPics(input.actorUserId, 6)).slice(0, 6)
          }));
        case "business":
          return loadWidget(widget, async () => ({
            widget,
            status: "ready",
            business: await getBusinessCenterView(input.userId)
          }));
      }
    })
  );

  return new Map(results.map((result) => [result.widget, result]));
}
