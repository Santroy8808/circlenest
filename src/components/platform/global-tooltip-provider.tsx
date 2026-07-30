"use client";

import { useEffect, useRef, useState } from "react";

type TooltipState = {
  left: number;
  text: string;
  top: number;
};

const TOOLTIP_SELECTOR = [
  "[data-tooltip]",
  "a",
  "button",
  "summary",
  '[role="button"]',
  '[role="menuitem"]',
  'input[type="button"]',
  'input[type="reset"]',
  'input[type="submit"]'
].join(",");

const ACTION_DESCRIPTIONS: Record<string, string> = {
  "attach image": "Attach an image to what you are writing.",
  "choose a reaction": "Choose a reaction for this item.",
  "open emoji picker": "Add an emoji to what you are writing.",
  "post options": "Open additional options for this post.",
  "share post": "Share this post by link or echo it to your stream.",
  apply: "Apply this change.",
  alerts: "Open important platform or account notices.",
  back: "Go back.",
  cancel: "Cancel and go back.",
  clear: "Clear the current selection or search.",
  close: "Close this panel.",
  comment: "Open the discussion and add a comment.",
  create: "Create a new item.",
  delete: "Delete this item.",
  edit: "Edit this item.",
  home: "Open the home stream.",
  like: "Like it!",
  love: "React with love.",
  menu: "Open the menu.",
  next: "Continue to the next step.",
  notifications: "Open recent account and community updates.",
  remove: "Remove this item or setting.",
  reply: "Reply to this item.",
  save: "Save your changes.",
  search: "Search this area.",
  select: "Select visible items.",
  send: "Send this message.",
  share: "Share this item.",
  upload: "Upload photos or files."
};

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function sentence(value: string) {
  if (!value) return "";
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

export function tooltipActionDescription(value: string) {
  return ACTION_DESCRIPTIONS[cleanText(value).toLowerCase()] ?? "";
}

function visibleText(element: Element) {
  if (element instanceof HTMLInputElement) {
    return cleanText(element.value || element.getAttribute("aria-label"));
  }

  return cleanText(element.textContent);
}

function hrefDescription(element: Element) {
  if (!(element instanceof HTMLAnchorElement)) return "";

  const href = element.getAttribute("href") ?? "";

  if (href.includes("/profile/gallery/upload")) return "Upload photos to My Pics.";
  if (href === "/profile/gallery" || href.includes("/profile/gallery?")) return "Open My Pics.";
  if (href.startsWith("/profile/") && !href.startsWith("/profile/gallery")) return "View this profile.";
  if (href.includes("/ads/create")) return "Create an ad campaign.";
  if (href.startsWith("/messages")) return "Open messages.";
  if (href.startsWith("/mail")) return "Open mail.";
  if (href.startsWith("/market")) return "Open The Market.";
  if (href.startsWith("/jobs")) return "Open job listings.";
  if (href.startsWith("/groups")) return "Open groups.";
  if (href.startsWith("/people") || href.startsWith("/friends")) return "Find and manage people.";
  if (href.startsWith("/feedback")) return "Open Feedback.";
  if (href.startsWith("/settings")) return "Open settings.";
  if (href.startsWith("/admin")) return "Open admin tools.";
  if (href.startsWith("/home") || href === "/") return "Open the home stream.";

  return "";
}

function tooltipText(element: Element) {
  const explicit = cleanText(element.getAttribute("data-tooltip"));
  if (explicit) return sentence(explicit);

  const title = cleanText(element.getAttribute("title"));
  if (title) return tooltipActionDescription(title) || sentence(title);

  const ariaLabel = cleanText(element.getAttribute("aria-label"));
  if (ariaLabel && ariaLabel.length <= 90) {
    return tooltipActionDescription(ariaLabel) || sentence(ariaLabel);
  }

  const fromHref = hrefDescription(element);
  if (fromHref) return fromHref;

  const label = visibleText(element);
  const actionDescription = tooltipActionDescription(label);
  if (actionDescription) return actionDescription;
  if (label.length > 0 && label.length <= 24) return sentence(label.startsWith("Open ") ? label : `Open ${label}`);

  return "";
}

function tooltipPosition(x: number, y: number) {
  const margin = 12;
  const width = 280;
  const height = 60;
  const left = Math.max(margin, Math.min(x + 14, window.innerWidth - width - margin));
  const below = y + 18;
  const top = below + height > window.innerHeight ? Math.max(margin, y - height - 10) : below;

  return { left, top };
}

function closestTooltipTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest(TOOLTIP_SELECTOR);
}

export function GlobalTooltipProvider() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const activeElementRef = useRef<Element | null>(null);

  useEffect(() => {
    const hoverCapable = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const androidShell = document.body.classList.contains("theta-android-app");
    if (androidShell) return;

    function clearNativeTitle() {
      const activeElement = activeElementRef.current;
      if (!activeElement) return;

      const nativeTitle = activeElement.getAttribute("data-native-tooltip-title");
      if (nativeTitle) {
        activeElement.setAttribute("title", nativeTitle);
        activeElement.removeAttribute("data-native-tooltip-title");
      }
    }

    function hideTooltip() {
      clearNativeTitle();
      activeElementRef.current = null;
      setTooltip(null);
    }

    function showTooltip(element: Element, x: number, y: number) {
      const text = tooltipText(element);
      if (!text) {
        hideTooltip();
        return;
      }

      clearNativeTitle();
      activeElementRef.current = element;

      const title = cleanText(element.getAttribute("title"));
      if (title) {
        element.setAttribute("data-native-tooltip-title", title);
        element.removeAttribute("title");
      }

      setTooltip({ text, ...tooltipPosition(x, y) });
    }

    function handlePointerOver(event: PointerEvent) {
      if (!hoverCapable) return;
      const element = closestTooltipTarget(event.target);
      if (!element) return;
      showTooltip(element, event.clientX, event.clientY);
    }

    function handlePointerMove(event: PointerEvent) {
      if (!hoverCapable || !activeElementRef.current) return;
      setTooltip((current) => (current ? { ...current, ...tooltipPosition(event.clientX, event.clientY) } : current));
    }

    function handlePointerOut(event: PointerEvent) {
      const element = closestTooltipTarget(event.target);
      if (!element || element !== activeElementRef.current) return;
      const nextTarget = event.relatedTarget instanceof Element ? event.relatedTarget : null;
      if (nextTarget && element.contains(nextTarget)) return;
      hideTooltip();
    }

    function handleFocusIn(event: FocusEvent) {
      const element = closestTooltipTarget(event.target);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      showTooltip(element, rect.left + rect.width / 2, rect.bottom);
    }

    function handleFocusOut() {
      hideTooltip();
    }

    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);

    return () => {
      clearNativeTitle();
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
    };
  }, []);

  if (!tooltip) return null;

  return (
    <div className="global-tooltip" role="tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
      {tooltip.text}
    </div>
  );
}
