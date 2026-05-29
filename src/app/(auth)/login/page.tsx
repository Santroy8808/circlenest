import { redirect } from "next/navigation";

export default function LoginAliasPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(raw)) {
      for (const value of raw) query.append(key, value);
    } else if (typeof raw === "string") {
      query.set(key, raw);
    }
  }
  const suffix = query.toString();
  redirect(suffix ? `/?${suffix}` : "/");
}

