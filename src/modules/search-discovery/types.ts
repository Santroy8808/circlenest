export type SearchResultKind =
  | "people"
  | "groups"
  | "market"
  | "jobs"
  | "auditors"
  | "writers"
  | "posts";

export type SearchResultItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  href: string;
  badge: string;
  meta?: string | null;
  imageUrl?: string | null;
};

export type SearchResultGroup = {
  kind: SearchResultKind;
  title: string;
  items: SearchResultItem[];
};

export type SearchView = {
  query: string;
  groups: SearchResultGroup[];
  total: number;
};
