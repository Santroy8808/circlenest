"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

export type CommentThreadAuthor = {
  username: string;
  fullName?: string | null;
};

export type CommentThreadItem = {
  id: string;
  parentCommentId?: string | null;
  content: string;
  mediaUrlsJson?: string | null;
  createdAt: string | Date;
  author: CommentThreadAuthor;
};

type CommentNode<T extends CommentThreadItem> = T & { children: CommentNode<T>[] };

type CommentThreadProps<T extends CommentThreadItem> = {
  comments: T[];
  emptyText?: string;
  compact?: boolean;
  onReply?: (comment: T) => void;
  renderActions?: (comment: T) => ReactNode;
  renderMeta?: (comment: T) => ReactNode;
  onOpenMedia?: (url: string, comment: T) => void;
  className?: string;
  emptyClassName?: string;
  replyLabel?: string;
};

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function formatDefaultTimestamp(value: string | Date): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function parseMedia(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function buildCommentTree<T extends CommentThreadItem>(comments: T[]): CommentNode<T>[] {
  const byId = new Map<string, CommentNode<T>>();
  const roots: CommentNode<T>[] = [];
  const sorted = [...comments].sort((a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime());

  for (const comment of sorted) {
    byId.set(comment.id, { ...comment, children: [] });
  }

  for (const comment of sorted) {
    const node = byId.get(comment.id);
    if (!node) continue;
    if (comment.parentCommentId) {
      const parent = byId.get(comment.parentCommentId);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  return roots;
}

export function CommentThread<T extends CommentThreadItem>({
  comments,
  emptyText = "No comments yet.",
  compact = false,
  onReply,
  renderActions,
  renderMeta,
  onOpenMedia,
  className = "space-y-3",
  emptyClassName = "rounded border border-[var(--border)] bg-[#11192a] px-3 py-3 text-sm text-slate-400",
  replyLabel = "Reply",
}: CommentThreadProps<T>) {
  const tree = useMemo(() => buildCommentTree(comments), [comments]);
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});

  function renderNode(node: CommentNode<T>, depth = 0): ReactNode {
    const collapsed = Boolean(collapsedIds[node.id]);
    const media = parseMedia(node.mediaUrlsJson);
    const bubbleTone = depth > 0 ? "bg-[#141d2d]" : "bg-[#11192a]";
    const bubbleSpacing = compact ? "px-3 py-2" : "px-4 py-3";
    const contentSize = compact ? "text-[12px]" : "text-sm";
    const metaSize = compact ? "text-[10px]" : "text-[11px]";
    const mediaHeight = compact ? "h-20" : "h-24";

    return (
      <div key={node.id} className="space-y-2" style={{ marginLeft: depth ? `${Math.min(depth, 5) * (compact ? 12 : 14)}px` : 0 }}>
        <article className={`rounded-[18px] border border-[var(--border)] ${bubbleTone} ${bubbleSpacing} shadow-[0_10px_24px_rgba(0,0,0,0.18)]`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${metaSize} text-slate-400`}>
                <Link href={`/profile/${node.author.username}`} className="truncate font-semibold text-amber-200 hover:underline">
                  @{node.author.username}
                </Link>
                {node.author.fullName ? <span className="truncate text-slate-300">{node.author.fullName}</span> : null}
                <span>{renderMeta ? renderMeta(node) : formatDefaultTimestamp(node.createdAt)}</span>
              </div>
            </div>
            {node.children.length > 0 ? (
              <button
                type="button"
                className={`shrink-0 rounded-full border border-[var(--border)] px-2 py-1 ${metaSize} text-slate-300 hover:bg-white/5`}
                aria-expanded={!collapsed}
                onClick={() => setCollapsedIds((previous) => ({ ...previous, [node.id]: !previous[node.id] }))}
              >
                {collapsed ? `Show ${node.children.length} repl${node.children.length === 1 ? "y" : "ies"}` : "Hide replies"}
              </button>
            ) : null}
          </div>

          {node.content ? <p className={`mt-2 whitespace-pre-wrap leading-6 text-slate-100 ${contentSize}`}>{node.content}</p> : null}

          {media.length ? (
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              {media.map((url) =>
                onOpenMedia ? (
                  <button key={`${node.id}-${url}`} type="button" className="text-left" onClick={() => onOpenMedia(url, node)}>
                    <Image
                      src={url}
                      alt="Comment media"
                      width={560}
                      height={420}
                      unoptimized
                      className={`${mediaHeight} w-full rounded-md object-cover`}
                    />
                  </button>
                ) : (
                  <a key={`${node.id}-${url}`} href={url} target="_blank" rel="noreferrer" className="block">
                    <Image
                      src={url}
                      alt="Comment media"
                      width={560}
                      height={420}
                      unoptimized
                      className={`${mediaHeight} w-full rounded-md object-cover`}
                    />
                  </a>
                ),
              )}
            </div>
          ) : null}

          {(onReply || renderActions) ? (
            <div className={`mt-3 flex flex-wrap items-center gap-3 ${metaSize} text-slate-300`}>
              {onReply ? (
                <button type="button" className="font-medium text-amber-200 hover:text-amber-100 hover:underline" onClick={() => onReply(node)}>
                  {replyLabel}
                </button>
              ) : null}
              {renderActions ? <div className="flex flex-wrap items-center gap-2">{renderActions(node)}</div> : null}
            </div>
          ) : null}
        </article>

        {!collapsed && node.children.length > 0 ? <div className="space-y-2">{node.children.map((child) => renderNode(child, depth + 1))}</div> : null}
      </div>
    );
  }

  return <div className={className}>{tree.length ? tree.map((node) => renderNode(node)) : <p className={emptyClassName}>{emptyText}</p>}</div>;
}
