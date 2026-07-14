"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { UsersManual, UsersManualFeature } from "@/modules/users-manual/users-manual-content";

type WindowBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PointerSession = {
  pointerId: number;
  startX: number;
  startY: number;
  box: WindowBox;
};

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function clampBox(next: WindowBox): WindowBox {
  if (typeof window === "undefined") {
    return next;
  }

  const margin = 12;
  const maxWidth = Math.max(360, window.innerWidth - margin * 2);
  const maxHeight = Math.max(420, window.innerHeight - margin * 2);
  const width = Math.min(Math.max(next.width, 520), maxWidth);
  const height = Math.min(Math.max(next.height, 460), maxHeight);

  return {
    width,
    height,
    x: Math.min(Math.max(next.x, margin), Math.max(margin, window.innerWidth - width - margin)),
    y: Math.min(Math.max(next.y, margin), Math.max(margin, window.innerHeight - height - margin))
  };
}

function ManualVisual({ feature }: { feature: UsersManualFeature }) {
  return (
    <figure aria-label={feature.visual.title} className="admin-hat-figure" role="img">
      <div className="admin-hat-figure-topbar">
        <span />
        <span />
        <span />
      </div>
      <div className="admin-hat-figure-stage">
        <div className="admin-hat-figure-panel">
          <div className="admin-hat-figure-heading">{feature.visual.title}</div>
          <div className="admin-hat-figure-line wide" />
          <div className="admin-hat-figure-line" />
          <div className="admin-hat-figure-line short" />
        </div>
        <ol className="admin-hat-figure-callouts">
          {feature.visual.callouts.map((callout, index) => (
            <li key={callout}>
              <span>{index + 1}</span>
              {callout}
            </li>
          ))}
        </ol>
      </div>
      <figcaption>{feature.visual.caption}</figcaption>
    </figure>
  );
}

function FeatureGuide({ feature }: { feature: UsersManualFeature }) {
  return (
    <article className="admin-hat-tool-card" id={`feature-${slug(feature.title)}`}>
      <div className="admin-hat-tool-heading">
        <div>
          <p className="admin-hat-eyebrow">Feature</p>
          <h4>{feature.title}</h4>
        </div>
        <Link className="btn-secondary admin-hat-tool-link" href={feature.href} rel="noreferrer" target="_blank">
          Open area
        </Link>
      </div>
      <p className="admin-hat-tool-description">{feature.purpose}</p>

      <div className="admin-hat-tool-grid">
        <div>
          <h5>How to use it</h5>
          <ol>
            {feature.howToUse.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
        <div>
          <h5>Limits and things to know</h5>
          <ul>
            {feature.limits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="users-manual-faq">
        <h5>FAQ</h5>
        {feature.faq.map((item) => (
          <details key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>

      <ManualVisual feature={feature} />
    </article>
  );
}

export function UsersManualClient({ manual }: { manual: UsersManual }) {
  const [open, setOpen] = useState(true);
  const [box, setBox] = useState<WindowBox>({ x: 72, y: 72, width: 1040, height: 760 });
  const dragRef = useRef<PointerSession | null>(null);
  const resizeRef = useRef<PointerSession | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const toc = useMemo(
    () => [
      { id: "users-manual-overview", label: "Overview" },
      { id: "users-manual-free-tier", label: "Free Tier basics" },
      { id: "users-manual-definitions", label: "Terms" },
      ...manual.sections.map((section) => ({ id: `section-${section.key}`, label: section.title }))
    ],
    [manual.sections]
  );

  useEffect(() => {
    setBox((current) =>
      clampBox({
        ...current,
        x: Math.max(12, Math.round((window.innerWidth - Math.min(1040, window.innerWidth - 48)) / 2)),
        y: 34,
        width: Math.min(1040, window.innerWidth - 48),
        height: Math.min(760, window.innerHeight - 72)
      })
    );
  }, []);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (dragRef.current) {
        const session = dragRef.current;
        const dx = event.clientX - session.startX;
        const dy = event.clientY - session.startY;
        setBox(clampBox({ ...session.box, x: session.box.x + dx, y: session.box.y + dy }));
      }

      if (resizeRef.current) {
        const session = resizeRef.current;
        const dx = event.clientX - session.startX;
        const dy = event.clientY - session.startY;
        setBox(clampBox({ ...session.box, width: session.box.width + dx, height: session.box.height + dy }));
      }
    }

    function handlePointerUp(event: PointerEvent) {
      if (dragRef.current?.pointerId === event.pointerId) {
        dragRef.current = null;
      }

      if (resizeRef.current?.pointerId === event.pointerId) {
        resizeRef.current = null;
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button, a, summary")) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      box
    };
  }

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      box
    };
  }

  function jumpTo(id: string) {
    const container = contentRef.current;
    const target = container?.querySelector<HTMLElement>(`#${id}`);
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function resetWindow() {
    setBox(
      clampBox({
        x: Math.max(12, Math.round((window.innerWidth - Math.min(1040, window.innerWidth - 48)) / 2)),
        y: 34,
        width: Math.min(1040, window.innerWidth - 48),
        height: Math.min(760, window.innerHeight - 72)
      })
    );
  }

  return (
    <div className="admin-hat-page users-manual-page">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Settings</p>
        <h1 className="mt-3 text-3xl font-semibold">Users Manual</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          This manual explains the Free Tier user areas, what each function does, how to use it, and the current limits. It does not describe code, internal systems, or site design.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="btn-primary" onClick={() => setOpen(true)} type="button">
            Open Users Manual
          </button>
          <Link className="btn-secondary" href="/settings">
            Back to Settings
          </Link>
        </div>
      </section>

      {open ? (
        <section
          aria-label="Users Manual floating reader"
          className="admin-hat-window users-manual-window"
          style={{
            height: box.height,
            transform: `translate(${box.x}px, ${box.y}px)`,
            width: box.width
          }}
        >
          <div className="admin-hat-titlebar" onPointerDown={beginDrag}>
            <div>
              <p>Users Manual</p>
              <span>Drag this title bar. Resize from the lower-right corner.</span>
            </div>
            <div className="admin-hat-window-actions">
              <button onClick={resetWindow} type="button">
                Center
              </button>
              <button onClick={() => setOpen(false)} type="button">
                Close
              </button>
            </div>
          </div>

          <div className="admin-hat-layout">
            <aside className="admin-hat-toc" aria-label="Users Manual table of contents">
              <p className="admin-hat-toc-title">Contents</p>
              {toc.map((item) => (
                <button key={item.id} onClick={() => jumpTo(item.id)} type="button">
                  {item.label}
                </button>
              ))}
            </aside>

            <div className="admin-hat-content" ref={contentRef}>
              <section id="users-manual-overview">
                <p className="admin-hat-eyebrow">User Reference</p>
                <h2>How to use this manual</h2>
                <p>
                  Use the table of contents to jump to the area you are using. Each feature explains what it is for, how to use it, limits to know, and common questions.
                  Links open the live area in a new tab so this manual can stay open while you work.
                </p>
              </section>

              <section id="users-manual-free-tier">
                <p className="admin-hat-eyebrow">Free Tier</p>
                <h2>Free Tier basics</h2>
                <div className="admin-hat-rule-box">
                  <ol>
                    {manual.freeTierBasics.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </div>
              </section>

              <section id="users-manual-definitions">
                <p className="admin-hat-eyebrow">Terms</p>
                <h2>Terms used on Theta-Space</h2>
                <div className="admin-hat-definition-grid">
                  {manual.definitions.map((definition) => (
                    <article key={definition.term}>
                      <h3>{definition.term}</h3>
                      <p>{definition.definition}</p>
                    </article>
                  ))}
                </div>
              </section>

              {manual.sections.map((section) => (
                <section id={`section-${section.key}`} key={section.key}>
                  <div className="admin-hat-section-heading">
                    <div>
                      <p className="admin-hat-eyebrow">Manual Section</p>
                      <h2>{section.title}</h2>
                    </div>
                  </div>
                  <p>{section.summary}</p>
                  <div className="grid gap-4">
                    {section.features.map((feature) => (
                      <FeatureGuide feature={feature} key={`${feature.href}:${feature.title}`} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <button aria-label="Resize Users Manual" className="admin-hat-resize-handle" onPointerDown={beginResize} type="button" />
        </section>
      ) : null}
    </div>
  );
}
