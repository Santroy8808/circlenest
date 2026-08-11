import { z } from "zod";

export const dashboardWidgetKeys = [
  "market",
  "jobs",
  "messages",
  "stream",
  "groups",
  "gallery",
  "business"
] as const;

export const dashboardLayoutModes = ["quad", "stacked", "split", "single"] as const;
export const dashboardSlotIds = ["a", "b", "c", "d"] as const;

export type DashboardWidgetKey = (typeof dashboardWidgetKeys)[number];
export type DashboardLayoutMode = (typeof dashboardLayoutModes)[number];
export type DashboardSlotId = (typeof dashboardSlotIds)[number];

export type DashboardSlot = {
  id: DashboardSlotId;
  widget: DashboardWidgetKey;
};

export type DashboardConfiguration = {
  version: 1;
  layout: DashboardLayoutMode;
  primarySlot: DashboardSlotId;
  slots: DashboardSlot[];
};

const dashboardWidgetKeySchema = z.enum(dashboardWidgetKeys);
const dashboardLayoutModeSchema = z.enum(dashboardLayoutModes);
const dashboardSlotIdSchema = z.enum(dashboardSlotIds);

export const dashboardConfigurationSchema = z.object({
  version: z.literal(1),
  layout: dashboardLayoutModeSchema,
  primarySlot: dashboardSlotIdSchema,
  slots: z.array(z.object({
    id: dashboardSlotIdSchema,
    widget: dashboardWidgetKeySchema
  })).length(dashboardSlotIds.length)
});

const defaultWidgetOrder: DashboardWidgetKey[] = ["market", "jobs", "messages", "stream"];

function isDashboardWidgetKey(value: unknown): value is DashboardWidgetKey {
  return typeof value === "string" && dashboardWidgetKeys.includes(value as DashboardWidgetKey);
}

function normalizeAvailableWidgets(availableWidgets: readonly DashboardWidgetKey[]): DashboardWidgetKey[] {
  const unique = [...new Set<DashboardWidgetKey>(availableWidgets.filter(isDashboardWidgetKey))];
  return unique.length > 0 ? unique : ["stream"];
}

function selectFallbackWidget(availableWidgets: DashboardWidgetKey[], usedWidgets: Set<DashboardWidgetKey>, preferred?: DashboardWidgetKey) {
  if (preferred && availableWidgets.includes(preferred) && !usedWidgets.has(preferred)) return preferred;
  return availableWidgets.find((widget) => !usedWidgets.has(widget)) ?? availableWidgets[0] ?? "stream";
}

export function createDefaultDashboardConfiguration(availableWidgets: readonly DashboardWidgetKey[] = dashboardWidgetKeys): DashboardConfiguration {
  const normalizedAvailable = normalizeAvailableWidgets(availableWidgets);
  const usedWidgets = new Set<DashboardWidgetKey>();
  const slots = dashboardSlotIds.map((id, index) => {
    const widget = selectFallbackWidget(normalizedAvailable, usedWidgets, defaultWidgetOrder[index]);
    usedWidgets.add(widget);
    return { id, widget };
  });

  return {
    version: 1,
    layout: "quad",
    primarySlot: "a",
    slots
  };
}

export function normalizeDashboardConfiguration(
  value: unknown,
  availableWidgets: readonly DashboardWidgetKey[] = dashboardWidgetKeys
): DashboardConfiguration {
  const fallback = createDefaultDashboardConfiguration(availableWidgets);
  const parsed = dashboardConfigurationSchema.safeParse(value);
  if (!parsed.success) return fallback;

  const normalizedAvailable = normalizeAvailableWidgets(availableWidgets);
  const slotsById = new Map(parsed.data.slots.map((slot) => [slot.id, slot]));
  const usedWidgets = new Set<DashboardWidgetKey>();
  const slots = dashboardSlotIds.map((id, index) => {
    const stored = slotsById.get(id);
    const preferred = stored?.widget;
    const widget = selectFallbackWidget(normalizedAvailable, usedWidgets, preferred ?? fallback.slots[index]?.widget);
    usedWidgets.add(widget);
    return { id, widget };
  });

  const primarySlot = dashboardSlotIds.includes(parsed.data.primarySlot)
    ? parsed.data.primarySlot
    : "a";

  return {
    version: 1,
    layout: parsed.data.layout,
    primarySlot,
    slots
  };
}

export function dashboardVisibleSlots(configuration: DashboardConfiguration) {
  if (configuration.layout === "quad") return configuration.slots;
  if (configuration.layout === "single") {
    return configuration.slots.filter((slot) => slot.id === configuration.primarySlot);
  }
  return configuration.slots.slice(0, 2);
}
