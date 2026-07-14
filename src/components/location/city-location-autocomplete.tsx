"use client";

import { useEffect, useId, useRef, useState } from "react";

type CitySuggestion = {
  city: string;
  country: string;
  label: string;
  region: string;
};

type CityLocationAutocompleteProps = {
  disabled?: boolean;
  helperText?: string;
  label?: string;
  name?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  value: string;
};

export function CityLocationAutocomplete({
  disabled = false,
  helperText = "Start typing a city. Suggestions are city-level only, not street addresses.",
  label = "City",
  name,
  onChange,
  placeholder = "Start typing a city...",
  required = false,
  value
}: CityLocationAutocompleteProps) {
  const inputId = useId();
  const listId = useId();
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const latestQueryRef = useRef("");

  useEffect(() => {
    const query = value.trim();
    latestQueryRef.current = query;

    if (disabled || query.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setIsSearching(false);
      setHighlightedIndex(-1);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/locations/cities?q=${encodeURIComponent(query)}&limit=8`, {
          cache: "no-store",
          signal: controller.signal
        });
        const payload = (await response.json().catch(() => null)) as { suggestions?: CitySuggestion[] } | null;
        if (latestQueryRef.current !== query) return;
        const nextSuggestions = response.ok && Array.isArray(payload?.suggestions) ? payload.suggestions : [];
        setSuggestions(nextSuggestions);
        setIsOpen(nextSuggestions.length > 0);
        setHighlightedIndex(nextSuggestions.length > 0 ? 0 : -1);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSuggestions([]);
          setIsOpen(false);
          setHighlightedIndex(-1);
        }
      } finally {
        if (latestQueryRef.current === query) setIsSearching(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [disabled, value]);

  function chooseSuggestion(suggestion: CitySuggestion) {
    onChange(suggestion.label);
    setIsOpen(false);
    setSuggestions([]);
    setHighlightedIndex(-1);
  }

  return (
    <div className="city-location-field grid gap-2">
      <label className="form-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="city-location-autocomplete">
        <input
          aria-autocomplete="list"
          aria-controls={isOpen ? listId : undefined}
          aria-expanded={isOpen}
          aria-describedby={`${inputId}-help`}
          className="form-field"
          disabled={disabled}
          id={inputId}
          name={name}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (!isOpen || suggestions.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlightedIndex((current) => Math.min(current + 1, suggestions.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlightedIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter" && highlightedIndex >= 0) {
              event.preventDefault();
              chooseSuggestion(suggestions[highlightedIndex]);
            } else if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          placeholder={placeholder}
          required={required}
          role="combobox"
          value={value}
        />
        {isSearching ? <span className="city-location-status">Searching...</span> : null}
        {isOpen ? (
          <div className="city-location-suggestions" id={listId} role="listbox">
            {suggestions.map((suggestion, index) => (
              <button
                aria-selected={highlightedIndex === index}
                className={highlightedIndex === index ? "city-location-option is-active" : "city-location-option"}
                key={suggestion.label}
                onMouseDown={(event) => {
                  event.preventDefault();
                  chooseSuggestion(suggestion);
                }}
                role="option"
                type="button"
              >
                <span>{suggestion.city}</span>
                <small>
                  {[suggestion.region, suggestion.country].filter(Boolean).join(", ")}
                </small>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {helperText ? (
        <small className="text-[var(--muted)]" id={`${inputId}-help`}>
          {helperText}
        </small>
      ) : null}
    </div>
  );
}
