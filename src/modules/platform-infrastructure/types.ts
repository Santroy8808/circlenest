export type PlatformModuleDefinition = {
  key: string;
  title: string;
  status: "blueprint" | "in-progress" | "ready";
  purpose: string;
  href: string;
};

