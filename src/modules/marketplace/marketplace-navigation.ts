import type { MarketplaceListingKind } from "./marketplace.contracts";

export type MarketplaceNavigationQuery = {
  category?: string;
  kind?: MarketplaceListingKind;
  q?: string;
};

export type MarketplaceNavigationItem = {
  children?: readonly MarketplaceNavigationItem[];
  href?: string;
  id: string;
  label: string;
  query?: MarketplaceNavigationQuery;
};

export const MARKETPLACE_NAVIGATION: readonly MarketplaceNavigationItem[] = [
  {
    id: "buy",
    label: "Buy",
    children: [
      {
        id: "furniture",
        label: "Furniture",
        query: { kind: "GOODS", category: "Furniture & Equipment" },
        children: [
          { id: "office-furniture", label: "Office", query: { kind: "GOODS", category: "Furniture & Equipment", q: "office" } },
          { id: "bedroom-furniture", label: "Bedroom", query: { kind: "GOODS", category: "Furniture & Equipment", q: "bedroom" } },
          { id: "living-furniture", label: "Living & dining", query: { kind: "GOODS", category: "Furniture & Equipment", q: "living dining" } },
          { id: "custom-furniture", label: "Custom", query: { kind: "GOODS", category: "Furniture & Equipment", q: "custom" } },
        ],
      },
      {
        id: "vehicles",
        label: "Vehicles",
        query: { kind: "VEHICLE" },
        children: [
          { id: "cars", label: "Cars", query: { kind: "VEHICLE", category: "Cars & Trucks", q: "car" } },
          { id: "trucks", label: "Trucks", query: { kind: "VEHICLE", category: "Cars & Trucks", q: "truck" } },
          { id: "motorcycles", label: "Motorcycles", query: { kind: "VEHICLE", category: "Motorcycles" } },
          { id: "bicycles", label: "Bicycles", query: { kind: "VEHICLE", q: "bicycle" } },
        ],
      },
      {
        id: "clothing",
        label: "Clothing",
        query: { kind: "GOODS", category: "Clothing" },
        children: [
          { id: "womens-clothing", label: "Women", query: { kind: "GOODS", category: "Clothing", q: "women" } },
          { id: "mens-clothing", label: "Men", query: { kind: "GOODS", category: "Clothing", q: "men" } },
          { id: "kids-clothing", label: "Children", query: { kind: "GOODS", category: "Clothing", q: "children" } },
        ],
      },
      {
        id: "electronics",
        label: "Electronics",
        query: { kind: "GOODS", category: "Electronics & Appliances" },
        children: [
          { id: "computers", label: "Computers", query: { kind: "GOODS", category: "Electronics & Appliances", q: "computer" } },
          { id: "phones", label: "Phones", query: { kind: "GOODS", category: "Electronics & Appliances", q: "phone" } },
          { id: "appliances", label: "Appliances", query: { kind: "GOODS", category: "Electronics & Appliances", q: "appliance" } },
        ],
      },
    ],
  },
  {
    id: "services",
    label: "Services",
    children: [
      { id: "home-services", label: "Home & construction", query: { kind: "SERVICE", category: "Home Services" } },
      { id: "technology", label: "Technology", query: { kind: "SERVICE", category: "Technology" } },
      { id: "consulting", label: "Consulting", query: { kind: "SERVICE", category: "Professional Services" } },
      { id: "marketing", label: "Marketing", query: { kind: "SERVICE", category: "Business Services", q: "marketing" } },
      { id: "auditors", label: "Auditors", query: { kind: "AUDITOR" } },
    ],
  },
  {
    id: "rentals",
    label: "Rentals",
    children: [
      { id: "apartments", label: "Apartments", query: { kind: "RENTAL", category: "Apartments" } },
      { id: "houses", label: "Houses", query: { kind: "RENTAL", category: "Houses" } },
      { id: "rooms", label: "Rooms", query: { kind: "RENTAL", category: "Rooms" } },
      { id: "short-term", label: "Short-term stays", query: { kind: "RENTAL", category: "Short-term" } },
      { id: "vehicle-rentals", label: "Vehicle rentals", query: { kind: "VEHICLE", q: "rental" } },
    ],
  },
  {
    id: "find",
    label: "Find",
    children: [
      { id: "find-people", label: "People", href: "/people" },
      { id: "find-groups", label: "Groups", href: "/groups" },
      { id: "find-businesses", label: "Businesses", query: { kind: "SERVICE", category: "Business Services" } },
      { id: "find-directory", label: "Church & auditor directory", href: "/auditors" },
    ],
  },
  {
    id: "business",
    label: "Business",
    children: [
      { id: "find-job", label: "Find a job", query: { kind: "JOB" } },
      { id: "b2b", label: "B2B listings", query: { kind: "SERVICE", category: "Business Services" } },
    ],
  },
];
