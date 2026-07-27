"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FeedbackTicketForm } from "@/components/feedback/feedback-ticket-form";
import {
  captureFeedbackPageContext,
  describeActivityTarget,
  recordRecentActivity,
  type FeedbackPageContext
} from "@/lib/client/recent-activity";

export function GlobalFeedbackLink() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [captureHidden, setCaptureHidden] = useState(false);
  const [pageContext, setPageContext] = useState<FeedbackPageContext | null>(null);
  const [shimmering, setShimmering] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const route = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const isComposerPath = pathname.startsWith("/messages") || pathname.startsWith("/mail");

  useEffect(() => {
    recordRecentActivity("route", route);
  }, [route]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = describeActivityTarget(event.target);
      if (target) recordRecentActivity("click", target);
    }
    function handleSubmit(event: SubmitEvent) {
      const target = describeActivityTarget(event.target);
      if (target) recordRecentActivity("submit", target);
    }
    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let stopTimer = 0;
    const interval = window.setInterval(() => {
      setShimmering(true);
      stopTimer = window.setTimeout(() => setShimmering(false), 1400);
    }, 120_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stopTimer);
    };
  }, []);

  useEffect(() => {
    function handleExternalOpen() {
      recordRecentActivity("click", "Open Feedback");
      setPageContext(captureFeedbackPageContext());
      setIsOpen(true);
    }
    window.addEventListener("theta:open-feedback", handleExternalOpen);
    return () => window.removeEventListener("theta:open-feedback", handleExternalOpen);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]"
        ) ?? []
      );

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFeedback();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => focusable()[0]?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function openFeedback() {
    recordRecentActivity("click", "Feedback button");
    setPageContext(captureFeedbackPageContext());
    setIsOpen(true);
  }

  function closeFeedback() {
    setIsOpen(false);
    setCaptureHidden(false);
    window.setTimeout(() => buttonRef.current?.focus(), 0);
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        className={[
          "feedback-fab",
          isComposerPath ? "feedback-fab--above-composer" : "",
          shimmering ? "feedback-fab--shimmer" : ""
        ].filter(Boolean).join(" ")}
        data-feedback-ui
        onClick={openFeedback}
        ref={buttonRef}
        type="button"
      >
        Feedback
      </button>

      {isOpen && pageContext ? (
        <div
          className={captureHidden ? "feedback-modal-layer feedback-modal-layer--capture-hidden" : "feedback-modal-layer"}
          data-feedback-ui
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeFeedback();
          }}
        >
          <div
            aria-labelledby="feedback-dialog-title"
            aria-modal="true"
            className="feedback-modal"
            ref={dialogRef}
            role="dialog"
          >
            <header className="feedback-modal-header">
              <div>
                <p>Theta-Space Support</p>
                <h2 id="feedback-dialog-title">Feedback</h2>
              </div>
              <button aria-label="Close Feedback" className="feedback-modal-close" onClick={closeFeedback} type="button">
                Close
              </button>
            </header>
            <div className="feedback-modal-body">
              <FeedbackTicketForm
                onCaptureVisibilityChange={setCaptureHidden}
                onRefreshContext={() => setPageContext(captureFeedbackPageContext())}
                onRequestClose={closeFeedback}
                pageContext={pageContext}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
