"use client";

import { useEffect, useRef } from "react";

type RichTextEditorProps = {
  html: string;
  onChange: (value: { html: string; text: string }) => void;
  placeholder?: string;
};

export function RichTextEditor({ html, onChange, placeholder = "Write here..." }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== html) {
      editor.innerHTML = html;
    }
  }, [html]);

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) return;
    onChange({
      html: editor.innerHTML,
      text: editor.innerText
    });
  }

  function run(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    emitChange();
  }

  function addLink() {
    const href = window.prompt("Paste the link URL");
    if (!href) return;
    if (!href.startsWith("http://") && !href.startsWith("https://") && !href.startsWith("/")) return;
    run("createLink", href);
  }

  return (
    <section className="rich-text-editor">
      <div className="rich-text-toolbar" aria-label="Rich text toolbar">
        <button onClick={() => run("formatBlock", "h2")} type="button">
          H2
        </button>
        <button onClick={() => run("formatBlock", "h3")} type="button">
          H3
        </button>
        <button onClick={() => run("bold")} type="button">
          B
        </button>
        <button onClick={() => run("italic")} type="button">
          I
        </button>
        <button onClick={() => run("underline")} type="button">
          U
        </button>
        <button onClick={() => run("insertUnorderedList")} type="button">
          Bullets
        </button>
        <button onClick={() => run("insertOrderedList")} type="button">
          Numbers
        </button>
        <button onClick={() => run("formatBlock", "blockquote")} type="button">
          Quote
        </button>
        <button onClick={addLink} type="button">
          Link
        </button>
      </div>
      <div
        aria-label="Chapter rich text body"
        className="rich-text-area"
        contentEditable
        data-placeholder={placeholder}
        onInput={emitChange}
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
      />
    </section>
  );
}
