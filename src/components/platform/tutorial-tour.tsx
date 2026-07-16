"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getTutorialStep, tutorialSections, tutorialSteps, type TutorialStep } from "@/modules/tutorial/tutorial-content";

type TargetBox = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type PanelPlacement = {
  arrowEndX: number;
  arrowEndY: number;
  arrowStartX: number;
  arrowStartY: number;
  panelStyle: CSSProperties;
};

const STORAGE_KEY = "theta:tutorial:active-step";
const PANEL_WIDTH = 390;
const PANEL_HEIGHT = 360;
const VIEWPORT_GAP = 18;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function targetSelector(target: string) {
  return `[data-tutorial-target="${target}"]`;
}

function targetBoxFromRect(rect: DOMRect): TargetBox {
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width
  };
}

function arrowPointAtTargetEdge(target: TargetBox, arrowStartX: number, arrowStartY: number) {
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;
  const dx = arrowStartX - targetCenterX;
  const dy = arrowStartY - targetCenterY;

  if (dx === 0 && dy === 0) {
    return { x: targetCenterX, y: targetCenterY };
  }

  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : target.width / 2 / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : target.height / 2 / Math.abs(dy)
  );
  const edgeX = targetCenterX + dx * scale;
  const edgeY = targetCenterY + dy * scale;
  const length = Math.hypot(dx, dy);
  const clearance = 8;

  return {
    x: edgeX + (dx / length) * clearance,
    y: edgeY + (dy / length) * clearance
  };
}

function resolvePanelPlacement(target: TargetBox | null): PanelPlacement {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(PANEL_WIDTH, viewportWidth - VIEWPORT_GAP * 2);
  const height = Math.min(PANEL_HEIGHT, viewportHeight - VIEWPORT_GAP * 2);

  if (!target) {
    const left = (viewportWidth - width) / 2;
    const top = (viewportHeight - height) / 2;
    return {
      panelStyle: { left, maxHeight: height, maxWidth: width, top, width },
      arrowStartX: left + width / 2,
      arrowStartY: top,
      arrowEndX: left + width / 2,
      arrowEndY: top
    };
  }

  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;
  const spaces = {
    above: target.top,
    below: viewportHeight - target.top - target.height,
    left: target.left,
    right: viewportWidth - target.left - target.width
  };
  let left = 0;
  let top = 0;
  let arrowStartX = 0;
  let arrowStartY = 0;

  if (spaces.right >= width + VIEWPORT_GAP) {
    left = target.left + target.width + VIEWPORT_GAP;
    top = clamp(targetCenterY - height / 2, VIEWPORT_GAP, viewportHeight - height - VIEWPORT_GAP);
    arrowStartX = left;
    arrowStartY = clamp(targetCenterY, top + 34, top + height - 34);
  } else if (spaces.left >= width + VIEWPORT_GAP) {
    left = target.left - width - VIEWPORT_GAP;
    top = clamp(targetCenterY - height / 2, VIEWPORT_GAP, viewportHeight - height - VIEWPORT_GAP);
    arrowStartX = left + width;
    arrowStartY = clamp(targetCenterY, top + 34, top + height - 34);
  } else if (spaces.below >= height + VIEWPORT_GAP) {
    left = clamp(targetCenterX - width / 2, VIEWPORT_GAP, viewportWidth - width - VIEWPORT_GAP);
    top = target.top + target.height + VIEWPORT_GAP;
    arrowStartX = clamp(targetCenterX, left + 34, left + width - 34);
    arrowStartY = top;
  } else {
    left = clamp(targetCenterX - width / 2, VIEWPORT_GAP, viewportWidth - width - VIEWPORT_GAP);
    top = clamp(target.top - height - VIEWPORT_GAP, VIEWPORT_GAP, viewportHeight - height - VIEWPORT_GAP);
    arrowStartX = clamp(targetCenterX, left + 34, left + width - 34);
    arrowStartY = top + height;
  }

  const arrowEnd = arrowPointAtTargetEdge(target, arrowStartX, arrowStartY);

  return {
    panelStyle: { left, maxHeight: height, maxWidth: width, top, width },
    arrowStartX,
    arrowStartY,
    arrowEndX: arrowEnd.x,
    arrowEndY: arrowEnd.y
  };
}

function markComplete() {
  return fetch("/api/tutorial", {
    body: JSON.stringify({ action: "complete" }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  }).catch(() => undefined);
}

function sectionStartStep(sectionId: string) {
  const section = tutorialSections.find((item) => item.id === sectionId);
  return section ? getTutorialStep(section.stepIds[0]) : tutorialSteps[0];
}

export function TutorialTour({ shouldPromptOnFirstLogin }: { shouldPromptOnFirstLogin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [isPositioning, setIsPositioning] = useState(false);
  const [targetBox, setTargetBox] = useState<TargetBox | null>(null);
  const activeStep = useMemo(() => (activeStepId ? getTutorialStep(activeStepId) : null), [activeStepId]);
  const activeIndex = activeStep ? tutorialSteps.findIndex((step) => step.id === activeStep.id) : -1;
  const placement = useMemo(() => {
    if (typeof window === "undefined") return null;
    return resolvePanelPlacement(targetBox);
  }, [targetBox]);

  const goToStep = useCallback((step: TutorialStep) => {
    window.sessionStorage.setItem(STORAGE_KEY, step.id);
    setWelcomeOpen(false);
    setContentsOpen(false);
    setIsPositioning(true);
    setActiveStepId(step.id);
    if (pathname !== step.page) router.push(step.page);
  }, [pathname, router]);

  const startTour = useCallback((stepId = tutorialSteps[0].id) => {
    void markComplete();
    goToStep(getTutorialStep(stepId));
  }, [goToStep]);

  const closeTour = useCallback(() => {
    window.sessionStorage.removeItem(STORAGE_KEY);
    setActiveStepId(null);
    setWelcomeOpen(false);
    setIsPositioning(false);
    setTargetBox(null);
    void markComplete();
  }, []);

  useEffect(() => {
    const storedStepId = window.sessionStorage.getItem(STORAGE_KEY);
    if (storedStepId) {
      setActiveStepId(storedStepId);
      return;
    }
    if (shouldPromptOnFirstLogin) setWelcomeOpen(true);
  }, [shouldPromptOnFirstLogin]);

  useEffect(() => {
    function handleStart(event: Event) {
      const detail = (event as CustomEvent<{ sectionId?: string; stepId?: string }>).detail;
      if (detail?.sectionId) {
        startTour(sectionStartStep(detail.sectionId).id);
        return;
      }
      startTour(detail?.stepId ?? tutorialSteps[0].id);
    }

    window.addEventListener("theta:tutorial:start", handleStart);
    return () => window.removeEventListener("theta:tutorial:start", handleStart);
  }, [startTour]);

  useEffect(() => {
    if (!activeStep) return;
    const step = activeStep;
    if (pathname !== step.page) {
      setIsPositioning(true);
      router.push(step.page);
      return;
    }

    let frame = 0;
    let measureTimer = 0;
    let cancelled = false;

    function measureTarget() {
      const target = document.querySelector<HTMLElement>(targetSelector(step.target));
      if (!target) {
        setTargetBox(null);
        setIsPositioning(false);
        return;
      }

      const rect = target.getBoundingClientRect();
      if (cancelled) return;
      setTargetBox(targetBoxFromRect(rect));
      setIsPositioning(false);
    }

    function scheduleMeasure() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(measureTarget);
      });
    }

    const target = document.querySelector<HTMLElement>(targetSelector(step.target));
    if (!target) {
      setTargetBox(null);
      setIsPositioning(false);
      return;
    }

    target.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
    measureTimer = window.setTimeout(measureTarget, 90);
    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(measureTimer);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
    };
  }, [activeStep, pathname, router]);

  function move(delta: number) {
    const next = tutorialSteps[clamp(activeIndex + delta, 0, tutorialSteps.length - 1)];
    if (next) goToStep(next);
  }

  if (welcomeOpen) {
    return (
      <div className="tutorial-welcome-layer" role="dialog" aria-modal="true" aria-labelledby="tutorial-welcome-title">
        <section className="tutorial-welcome-card">
          <p className="tutorial-kicker">Welcome to Theta-Space</p>
          <h2 id="tutorial-welcome-title">Would you like a quick walkthrough?</h2>
          <p>
            I can point out the main controls, show where posting and replies happen, and show how to find Settings, My Pics, People, Groups, Market, and Comm Center.
          </p>
          <div className="tutorial-welcome-actions">
            <button className="btn-primary" onClick={() => startTour()} type="button">
              Yes, walk me through
            </button>
            <button className="btn-secondary" onClick={closeTour} type="button">
              No thanks
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (!activeStep || !placement) return null;

  return (
    <div className={`tutorial-layer${isPositioning ? " is-positioning" : ""}`} aria-live="polite">
      {targetBox ? (
        <div
          className="tutorial-target-ring"
          style={{
            height: targetBox.height + 12,
            left: targetBox.left - 6,
            top: targetBox.top - 6,
            width: targetBox.width + 12
          }}
        />
      ) : null}
      <svg className="tutorial-arrow-layer" aria-hidden="true">
        <defs>
          <marker id="tutorial-arrow-head" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
            <path d="M0,0 L8,4 L0,8 z" />
          </marker>
        </defs>
        {targetBox ? (
          <line
            markerEnd="url(#tutorial-arrow-head)"
            x1={placement.arrowStartX}
            x2={placement.arrowEndX}
            y1={placement.arrowStartY}
            y2={placement.arrowEndY}
          />
        ) : null}
      </svg>
      <section className="tutorial-panel" role="dialog" aria-label={activeStep.title} style={placement.panelStyle}>
        <div className="tutorial-panel-scroll">
          <div className="tutorial-panel-topline">
            <span>{activeIndex + 1} of {tutorialSteps.length}</span>
            <button onClick={closeTour} type="button">Skip</button>
          </div>
          <h2>{activeStep.title}</h2>
          <p>{activeStep.description}</p>
          {!targetBox ? <p className="tutorial-missing-target">This control is not visible in the current viewport. Use Next or open the matching area from the table of contents.</p> : null}
          <button className="tutorial-contents-toggle" onClick={() => setContentsOpen((value) => !value)} type="button">
            {contentsOpen ? "Hide table of contents" : "Table of contents"}
          </button>
          {contentsOpen ? (
            <div className="tutorial-contents">
              {tutorialSections.map((section) => (
                <div className="tutorial-contents-section" key={section.id}>
                  <button onClick={() => startTour(sectionStartStep(section.id).id)} type="button">
                    {section.title}
                  </button>
                  <span>{section.description}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="tutorial-actions">
          <button className="btn-secondary" disabled={activeIndex <= 0} onClick={() => move(-1)} type="button">
            Back
          </button>
          {activeIndex >= tutorialSteps.length - 1 ? (
            <button className="btn-primary" onClick={closeTour} type="button">
              Finish
            </button>
          ) : (
            <button className="btn-primary" onClick={() => move(1)} type="button">
              Next
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
