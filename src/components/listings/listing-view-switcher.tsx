"use client";

import { useTransition } from "react";
import {
  listingViewLabels,
  listingViewModes,
  type ListingPreferenceSurface,
  type ListingViewMode
} from "@/modules/listing-preferences/types";

export function ListingViewSwitcher({
  surface,
  value,
  onChange
}: {
  surface: ListingPreferenceSurface;
  value: ListingViewMode;
  onChange: (view: ListingViewMode) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function saveView(view: ListingViewMode) {
    onChange(view);
    startTransition(async () => {
      await fetch("/api/preferences/listing-view", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ surface, view })
      });
    });
  }

  return (
    <div aria-label="Listing style" className="listing-view-switcher" role="group">
      <span className="listing-view-switcher-label">View</span>
      {listingViewModes.map((mode) => (
        <button
          aria-pressed={value === mode}
          className={value === mode ? "listing-view-option is-active" : "listing-view-option"}
          disabled={isPending && value === mode}
          key={mode}
          onClick={() => saveView(mode)}
          type="button"
        >
          {listingViewLabels[mode]}
        </button>
      ))}
    </div>
  );
}
