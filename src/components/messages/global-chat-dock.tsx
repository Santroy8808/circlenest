"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ThreadClient } from "@/components/messages/thread-client";

type OpenChatDetail = {
  threadId: string;
  title?: string;
  subtitle?: string;
};

const STORAGE_KEY = "theta.activeChatThreadId";
const STORAGE_GEOMETRY_KEY = "theta.activeChatThreadGeometry";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function GlobalChatDock({ myUserId }: { myUserId: string }) {
  const windowRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const positionRef = useRef({ x: 24, y: 88 });
  const [position, setPosition] = useState({ x: 24, y: 88 });
  const [size, setSize] = useState({ width: 860, height: 760 });
  const [dragging, setDragging] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [title, setTitle] = useState("Chat");
  const [subtitle, setSubtitle] = useState("Opening thread...");

  useEffect(() => {
    const width = typeof window === "undefined" ? 280 : Math.min(280, Math.max(280, Math.floor(window.innerWidth * 0.31)));
    const height = typeof window === "undefined" ? 760 : Math.min(760, Math.max(420, Math.floor(window.innerHeight * 0.76)));
    const left = typeof window === "undefined" ? 24 : window.innerWidth < 900 ? 8 : Math.max(24, window.innerWidth - width - 24);
    const top = typeof window === "undefined" ? 88 : window.innerHeight < 760 ? 8 : 96;
    try {
      const geometry = window.localStorage.getItem(STORAGE_GEOMETRY_KEY);
      if (geometry) {
        const parsed = JSON.parse(geometry) as { width?: number; height?: number; x?: number; y?: number } | null;
        if (parsed) {
          setSize({
            width: typeof parsed.width === "number" ? parsed.width : width,
            height: typeof parsed.height === "number" ? parsed.height : height,
          });
          const nextPosition = {
            x: typeof parsed.x === "number" ? parsed.x : left,
            y: typeof parsed.y === "number" ? parsed.y : top,
          };
          setPosition(nextPosition);
          positionRef.current = nextPosition;
          return;
        }
      }
    } catch {}
    setSize({ width, height });
    setPosition({ x: left, y: top });
    positionRef.current = { x: left, y: top };
  }, []);

  const openChat = useCallback((detail: OpenChatDetail) => {
    setActiveThreadId(detail.threadId);
    setTitle(detail.title?.trim() || "Chat");
    setSubtitle(detail.subtitle?.trim() || "Opening thread...");
    try {
      window.localStorage.setItem(STORAGE_KEY, detail.threadId);
    } catch {}
  }, []);

  const closeChat = useCallback(() => {
    setActiveThreadId("");
    setTitle("Chat");
    setSubtitle("Opening thread...");
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  useEffect(() => {
    if (!activeThreadId) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, activeThreadId);
      window.localStorage.setItem(
        STORAGE_GEOMETRY_KEY,
        JSON.stringify({ x: position.x, y: position.y, width: size.width, height: size.height }),
      );
    } catch {}
  }, [activeThreadId, position.x, position.y, size.height, size.width]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setActiveThreadId(stored);
    } catch {}
    function handleOpen(event: Event) {
      const detail = (event as CustomEvent<OpenChatDetail>).detail;
      if (detail?.threadId) openChat(detail);
    }
    function handleClose() {
      closeChat();
    }
    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY && event.newValue) setActiveThreadId(event.newValue);
      if (event.key === STORAGE_GEOMETRY_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as { width?: number; height?: number; x?: number; y?: number } | null;
          if (parsed) {
            if (typeof parsed.width === "number" && typeof parsed.height === "number") {
              setSize({ width: parsed.width, height: parsed.height });
            }
            if (typeof parsed.x === "number" && typeof parsed.y === "number") {
              const next = { x: parsed.x, y: parsed.y };
              setPosition(next);
              positionRef.current = next;
            }
          }
        } catch {}
      }
    }
    window.addEventListener("theta-chat-open", handleOpen as EventListener);
    window.addEventListener("theta-chat-close", handleClose);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("theta-chat-open", handleOpen as EventListener);
      window.removeEventListener("theta-chat-close", handleClose);
      window.removeEventListener("storage", handleStorage);
    };
  }, [closeChat, openChat]);

  useEffect(() => {
    function handleMove(event: PointerEvent) {
      if (dragRef.current && windowRef.current) {
        const bounds = windowRef.current.getBoundingClientRect();
        const nextX = clamp(event.clientX - dragRef.current.offsetX, 8, Math.max(8, window.innerWidth - bounds.width - 8));
        const nextY = clamp(event.clientY - dragRef.current.offsetY, 8, Math.max(8, window.innerHeight - bounds.height - 8));
        positionRef.current = { x: nextX, y: nextY };
        setPosition({ x: nextX, y: nextY });
      }
      if (resizeRef.current) {
        const currentPosition = positionRef.current;
        const nextWidth = clamp(
          resizeRef.current.startWidth + (event.clientX - resizeRef.current.startX),
          420,
          Math.max(280, window.innerWidth - currentPosition.x - 8),
        );
        const nextHeight = clamp(
          resizeRef.current.startHeight + (event.clientY - resizeRef.current.startY),
          280,
          Math.max(280, window.innerHeight - currentPosition.y - 8),
        );
        setSize({ width: nextWidth, height: nextHeight });
      }
    }

    function handleUp() {
      dragRef.current = null;
      resizeRef.current = null;
      setDragging(false);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, []);

  if (!activeThreadId) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[120]">
      <div
        ref={windowRef}
        className="pointer-events-auto fixed flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[#0b1422] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        style={{ left: position.x, top: position.y, width: size.width, height: size.height, minWidth: 280, minHeight: 280 }}
      >
        <div
          className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[#111b2d] px-4 py-3"
          style={{ touchAction: "none", cursor: dragging ? "grabbing" : "grab" }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            dragRef.current = {
              offsetX: event.clientX - position.x,
              offsetY: event.clientY - position.y,
            };
            setDragging(true);
          }}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{title}</p>
            <p className="truncate text-xs text-slate-400">{subtitle}</p>
          </div>
          <button
            type="button"
            className="rounded border border-[var(--border)] px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/5"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={closeChat}
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex flex-1 flex-col overflow-hidden p-3">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[#0e1728]">
            <ThreadClient threadId={activeThreadId} myUserId={myUserId} embedded onClose={closeChat} />
          </div>
        </div>
        <button
          type="button"
          aria-label="Resize chat window"
          className="absolute bottom-1 right-1 h-5 w-5 cursor-se-resize rounded-sm border border-[var(--border)] bg-[#152238] text-[0px] opacity-70 transition hover:opacity-100"
          style={{ touchAction: "none" }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            resizeRef.current = {
              startX: event.clientX,
              startY: event.clientY,
              startWidth: size.width,
              startHeight: size.height,
            };
          }}
        />
      </div>
    </div>
  );
}
