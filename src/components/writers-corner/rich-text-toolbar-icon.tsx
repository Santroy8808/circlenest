import type { ReactNode } from "react";

export type RichTextToolbarIconName =
  | "align-center"
  | "align-justify"
  | "align-left"
  | "align-right"
  | "bold"
  | "code"
  | "image"
  | "indent"
  | "italic"
  | "link"
  | "list"
  | "list-ordered"
  | "outdent"
  | "redo"
  | "remove"
  | "table"
  | "underline"
  | "unlink"
  | "undo";

const iconPaths: Record<RichTextToolbarIconName, ReactNode> = {
  "align-center": (
    <>
      <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />
    </>
  ),
  "align-justify": (
    <>
      <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </>
  ),
  "align-left": (
    <>
      <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
    </>
  ),
  "align-right": (
    <>
      <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />
    </>
  ),
  bold: <path d="M8 5h5.2a3.3 3.3 0 0 1 0 6.6H8zm0 6.6h6a3.7 3.7 0 0 1 0 7.4H8z" />,
  code: (
    <>
      <path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" />
    </>
  ),
  image: (
    <>
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m21 15-5-5L5 20" />
    </>
  ),
  indent: (
    <>
      <path d="M11 6h9M11 10h9M11 14h9M11 18h9M4 8l4 4-4 4" />
    </>
  ),
  italic: <path d="M10 5h7M7 19h7M14 5 10 19" />,
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  "list-ordered": (
    <>
      <path d="M10 6h10M10 12h10M10 18h10M4 5h1v3M4 11h2l-2 3h2M4 17h2l-2 2h2" />
    </>
  ),
  outdent: (
    <>
      <path d="M11 6h9M11 10h9M11 14h9M11 18h9M8 8l-4 4 4 4" />
    </>
  ),
  redo: <path d="m15 6 4 4-4 4M19 10h-8a6 6 0 0 0-6 6v2" />,
  remove: (
    <>
      <path d="M6 7h12M10 11v5M14 11v5M8 7l1 12h6l1-12M9 7l1-2h4l1 2" />
    </>
  ),
  table: (
    <>
      <rect height="16" rx="1" width="18" x="3" y="4" />
      <path d="M3 10h18M3 15h18M9 4v16M15 4v16" />
    </>
  ),
  underline: <path d="M7 5v6a5 5 0 0 0 10 0V5M5 20h14" />,
  unlink: (
    <>
      <path d="m5 5 14 14M9.5 14.5l-2 2a4 4 0 0 0 5.7 5.7l2-2M14.5 9.5l2-2a4 4 0 0 0-5.7-5.7l-2 2" />
    </>
  ),
  undo: <path d="m9 6-4 4 4 4M5 10h8a6 6 0 0 1 6 6v2" />
};

export function RichTextToolbarIcon({ name }: { name: RichTextToolbarIconName }) {
  return (
    <svg aria-hidden="true" className="rich-text-toolbar-icon" fill="none" viewBox="0 0 24 24">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        {iconPaths[name]}
      </g>
    </svg>
  );
}
