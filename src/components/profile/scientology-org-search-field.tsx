"use client";

import { useId, useMemo, useState } from "react";
import { findScientologyOrgs, formatScientologyOrg } from "@/modules/my-scientology/scientology-orgs";

type ScientologyOrgSearchFieldProps = {
  defaultValue?: string;
  helperText?: string;
  label?: string;
  name?: string;
  required?: boolean;
};

export function ScientologyOrgSearchField({
  defaultValue = "",
  helperText = "Search by org name, AO abbreviation, city, or country.",
  label = "Current org",
  name = "orgName",
  required = false
}: ScientologyOrgSearchFieldProps) {
  const inputId = useId();
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => findScientologyOrgs(value), [value]);
  const exactMatch = matches.find((org) => org.organization === value);

  function chooseOrg(orgName: string) {
    setValue(orgName);
    setOpen(false);
  }

  return (
    <div className="relative grid gap-2">
      <label className="form-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-describedby={helperText ? `${inputId}-help` : undefined}
        aria-expanded={open}
        autoComplete="off"
        className="form-field"
        id={inputId}
        name={name}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search org, AO, city, or country"
        required={required}
        role="combobox"
        value={value}
      />
      {open ? (
        <div
          className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--panel)] shadow-2xl"
          id={listId}
          role="listbox"
        >
          <p className="border-b border-[var(--line)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">
            Closest org matches
          </p>
          {matches.length > 0 ? (
            matches.map((org) => (
              <button
                aria-selected={org.organization === value}
                className="block w-full border-b border-[var(--line)] px-4 py-3 text-left last:border-b-0 hover:bg-[var(--panel-soft)] focus:bg-[var(--panel-soft)]"
                key={`${org.organization}:${org.city}:${org.country}`}
                onClick={() => chooseOrg(org.organization)}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
                type="button"
              >
                <strong className="block text-[var(--text)]">{org.organization}</strong>
                <span className="mt-1 block text-sm text-[var(--muted)]">
                  {[org.city, org.country, org.category].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))
          ) : (
            <p className="px-4 py-3 text-sm text-[var(--muted)]">No listed org matches. Keep typing to save a custom org name.</p>
          )}
        </div>
      ) : null}
      {value || helperText ? (
        <p className="text-xs leading-5 text-[var(--muted)]" id={`${inputId}-help`}>
          {exactMatch ? formatScientologyOrg(exactMatch) : helperText}
        </p>
      ) : null}
    </div>
  );
}
