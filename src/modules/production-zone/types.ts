export type ProductionZoneCard = {
  title: string;
  description: string;
  href: string;
  badge: "Browse" | "Create" | "Business" | "Blueprint";
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
