import { z } from "zod";

import type { MarketplaceIntent, MarketplaceListingKind } from "./marketplace.contracts";

export type MarketplaceTemplateFieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "date";

export interface MarketplaceTemplateField {
  key: string;
  label: string;
  type: MarketplaceTemplateFieldType;
  requiredFor?: MarketplaceIntent[];
  options?: readonly string[];
  unitOptions?: readonly string[];
  help?: string;
}

export interface MarketplaceTemplateDefinition {
  version: 1;
  kind: MarketplaceListingKind;
  label: string;
  categories: readonly string[];
  fields: readonly MarketplaceTemplateField[];
}

const text = (max: number) => z.string().trim().max(max).optional().nullable();
const nonnegative = z.number().nonnegative().optional().nullable();

const goodsAttributesSchema = z.object({
  brand: text(100),
  model: text(100),
  quantity: z.number().int().positive().max(100_000).optional().nullable(),
  age: text(80),
  includedParts: text(1_000),
  missingParts: text(1_000),
  material: text(100),
  color: text(80),
  assembled: z.boolean().optional().nullable(),
  length: nonnegative,
  width: nonnegative,
  height: nonnegative,
  dimensionUnit: z.enum(["in", "ft", "cm", "m"]).optional().nullable(),
  weight: nonnegative,
  weightUnit: z.enum(["oz", "lb", "g", "kg"]).optional().nullable(),
  warranty: text(300),
  defects: text(1_000),
  regulatedCategory: z.enum(["none", "firearm", "ammunition", "medical", "hazardous", "other"]).default("none"),
  legalComplianceAttested: z.boolean().default(false),
});

const vehicleAttributesSchema = z.object({
  year: z.number().int().min(1886).max(2200).optional().nullable(),
  make: text(80),
  model: text(80),
  trim: text(80),
  bodyStyle: text(60),
  mileage: nonnegative,
  mileageUnit: z.enum(["mi", "km"]).default("mi"),
  transmission: text(60),
  fuelType: text(60),
  drivetrain: text(60),
  engine: text(100),
  exteriorColor: text(60),
  interiorColor: text(60),
  vin: text(40),
  showVin: z.boolean().default(false),
  titleStatus: text(80),
  lienStatus: text(80),
  accidentHistory: text(1_000),
  serviceHistory: text(1_000),
  features: z.array(z.string().trim().max(80)).max(40).default([]),
  sellerType: z.enum(["private", "dealer", "organization"]).default("private"),
});

const rentalAttributesSchema = z.object({
  propertyType: z.enum(["apartment", "house", "room", "short-term", "commercial", "land", "other"]),
  rentCadence: z.enum(["week", "month", "term"]).default("month"),
  depositCents: z.number().int().nonnegative().optional().nullable(),
  bedrooms: nonnegative,
  bathrooms: nonnegative,
  area: nonnegative,
  areaUnit: z.enum(["sqft", "sqm"]).default("sqft"),
  availableDate: text(40),
  leaseTerm: text(100),
  furnished: z.boolean().optional().nullable(),
  pets: text(200),
  parking: text(200),
  utilities: text(500),
  amenities: z.array(z.string().trim().max(80)).max(40).default([]),
  accessibility: text(500),
  listerType: z.enum(["owner", "agent", "manager", "wanted"]).default("owner"),
  viewingMethod: text(300),
});

const serviceAttributesSchema = z.object({
  serviceArea: text(300),
  deliveryMode: z.enum(["remote", "on-site", "both"]).optional().nullable(),
  pricingModel: z.enum(["hourly", "fixed", "package", "quote", "free"]).optional().nullable(),
  availability: text(500),
  turnaround: text(200),
  credentials: text(1_000),
  licenseAttested: z.boolean().default(false),
  portfolioUrl: z.string().url().max(500).optional().nullable(),
  quoteRequirements: text(1_000),
});

const jobAttributesSchema = z.object({
  companyName: text(160),
  workArrangement: z.enum(["on-site", "hybrid", "remote"]).optional().nullable(),
  employmentType: z.enum(["full-time", "part-time", "contract", "temporary", "volunteer", "internship"]).optional().nullable(),
  compensationPeriod: z.enum(["hour", "day", "week", "month", "year", "project"]).optional().nullable(),
  schedule: text(500),
  responsibilities: text(4_000),
  requirements: text(4_000),
  preferences: text(2_000),
  benefits: text(2_000),
  startDate: text(40),
  applicationDeadline: text(40),
  applicationMethod: text(500),
  screenerQuestions: z.array(z.string().trim().max(300)).max(10).default([]),
  candidateSkills: z.array(z.string().trim().max(100)).max(40).default([]),
  candidateExperience: text(3_000),
  resumeMediaAssetId: z.string().cuid().optional().nullable(),
});

const auditorAttributesSchema = z.object({
  directoryKind: z.enum(["field-auditor", "field-group", "class-v", "sh-ao", "flag", "other"]),
  services: z.array(z.string().trim().max(120)).min(1).max(40),
  travelAvailable: z.boolean().default(false),
  remoteAvailable: z.boolean().default(false),
  languages: z.array(z.string().trim().max(60)).max(20).default([]),
  availability: text(500),
  rates: text(500),
  qualifications: text(2_000),
  qualificationsAttested: z.boolean().default(false),
  practiceOrOrganization: text(160),
});

export const MARKETPLACE_ATTRIBUTE_SCHEMAS = {
  GOODS: goodsAttributesSchema,
  VEHICLE: vehicleAttributesSchema,
  RENTAL: rentalAttributesSchema,
  SERVICE: serviceAttributesSchema,
  JOB: jobAttributesSchema,
  AUDITOR: auditorAttributesSchema,
} satisfies Record<MarketplaceListingKind, z.ZodTypeAny>;

export const MARKETPLACE_TEMPLATES: Record<MarketplaceListingKind, MarketplaceTemplateDefinition> = {
  GOODS: {
    version: 1,
    kind: "GOODS",
    label: "Items",
    categories: ["General", "Furniture & Equipment", "Electronics & Appliances", "Books & Media", "Clothing", "Home & Garden", "Event Supplies", "Other"],
    fields: [
      { key: "brand", label: "Brand", type: "text" },
      { key: "model", label: "Model", type: "text" },
      { key: "quantity", label: "Quantity", type: "number" },
      { key: "includedParts", label: "Included", type: "textarea" },
      { key: "missingParts", label: "Missing or damaged", type: "textarea" },
      { key: "dimensions", label: "Dimensions", type: "number", unitOptions: ["in", "ft", "cm", "m"] },
      { key: "weight", label: "Weight", type: "number", unitOptions: ["oz", "lb", "g", "kg"] },
    ],
  },
  VEHICLE: {
    version: 1,
    kind: "VEHICLE",
    label: "Vehicles",
    categories: ["Cars & Trucks", "Motorcycles", "Recreational", "Commercial", "Parts", "Other"],
    fields: [
      { key: "year", label: "Year", type: "number", requiredFor: ["OFFER"] },
      { key: "make", label: "Make", type: "text", requiredFor: ["OFFER"] },
      { key: "model", label: "Model", type: "text", requiredFor: ["OFFER"] },
      { key: "mileage", label: "Mileage", type: "number", requiredFor: ["OFFER"] },
      { key: "transmission", label: "Transmission", type: "text" },
      { key: "fuelType", label: "Fuel type", type: "text" },
      { key: "titleStatus", label: "Title status", type: "text" },
      { key: "serviceHistory", label: "Service history", type: "textarea" },
    ],
  },
  RENTAL: {
    version: 1,
    kind: "RENTAL",
    label: "Rentals",
    categories: ["Apartments", "Houses", "Rooms", "Short-term", "Commercial", "Land", "Housing wanted"],
    fields: [
      { key: "propertyType", label: "Property type", type: "select", requiredFor: ["OFFER", "WANTED"] },
      { key: "bedrooms", label: "Bedrooms", type: "number" },
      { key: "bathrooms", label: "Bathrooms", type: "number" },
      { key: "area", label: "Area", type: "number", unitOptions: ["sqft", "sqm"] },
      { key: "availableDate", label: "Available", type: "date" },
      { key: "leaseTerm", label: "Lease term", type: "text" },
      { key: "amenities", label: "Amenities", type: "multiselect" },
      { key: "viewingMethod", label: "Viewing arrangements", type: "textarea" },
    ],
  },
  SERVICE: {
    version: 1,
    kind: "SERVICE",
    label: "Services",
    categories: ["Home Services", "Professional Services", "Business Services", "Technology", "Creative", "Transport", "Education", "Events", "Other"],
    fields: [
      { key: "serviceArea", label: "Service area", type: "text" },
      { key: "deliveryMode", label: "Delivery mode", type: "select" },
      { key: "pricingModel", label: "Pricing model", type: "select" },
      { key: "availability", label: "Availability", type: "textarea" },
      { key: "turnaround", label: "Turnaround", type: "text" },
      { key: "credentials", label: "Credentials", type: "textarea" },
      { key: "portfolioUrl", label: "Portfolio", type: "text" },
    ],
  },
  JOB: {
    version: 1,
    kind: "JOB",
    label: "Jobs",
    categories: ["Administration", "Technical", "Sales", "Delivery", "Creative", "Professional Services", "Hospitality", "Construction", "Other"],
    fields: [
      { key: "companyName", label: "Company", type: "text", requiredFor: ["OFFER"] },
      { key: "workArrangement", label: "Work arrangement", type: "select" },
      { key: "employmentType", label: "Employment type", type: "select" },
      { key: "compensationPeriod", label: "Pay period", type: "select" },
      { key: "responsibilities", label: "Responsibilities", type: "textarea", requiredFor: ["OFFER"] },
      { key: "requirements", label: "Requirements", type: "textarea" },
      { key: "benefits", label: "Benefits", type: "textarea" },
      { key: "candidateSkills", label: "Skills", type: "multiselect", requiredFor: ["WANTED"] },
    ],
  },
  AUDITOR: {
    version: 1,
    kind: "AUDITOR",
    label: "Auditing",
    categories: ["Field Auditors", "Field Groups", "Class V Orgs", "SH/AO", "FLAG", "Auditing wanted"],
    fields: [
      { key: "directoryKind", label: "Provider type", type: "select", requiredFor: ["OFFER", "WANTED"] },
      { key: "services", label: "Services", type: "multiselect", requiredFor: ["OFFER", "WANTED"] },
      { key: "travelAvailable", label: "Travel available", type: "boolean" },
      { key: "remoteAvailable", label: "Remote available", type: "boolean" },
      { key: "languages", label: "Languages", type: "multiselect" },
      { key: "availability", label: "Availability", type: "textarea" },
      { key: "qualifications", label: "Qualifications", type: "textarea" },
    ],
  },
};

export function parseMarketplaceAttributes(kind: MarketplaceListingKind, attributes: unknown) {
  return MARKETPLACE_ATTRIBUTE_SCHEMAS[kind].parse(attributes);
}
