"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { AdminHatFigure, AdminHatFunctionGuide, AdminHatManual } from "@/modules/admin-hat/admin-hat-content";

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

function ManualFigure({ figure }: { figure: AdminHatFigure }) {
  return (
    <figure aria-label={figure.title} className="admin-hat-figure" role="img">
      <div className="admin-hat-figure-topbar">
        <span />
        <span />
        <span />
      </div>
      <div className="admin-hat-figure-stage">
        <div className="admin-hat-figure-panel">
          <div className="admin-hat-figure-heading">{figure.title}</div>
          <div className="admin-hat-figure-line wide" />
          <div className="admin-hat-figure-line" />
          <div className="admin-hat-figure-line short" />
        </div>
        <ol className="admin-hat-figure-callouts">
          {figure.callouts.map((callout, index) => (
            <li key={callout}>
              <span>{index + 1}</span>
              {callout}
            </li>
          ))}
        </ol>
      </div>
      <figcaption>{figure.caption}</figcaption>
    </figure>
  );
}

function ToolGuide({ entry }: { entry: AdminHatFunctionGuide }) {
  return (
    <article className="admin-hat-tool-card" id={`tool-${slug(entry.title)}`}>
      <div className="admin-hat-tool-heading">
        <div>
          <p className="admin-hat-eyebrow">{entry.category}</p>
          <h4>{entry.title}</h4>
        </div>
        <Link className="btn-secondary admin-hat-tool-link" href={entry.href} rel="noreferrer" target="_blank">
          Open function
        </Link>
      </div>
      <p className="admin-hat-tool-description">{entry.description}</p>

      <div className="admin-hat-tool-grid">
        <div>
          <h5>When to use it</h5>
          <p>{entry.whenToUse}</p>
        </div>
        <div>
          <h5>Expected result</h5>
          <p>{entry.expectedResult}</p>
        </div>
        <div>
          <h5>Before you start</h5>
          <ul>
            {entry.beforeYouStart.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h5>Cautions</h5>
          <ul>
            {entry.cautions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <ManualFigure figure={entry.figure} />
    </article>
  );
}

export function AdminHatManualClient({ manual }: { manual: AdminHatManual }) {
  const [open, setOpen] = useState(true);
  const [box, setBox] = useState<WindowBox>({ x: 72, y: 72, width: 1040, height: 760 });
  const dragRef = useRef<PointerSession | null>(null);
  const resizeRef = useRef<PointerSession | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const toc = useMemo(
    () => [
      { id: "admin-hat-overview", label: "Overview" },
      { id: "admin-hat-definitions", label: "Terms" },
      { id: "admin-hat-dashboard", label: "Dashboard surfaces" },
      ...manual.workflows.map((workflow) => ({ id: `workflow-${workflow.key}`, label: workflow.title }))
    ],
    [manual.workflows]
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
    if ((event.target as HTMLElement).closest("button, a")) {
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
    <div className="admin-hat-page">
      <section className="surface rounded-md p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">Admin Tools</p>
        <h1 className="mt-3 text-3xl font-semibold">Admin Hat</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          This is the administrator operating manual. Keep it open while working, move it out of the way, resize it, or use the contents list to jump to a specific function.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="btn-primary" onClick={() => setOpen(true)} type="button">
            Open Admin Hat
          </button>
          <Link className="btn-secondary" href="/admin">
            Back to Admin Tools
          </Link>
        </div>
      </section>

      {open ? (
        <section
          aria-label="Admin Hat floating manual"
          className="admin-hat-window"
          style={{
            height: box.height,
            transform: `translate(${box.x}px, ${box.y}px)`,
            width: box.width
          }}
        >
          <div className="admin-hat-titlebar" onPointerDown={beginDrag}>
            <div>
              <p>Admin Hat</p>
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
            <aside className="admin-hat-toc" aria-label="Admin Hat table of contents">
              <p className="admin-hat-toc-title">Contents</p>
              {toc.map((item) => (
                <button key={item.id} onClick={() => jumpTo(item.id)} type="button">
                  {item.label}
                </button>
              ))}
            </aside>

            <div className="admin-hat-content" ref={contentRef}>
              <section id="admin-hat-overview">
                <p className="admin-hat-eyebrow">Administrator Manual</p>
                <h2>How to use the admin hat</h2>
                <p>
                  The administrator hat is the operational guide for Theta-Space Admin Tools. Use it to identify the correct workflow, understand site-specific terms, open the
                  live function, and avoid high-risk mistakes.
                </p>
                <div className="admin-hat-rule-box">
                  <h3>Operating rules</h3>
                  <ol>
                    {manual.operatingRules.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ol>
                </div>
              </section>

              <section id="admin-hat-definitions">
                <p className="admin-hat-eyebrow">Terms</p>
                <h2>Site-specific definitions</h2>
                <div className="admin-hat-definition-grid">
                  {manual.definitions.map((definition) => (
                    <article key={definition.term}>
                      <h3>{definition.term}</h3>
                      <p>{definition.definition}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section id="admin-hat-dashboard">
                <p className="admin-hat-eyebrow">Admin Portal</p>
                <h2>Dashboard surfaces</h2>
                <div className="admin-hat-dashboard-grid">
                  {manual.dashboardSurfaces.map((surface) => (
                    <article className="admin-hat-tool-card" key={surface.title}>
                      <div className="admin-hat-tool-heading">
                        <div>
                          <p className="admin-hat-eyebrow">Dashboard</p>
                          <h4>{surface.title}</h4>
                        </div>
                        <Link className="btn-secondary admin-hat-tool-link" href={surface.href} rel="noreferrer" target="_blank">
                          Open
                        </Link>
                      </div>
                      <p className="admin-hat-tool-description">{surface.purpose}</p>
                      <div className="admin-hat-tool-grid">
                        <div>
                          <h5>Use when</h5>
                          <p>{surface.useWhen}</p>
                        </div>
                        <div>
                          <h5>Cautions</h5>
                          <ul>
                            {surface.cautions.map((caution) => (
                              <li key={caution}>{caution}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <ManualFigure figure={surface.figure} />
                    </article>
                  ))}
                </div>
              </section>

              {manual.workflows.map((workflow) => (
                <section id={`workflow-${workflow.key}`} key={workflow.key}>
                  <div className="admin-hat-section-heading">
                    <div>
                      <p className="admin-hat-eyebrow">{workflow.eyebrow}</p>
                      <h2>{workflow.title}</h2>
                    </div>
                    <Link className="btn-secondary admin-hat-tool-link" href={workflow.href} rel="noreferrer" target="_blank">
                      Open workflow
                    </Link>
                  </div>
                  <p>{workflow.description}</p>

                  {workflow.groups.map((group) => (
                    <div className="admin-hat-group" key={group.key}>
                      <h3>{group.title}</h3>
                      <p>{group.description}</p>
                      <div className="grid gap-4">
                        {group.entries.map((entry) => (
                          <ToolGuide entry={entry} key={`${entry.href}:${entry.title}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </div>

          <button aria-label="Resize Admin Hat manual" className="admin-hat-resize-handle" onPointerDown={beginResize} type="button" />
        </section>
      ) : null}
    </div>
  );
}
