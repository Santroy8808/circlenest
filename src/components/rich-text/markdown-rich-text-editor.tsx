"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { safeRichTextHref } from "@/components/rich-text/markdown-rich-text";

type TextFormat = "bold" | "italic" | "bulletList" | "numberedList" | "link";
type FormatState = Partial<Record<Exclude<TextFormat, "link">, boolean>>;

export type MarkdownRichTextEditorHandle = {
  focus: () => void;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownInlineToHtml(value: string) {
  let html = escapeHtml(value);
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text: string, href: string) => {
    const safeHref = safeRichTextHref(href);
    return `<a href="${escapeHtml(safeHref)}">${text}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");
  return html || "<br>";
}

function markdownToEditorHtml(value: string) {
  if (!value.trim()) return "";

  return value
    .split("\n")
    .map((line) => {
      const bullet = line.match(/^-\s+(.+)$/);
      if (bullet) return `<ul><li>${markdownInlineToHtml(bullet[1])}</li></ul>`;
      const numbered = line.match(/^(\d+)\.\s+(.+)$/);
      if (numbered) return `<ol><li>${markdownInlineToHtml(numbered[2])}</li></ol>`;
      return `<div>${markdownInlineToHtml(line)}</div>`;
    })
    .join("");
}

function nodeChildrenToMarkdown(node: Node) {
  return Array.from(node.childNodes).map(nodeToMarkdown).join("");
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";

  const tag = node.tagName.toLowerCase();

  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") return `**${nodeChildrenToMarkdown(node)}**`;
  if (tag === "em" || tag === "i") return `_${nodeChildrenToMarkdown(node)}_`;

  if (tag === "a") {
    const text = nodeChildrenToMarkdown(node);
    const href = safeRichTextHref(node.getAttribute("href") ?? "");
    return href === "#" ? text : `[${text}](${href})`;
  }

  if (tag === "ul") {
    return Array.from(node.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((child) => `- ${nodeChildrenToMarkdown(child).trim()}`)
      .join("\n");
  }

  if (tag === "ol") {
    return Array.from(node.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((child, index) => `${index + 1}. ${nodeChildrenToMarkdown(child).trim()}`)
      .join("\n");
  }

  if (tag === "div" || tag === "p") return nodeChildrenToMarkdown(node);
  return nodeChildrenToMarkdown(node);
}

function editorElementToMarkdown(element: HTMLElement) {
  return Array.from(element.childNodes)
    .map(nodeToMarkdown)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function commandForFormat(format: TextFormat) {
  if (format === "bold") return "bold";
  if (format === "italic") return "italic";
  if (format === "bulletList") return "insertUnorderedList";
  if (format === "numberedList") return "insertOrderedList";
  return "createLink";
}

export const MarkdownRichTextEditor = forwardRef<
  MarkdownRichTextEditorHandle,
  {
    disabled?: boolean;
    onChange: (value: string) => void;
    placeholder?: string;
    value: string;
  }
>(function MarkdownRichTextEditor({ disabled = false, onChange, placeholder = "Write details...", value }, ref) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastMarkdownRef = useRef("");
  const [activeFormats, setActiveFormats] = useState<FormatState>({});

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus()
  }));

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (value === lastMarkdownRef.current && editor.innerHTML) return;
    lastMarkdownRef.current = value;
    editor.innerHTML = markdownToEditorHtml(value);
  }, [value]);

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) return;
    const markdown = editorElementToMarkdown(editor);
    lastMarkdownRef.current = markdown;
    onChange(markdown);
  }

  function updateActiveFormats() {
    if (typeof document === "undefined") return;
    setActiveFormats({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      bulletList: document.queryCommandState("insertUnorderedList"),
      numberedList: document.queryCommandState("insertOrderedList")
    });
  }

  function applyFormat(format: TextFormat) {
    if (disabled) return;
    editorRef.current?.focus();

    if (format === "link") {
      const url = window.prompt("Paste the link URL.");
      if (!url) return;
      document.execCommand("createLink", false, safeRichTextHref(url.trim()));
    } else {
      document.execCommand(commandForFormat(format), false);
    }

    emitChange();
    updateActiveFormats();
  }

  return (
    <div className="markdown-rich-editor">
      <div
        aria-label="Listing description"
        className="feed-rich-composer-input markdown-rich-editor-input"
        contentEditable={!disabled}
        data-placeholder={placeholder}
        onBlur={emitChange}
        onInput={() => {
          emitChange();
          updateActiveFormats();
        }}
        onKeyUp={updateActiveFormats}
        onMouseUp={updateActiveFormats}
        onPaste={(event) => {
          event.preventDefault();
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
          emitChange();
        }}
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
      />
      <div className="feed-toolbar markdown-rich-editor-toolbar">
        <div className="feed-format-tools" aria-label="Description formatting">
          {[
            { key: "bold", label: "B", title: "Bold selected text" },
            { key: "italic", label: "I", title: "Italicize selected text" },
            { key: "bulletList", label: "Bullets", title: "Create a bullet list" },
            { key: "numberedList", label: "Numbers", title: "Create a numbered list" },
            { key: "link", label: "Link", title: "Add a link" }
          ].map((tool) => (
            <button
              aria-pressed={tool.key !== "link" ? Boolean(activeFormats[tool.key as keyof FormatState]) : undefined}
              className={tool.key !== "link" && activeFormats[tool.key as keyof FormatState] ? "is-active" : ""}
              disabled={disabled}
              key={tool.key}
              onClick={() => applyFormat(tool.key as TextFormat)}
              onMouseDown={(event) => event.preventDefault()}
              title={tool.title}
              type="button"
            >
              {tool.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});
