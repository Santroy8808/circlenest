"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import {
  progressionLinks,
  progressionNodes,
  progressionStatusLabels,
  type ProgressionNode,
  type ProgressionStatus
} from "@/modules/progression-path/progression-path-content";

const MAP_WIDTH = 2070;
const MAP_HEIGHT = 630;
const NODE_WIDTH = 220;
const NODE_HEIGHT = 138;
const COLUMN_GAP = 250;
const ROW_GAP = 180;
const MAP_PADDING_X = 45;
const MAP_PADDING_Y = 35;
const MIN_SCALE = 0.14;
const MAX_SCALE = 1.3;

type ViewState = { x: number; y: number; scale: number };
type StatusFilter = "all" | ProgressionStatus;

function getNodePosition(node: ProgressionNode) {
  return {
    x: MAP_PADDING_X + node.column * COLUMN_GAP,
    y: MAP_PADDING_Y + node.row * ROW_GAP
  };
}

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function connectorPath(from: ProgressionNode, to: ProgressionNode) {
  const start = getNodePosition(from);
  const end = getNodePosition(to);
  const startX = start.x + NODE_WIDTH;
  const startY = start.y + NODE_HEIGHT / 2;
  const endX = end.x;
  const endY = end.y + NODE_HEIGHT / 2;
  const curve = Math.max(70, (endX - startX) * 0.52);
  return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
}

export function ProgressionPathClient() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [view, setView] = useState<ViewState>({ x: 20, y: 20, scale: 0.64 });
  const [selectedId, setSelectedId] = useState("free");
  const [tierFilter, setTierFilter] = useState<"all" | ProgressionNode["tier"]>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isDragging, setIsDragging] = useState(false);

  const visibleNodes = useMemo(
    () =>
      progressionNodes.filter(
        (node) => (tierFilter === "all" || node.tier === tierFilter) && (statusFilter === "all" || node.status === statusFilter)
      ),
    [statusFilter, tierFilter]
  );
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const selectedNode = progressionNodes.find((node) => node.id === selectedId) ?? progressionNodes[0];

  const fitMap = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    const compact = width < 600;
    const scale = compact ? 0.48 : clampScale(Math.min((width - 36) / MAP_WIDTH, (height - 36) / MAP_HEIGHT));
    setView({
      x: compact ? 18 : Math.max(18, (width - MAP_WIDTH * scale) / 2),
      y: compact ? 24 : Math.max(18, (height - MAP_HEIGHT * scale) / 2),
      scale
    });
  }, []);

  useEffect(() => {
    fitMap();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(fitMap);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitMap]);

  useEffect(() => {
    if (!visibleIds.has(selectedId) && visibleNodes[0]) setSelectedId(visibleNodes[0].id);
  }, [selectedId, visibleIds, visibleNodes]);

  function zoomAt(nextScale: number, centerX?: number, centerY?: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setView((current) => {
      const scale = clampScale(nextScale);
      const anchorX = centerX ?? viewport.clientWidth / 2;
      const anchorY = centerY ?? viewport.clientHeight / 2;
      const mapX = (anchorX - current.x) / current.scale;
      const mapY = (anchorY - current.y) / current.scale;
      return { x: anchorX - mapX * scale, y: anchorY - mapY * scale, scale };
    });
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    zoomAt(view.scale * factor, event.clientX - bounds.left, event.clientY - bounds.top);
  }

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y };
    setIsDragging(true);
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setView((current) => ({ ...current, x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY }));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
  }

  return (
    <div className="progression-page grid gap-5">
      <section className="progression-hero surface rounded-md">
        <div>
          <p className="progression-eyebrow">Progression Path</p>
          <h1>See where Theta-Space is going</h1>
          <p className="progression-intro">
            Explore features as they move toward Free and Contributor milestones. Select any point for a plain-language explanation.
          </p>
        </div>
        <div className="progression-legend" aria-label="Progression status key">
          {Object.entries(progressionStatusLabels).map(([status, label]) => (
            <span className={`progression-status progression-status-${status}`} key={status}>
              {label}
            </span>
          ))}
        </div>
      </section>

      <section className="progression-shell surface rounded-md">
        <div className="progression-toolbar">
          <div className="progression-filter-group" aria-label="Filter progression path by tier">
            <span>View</span>
            {(["all", "Free", "Contributor"] as const).map((tier) => (
              <button aria-pressed={tierFilter === tier} key={tier} onClick={() => setTierFilter(tier)} type="button">
                {tier === "all" ? "All" : tier}
              </button>
            ))}
          </div>
          <label className="progression-status-filter">
            <span>Status</span>
            <select onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} value={statusFilter}>
              <option value="all">All stages</option>
              {Object.entries(progressionStatusLabels).map(([status, label]) => (
                <option key={status} value={status}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="progression-zoom" aria-label="Map controls">
            <button aria-label="Zoom out" onClick={() => zoomAt(view.scale * 0.84)} type="button">
              −
            </button>
            <output aria-label="Current zoom">{Math.round(view.scale * 100)}%</output>
            <button aria-label="Zoom in" onClick={() => zoomAt(view.scale * 1.16)} type="button">
              +
            </button>
            <button className="progression-fit" onClick={fitMap} type="button">
              Reset view
            </button>
          </div>
        </div>

        <div
          aria-label="Interactive Theta-Space progression map. Drag to move and use the controls to zoom."
          className={`progression-viewport${isDragging ? " is-dragging" : ""}`}
          onPointerCancel={endDrag}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onWheel={handleWheel}
          ref={viewportRef}
          role="application"
        >
          <div
            className="progression-canvas"
            style={{ height: MAP_HEIGHT, transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`, width: MAP_WIDTH }}
          >
            <div className="progression-orbit progression-orbit-one" />
            <div className="progression-orbit progression-orbit-two" />
            <svg aria-hidden="true" className="progression-links" height={MAP_HEIGHT} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} width={MAP_WIDTH}>
              <defs>
                <linearGradient id="progression-line" x1="0" x2="1">
                  <stop offset="0" stopColor="var(--progression-line-start)" />
                  <stop offset="1" stopColor="var(--progression-line-end)" />
                </linearGradient>
                <marker id="progression-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                  <path d="M0,0 L8,4 L0,8 Z" fill="var(--progression-line-end)" />
                </marker>
              </defs>
              {progressionLinks.map((link) => {
                const from = progressionNodes.find((node) => node.id === link.from);
                const to = progressionNodes.find((node) => node.id === link.to);
                if (!from || !to || !visibleIds.has(from.id) || !visibleIds.has(to.id)) return null;
                return <path className="progression-link" d={connectorPath(from, to)} key={`${link.from}-${link.to}`} markerEnd="url(#progression-arrow)" />;
              })}
            </svg>

            {visibleNodes.map((node) => {
              const position = getNodePosition(node);
              return (
                <button
                  aria-label={`${node.title}. ${progressionStatusLabels[node.status]}. ${node.summary}`}
                  aria-pressed={selectedId === node.id}
                  className={`progression-node progression-node-${node.kind} progression-node-${node.status}${selectedId === node.id ? " is-selected" : ""}`}
                  key={node.id}
                  onClick={() => setSelectedId(node.id)}
                  onPointerDown={(event) => event.stopPropagation()}
                  style={{ height: NODE_HEIGHT, left: position.x, top: position.y, width: NODE_WIDTH }}
                  type="button"
                >
                  <span className="progression-node-type">{node.kind === "tier" ? "Tier milestone" : node.tier}</span>
                  <strong>{node.title}</strong>
                  <span className="progression-node-summary">{node.summary}</span>
                  <span className={`progression-dot progression-dot-${node.status}`}>{progressionStatusLabels[node.status]}</span>
                </button>
              );
            })}
          </div>
          {visibleNodes.length === 0 ? <p className="progression-empty">No path points match those filters.</p> : null}
          <p className="progression-map-hint">Drag to move · Scroll or use controls to zoom · Select a point to learn more</p>
        </div>

        <aside aria-live="polite" className={`progression-details progression-details-${selectedNode.kind}`}>
          <div>
            <p>{selectedNode.kind === "tier" ? "Tier milestone" : `${selectedNode.tier} feature`}</p>
            <h2>{selectedNode.title}</h2>
            <span className={`progression-status progression-status-${selectedNode.status}`}>{progressionStatusLabels[selectedNode.status]}</span>
          </div>
          <p className="progression-details-summary">{selectedNode.summary}</p>
          <ul>
            {selectedNode.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </aside>
      </section>
    </div>
  );
}
