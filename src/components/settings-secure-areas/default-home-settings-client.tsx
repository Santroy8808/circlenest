"use client";

import { useState, useTransition } from "react";
import type {
  DefaultHomeKey,
  DefaultHomeOption
} from "@/modules/home-preferences/default-home-preferences.service";

export function DefaultHomeSettingsClient({
  initialOptions,
  initialSelected
}: {
  initialOptions: DefaultHomeOption[];
  initialSelected: DefaultHomeOption;
}) {
  const [options, setOptions] = useState(initialOptions);
  const [selectedKey, setSelectedKey] = useState<DefaultHomeKey>(initialSelected.key);
  const [savedKey, setSavedKey] = useState<DefaultHomeKey>(initialSelected.key);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function saveDefaultHome(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/preferences/default-home", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultHome: selectedKey })
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        options?: DefaultHomeOption[];
        selected?: DefaultHomeOption;
      } | null;

      if (!response.ok || !payload?.selected) {
        setError(payload?.error ?? "Could not update your default home page.");
        return;
      }

      setOptions(payload.options ?? options);
      setSelectedKey(payload.selected.key);
      setSavedKey(payload.selected.key);
      setMessage(`Default home page saved: ${payload.selected.label}.`);
    });
  }

  return (
    <form className="grid gap-5" onSubmit={saveDefaultHome}>
      <div className="grid gap-3 md:grid-cols-2">
        {options.map((option) => (
          <label className="module-card flex cursor-pointer gap-3 rounded-md p-4" key={option.key}>
            <input
              checked={selectedKey === option.key}
              className="mt-1"
              name="defaultHome"
              onChange={() => setSelectedKey(option.key)}
              type="radio"
            />
            <span>
              <span className="block text-lg font-semibold text-[var(--gold)]">{option.label}</span>
              <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">{option.description}</span>
              <span className="mt-2 block font-mono text-xs text-[var(--muted)]">{option.href}</span>
            </span>
          </label>
        ))}
      </div>
      {message ? <p className="rounded-md border border-emerald-400/40 bg-emerald-950/30 p-3 text-sm text-emerald-100">{message}</p> : null}
      {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
      <button className="btn-primary w-fit" disabled={isPending || selectedKey === savedKey} type="submit">
        {isPending ? "Saving..." : "Save default home"}
      </button>
    </form>
  );
}
