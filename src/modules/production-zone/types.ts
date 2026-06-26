export type ProductionZoneCard = {
  title: string;
  description: string;
  href: string;
  featureKey?: string;
  badge: "Browse" | "Create" | "Business" | "Org" | "Blueprint";
  available: boolean;
  reason?: string;
};

export type ProductionZoneView = {
  tierName: string;
  browseCards: ProductionZoneCard[];
  creatorCards: ProductionZoneCard[];
  businessCards: ProductionZoneCard[];
  futureCards: ProductionZoneCard[];
};
