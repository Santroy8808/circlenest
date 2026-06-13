"use client";

import { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeightClassName?: string;
};

const TOOLBAR_COMMANDS = [
  { label: "Bold", command: "bold" },
  { label: "Italic", command: "italic" },
  { label: "Underline", command: "underline" },
  { label: "Bullet", command: "insertUnorderedList" },
  { label: "Number", command: "insertOrderedList" },
  { label: "Quote", command: "formatBlock", value: "blockquote" },
];

export function WritersStudioRichTextEditor({ value, onChange, placeholder, disabled = false, minHeightClassName = "min-h-72" }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  function syncValue() {
    onChange(editorRef.current?.innerHTML ?? "");
  }

  function runCommand(command: string, commandValue?: string) {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    syncValue();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--border)] bg-[#0d1320] p-2">
        {TOOLBAR_COMMANDS.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand(item.command, item.value)}
            className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-[var(--accent)]/50 hover:text-[var(--text-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="relative">
        {!value ? (
          <div className="pointer-events-none absolute left-4 top-3 text-sm text-slate-500">{placeholder ?? "Write here..."}</div>
        ) : null}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={syncValue}
          className={`rounded-2xl border border-[var(--border)] bg-[#0d1320] px-4 py-3 text-sm leading-7 text-[var(--text-strong)] outline-none transition focus:border-[var(--accent)]/50 ${minHeightClassName} ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
        />
      </div>
    </div>
  );
}
