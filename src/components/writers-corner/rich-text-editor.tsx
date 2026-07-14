"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import { RichTextToolbarIcon } from "@/components/writers-corner/rich-text-toolbar-icon";

type RichTextEditorProps = {
  html: string;
  onChange: (value: { html: string; text: string }) => void;
  placeholder?: string;
};

type EditorImageAlignment = "left" | "center" | "right" | "full";

type ToolbarState = {
  alignCenter: boolean;
  alignJustify: boolean;
  alignLeft: boolean;
  alignRight: boolean;
  block: "p" | "h2" | "h3" | "blockquote" | "pre";
  bold: boolean;
  bulletList: boolean;
  italic: boolean;
  numberedList: boolean;
  underline: boolean;
};

type UploadIntentResponse = {
  error?: string;
  intentId?: string;
  publicUrl?: string | null;
  storageKey?: string;
  uploadHeaders?: Record<string, string>;
  uploadUrl?: string;
};

type CompleteUploadResponse = {
  asset?: {
    publicUrl?: string | null;
  };
  error?: string;
};

const EDITOR_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const EDITOR_IMAGE_MIME_TYPE = /^image\/(jpeg|png|gif|webp)$/;
const DEFAULT_TOOLBAR_STATE: ToolbarState = {
  alignCenter: false,
  alignJustify: false,
  alignLeft: true,
  alignRight: false,
  block: "p",
  bold: false,
  bulletList: false,
  italic: false,
  numberedList: false,
  underline: false
};

function editorImageClass(alignment: EditorImageAlignment) {
  return `rich-text-image rich-text-image-${alignment}`;
}

function imageAlignment(image: HTMLImageElement | null): EditorImageAlignment {
  if (!image) return "center";
  if (image.classList.contains("rich-text-image-left")) return "left";
  if (image.classList.contains("rich-text-image-right")) return "right";
  if (image.classList.contains("rich-text-image-full")) return "full";
  return "center";
}

function getRangeFromPoint(x: number, y: number) {
  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(x, y);
  }

  const documentWithCaretPosition = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const position = documentWithCaretPosition.caretPositionFromPoint?.(x, y);
  if (!position) return null;

  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
}

function fileNameForPastedImage(file: File, index: number) {
  if (file.name && file.name !== "image.png") return file.name;
  const extension = file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : file.type === "image/jpeg" ? "jpg" : "png";
  return `blog-image-${Date.now()}-${index}.${extension}`;
}

export function RichTextEditor({ html, onChange, placeholder = "Write here..." }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const draggedImageRef = useRef<HTMLImageElement | null>(null);
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [toolbarState, setToolbarState] = useState<ToolbarState>(DEFAULT_TOOLBAR_STATE);
  const [uploadStatus, setUploadStatus] = useState("");

  const refreshToolbarState = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) return;

    const commandState = (command: string) => {
      try {
        return document.queryCommandState(command);
      } catch {
        return false;
      }
    };
    const anchorElement = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
    const blockElement = anchorElement?.closest("p, h2, h3, blockquote, pre");
    const blockTag = blockElement?.tagName.toLowerCase();
    const block = ["h2", "h3", "blockquote", "pre"].includes(blockTag ?? "")
      ? (blockTag as ToolbarState["block"])
      : "p";

    setToolbarState({
      alignCenter: commandState("justifyCenter"),
      alignJustify: commandState("justifyFull"),
      alignLeft: commandState("justifyLeft"),
      alignRight: commandState("justifyRight"),
      block,
      bold: commandState("bold"),
      bulletList: commandState("insertUnorderedList"),
      italic: commandState("italic"),
      numberedList: commandState("insertOrderedList"),
      underline: commandState("underline")
    });
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== html) {
      editor.innerHTML = html;
      decorateImages();
    }
  }, [html]);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshToolbarState);
    return () => document.removeEventListener("selectionchange", refreshToolbarState);
  }, [refreshToolbarState]);

  function decorateImages() {
    const editor = editorRef.current;
    if (!editor) return;

    editor.querySelectorAll("img").forEach((image) => {
      if (!image.classList.contains("rich-text-image")) {
        image.className = editorImageClass("center");
      }
      image.draggable = true;
      image.contentEditable = "false";
      image.loading = "lazy";
      image.alt = image.alt || "Blog image";
    });
  }

  function saveSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }

  function selectImage(image: HTMLImageElement | null) {
    editorRef.current?.querySelectorAll("img.is-selected").forEach((selected) => selected.classList.remove("is-selected"));
    if (image) image.classList.add("is-selected");
    setSelectedImage(image);
  }

  function snapshotHtml() {
    const editor = editorRef.current;
    if (!editor) return "";

    const clone = editor.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("img").forEach((image) => {
      image.classList.remove("is-selected");
      image.removeAttribute("contenteditable");
    });
    return clone.innerHTML;
  }

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) return;
    decorateImages();
    onChange({
      html: snapshotHtml(),
      text: editor.innerText
    });
  }

  function run(command: string, value?: string) {
    restoreSelection();
    document.execCommand(command, false, value);
    decorateImages();
    saveSelection();
    emitChange();
    refreshToolbarState();
  }

  function applyColor(command: "foreColor" | "hiliteColor", value: string) {
    restoreSelection();
    document.execCommand("styleWithCSS", false, "true");
    const applied = document.execCommand(command, false, value);
    if (!applied && command === "hiliteColor") document.execCommand("backColor", false, value);
    document.execCommand("styleWithCSS", false, "false");
    saveSelection();
    emitChange();
    refreshToolbarState();
  }

  function addLink() {
    const href = window.prompt("Paste the link URL");
    if (!href) return;
    if (!href.startsWith("http://") && !href.startsWith("https://") && !href.startsWith("/")) return;
    run("createLink", href);
  }

  function changeIndent(direction: 1 | -1) {
    const editor = editorRef.current;
    const range = restoreSelection();
    if (!editor || !range) return;

    const container = range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    const block = container?.closest("p, div, h2, h3, blockquote, pre, li") as HTMLElement | null;
    if (!block || !editor.contains(block)) return;

    const currentIndent = Number.parseInt(block.style.marginLeft, 10) || 0;
    const nextIndent = Math.min(320, Math.max(0, currentIndent + direction * 40));
    if (nextIndent === 0) block.style.removeProperty("margin-left");
    else block.style.marginLeft = `${nextIndent}px`;
    saveSelection();
    emitChange();
  }

  function insertTable() {
    const rowInput = window.prompt("How many rows? (1-10)", "3");
    if (rowInput === null) return;
    const columnInput = window.prompt("How many columns? (1-8)", "3");
    if (columnInput === null) return;

    const rows = Number.parseInt(rowInput, 10);
    const columns = Number.parseInt(columnInput, 10);
    if (!Number.isInteger(rows) || rows < 1 || rows > 10 || !Number.isInteger(columns) || columns < 1 || columns > 8) {
      setUploadStatus("Tables can have 1-10 rows and 1-8 columns.");
      return;
    }

    const cells = `<td><br></td>`.repeat(columns);
    run("insertHTML", `<table><tbody>${`<tr>${cells}</tr>`.repeat(rows)}</tbody></table><p><br></p>`);
  }

  function restoreSelection() {
    const editor = editorRef.current;
    if (!editor) return null;

    const selection = window.getSelection();
    const range = savedRangeRef.current;
    editor.focus();

    if (selection && range && editor.contains(range.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
      return range;
    }

    const fallbackRange = document.createRange();
    fallbackRange.selectNodeContents(editor);
    fallbackRange.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(fallbackRange);
    return fallbackRange;
  }

  function insertImage(publicUrl: string, fileName: string, rangeOverride?: Range | null) {
    const editor = editorRef.current;
    if (!editor) return;

    const range = rangeOverride ?? restoreSelection();
    if (!range) return;

    const image = document.createElement("img");
    image.src = publicUrl;
    image.alt = fileName.replace(/\.[a-z0-9]+$/i, "") || "Blog image";
    image.className = editorImageClass("center");
    image.draggable = true;
    image.loading = "lazy";
    image.contentEditable = "false";

    range.deleteContents();
    range.insertNode(image);

    const afterImage = document.createRange();
    afterImage.setStartAfter(image);
    afterImage.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(afterImage);
    savedRangeRef.current = afterImage.cloneRange();
    selectImage(image);
    emitChange();
  }

  async function uploadEditorImage(file: File, index = 0) {
    if (!EDITOR_IMAGE_MIME_TYPE.test(file.type)) {
      throw new Error("Paste a JPG, PNG, GIF, or WEBP image.");
    }
    if (file.size > EDITOR_IMAGE_MAX_BYTES) {
      throw new Error("Images must be 15MB or smaller.");
    }

    const fileName = fileNameForPastedImage(file, index);
    setUploadStatus(`Uploading ${fileName}...`);
    const intentResponse = await fetch("/api/media/upload-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName,
        mimeType: file.type,
        sizeBytes: file.size,
        source: "BUSINESS_MEDIA",
        visibility: "PUBLIC"
      })
    });
    const intent = (await intentResponse.json().catch(() => null)) as UploadIntentResponse | null;

    if (!intentResponse.ok || !intent?.intentId || !intent.storageKey || !intent.uploadUrl) {
      throw new Error(intent?.error ?? "Could not prepare image upload.");
    }

    await uploadWithResilientFallback({
      file,
      onProgress: (progress) => setUploadStatus(`Uploading ${fileName}... ${progress}%`),
      proxyFallback: {
        access: "public",
        url: "/api/media/proxy-upload"
      },
      storageKey: intent.storageKey,
      uploadHeaders: intent.uploadHeaders,
      uploadUrl: intent.uploadUrl
    });

    const completeResponse = await fetch("/api/media/complete-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commentsEnabled: false,
        fileName,
        intentId: intent.intentId,
        mimeType: file.type,
        sizeBytes: file.size,
        source: "BUSINESS_MEDIA",
        storageKey: intent.storageKey,
        tags: ["Writers Corner"],
        visibility: "PUBLIC"
      })
    });
    const complete = (await completeResponse.json().catch(() => null)) as CompleteUploadResponse | null;

    if (!completeResponse.ok) {
      throw new Error(complete?.error ?? "Could not finish image upload.");
    }

    const publicUrl = complete?.asset?.publicUrl ?? intent.publicUrl;
    if (!publicUrl) {
      throw new Error("Uploaded image is missing a public URL.");
    }

    return { fileName, publicUrl };
  }

  async function uploadAndInsertImages(files: File[], rangeOverride?: Range | null) {
    if (files.length === 0) return;

    try {
      for (const [index, file] of files.entries()) {
        const uploaded = await uploadEditorImage(file, index);
        insertImage(uploaded.publicUrl, uploaded.fileName, index === 0 ? rangeOverride : undefined);
      }
      setUploadStatus(files.length === 1 ? "Image inserted." : "Images inserted.");
      window.setTimeout(() => setUploadStatus(""), 2400);
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "Could not insert image.");
    }
  }

  function imageFilesFromDataTransfer(dataTransfer: DataTransfer | null) {
    if (!dataTransfer) return [];

    const itemFiles = Array.from(dataTransfer.items ?? [])
      .filter((item) => item.kind === "file" && EDITOR_IMAGE_MIME_TYPE.test(item.type))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (itemFiles.length > 0) return itemFiles;

    return Array.from(dataTransfer.files ?? []).filter((file) => EDITOR_IMAGE_MIME_TYPE.test(file.type));
  }

  function alignSelectedImage(alignment: EditorImageAlignment) {
    if (!selectedImage) return;
    selectedImage.className = editorImageClass(alignment);
    selectedImage.classList.add("is-selected");
    emitChange();
  }

  function removeSelectedImage() {
    if (!selectedImage) return;
    const image = selectedImage;
    selectImage(null);
    image.remove();
    emitChange();
  }

  function moveDraggedImage(event: React.DragEvent<HTMLDivElement>) {
    const editor = editorRef.current;
    const image = draggedImageRef.current;
    if (!editor || !image) return;

    const range = getRangeFromPoint(event.clientX, event.clientY);
    if (!range || !editor.contains(range.commonAncestorContainer) || image.contains(range.commonAncestorContainer)) return;

    event.preventDefault();
    image.remove();
    range.insertNode(image);

    const afterImage = document.createRange();
    afterImage.setStartAfter(image);
    afterImage.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(afterImage);
    savedRangeRef.current = afterImage.cloneRange();
    selectImage(image);
    emitChange();
  }

  const selectedAlignment = imageAlignment(selectedImage);

  return (
    <section className="rich-text-editor">
      <div
        aria-label="Chapter formatting toolbar"
        className="rich-text-toolbar"
        onMouseDown={(event) => {
          saveSelection();
          const target = event.target instanceof Element ? event.target : null;
          if (target?.closest("button")) event.preventDefault();
        }}
        role="toolbar"
      >
        <span className="rich-text-toolbar-section" aria-label="History controls">
          <button aria-label="Undo" onClick={() => run("undo")} title="Undo (Ctrl+Z)" type="button">
            <RichTextToolbarIcon name="undo" />
          </button>
          <button aria-label="Redo" onClick={() => run("redo")} title="Redo (Ctrl+Y)" type="button">
            <RichTextToolbarIcon name="redo" />
          </button>
        </span>
        <span className="rich-text-toolbar-section rich-text-toolbar-format-section">
          <select
            aria-label="Paragraph style"
            onChange={(event) => run("formatBlock", event.target.value)}
            title="Paragraph style"
            value={toolbarState.block}
          >
            <option value="p">Paragraph</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="blockquote">Quote</option>
            <option value="pre">Code block</option>
          </select>
        </span>
        <span className="rich-text-toolbar-section" aria-label="Color controls">
          <label aria-label="Text color" className="rich-text-color-control" onMouseDown={saveSelection} title="Text color">
            <span aria-hidden="true" className="rich-text-color-symbol">A</span>
            <span aria-hidden="true" className="rich-text-color-swatch rich-text-color-swatch-text" />
            <input defaultValue="#18202b" onChange={(event) => applyColor("foreColor", event.target.value)} type="color" />
          </label>
          <label aria-label="Highlight color" className="rich-text-color-control" onMouseDown={saveSelection} title="Highlight color">
            <span aria-hidden="true" className="rich-text-highlight-symbol">◆</span>
            <span aria-hidden="true" className="rich-text-color-swatch rich-text-color-swatch-highlight" />
            <input defaultValue="#ffe58a" onChange={(event) => applyColor("hiliteColor", event.target.value)} type="color" />
          </label>
        </span>
        <span className="rich-text-toolbar-section" aria-label="Text emphasis controls">
          <button
            aria-label="Bold"
            aria-pressed={toolbarState.bold}
            className={toolbarState.bold ? "is-active" : undefined}
            onClick={() => run("bold")}
            title="Bold (Ctrl+B)"
            type="button"
          >
            <RichTextToolbarIcon name="bold" />
          </button>
          <button
            aria-label="Italic"
            aria-pressed={toolbarState.italic}
            className={toolbarState.italic ? "is-active" : undefined}
            onClick={() => run("italic")}
            title="Italic (Ctrl+I)"
            type="button"
          >
            <RichTextToolbarIcon name="italic" />
          </button>
          <button
            aria-label="Underline"
            aria-pressed={toolbarState.underline}
            className={toolbarState.underline ? "is-active" : undefined}
            onClick={() => run("underline")}
            title="Underline (Ctrl+U)"
            type="button"
          >
            <RichTextToolbarIcon name="underline" />
          </button>
        </span>
        <span className="rich-text-toolbar-section" aria-label="Alignment controls">
          <button aria-label="Align left" aria-pressed={toolbarState.alignLeft} className={toolbarState.alignLeft ? "is-active" : undefined} onClick={() => run("justifyLeft")} title="Align left" type="button">
            <RichTextToolbarIcon name="align-left" />
          </button>
          <button aria-label="Align center" aria-pressed={toolbarState.alignCenter} className={toolbarState.alignCenter ? "is-active" : undefined} onClick={() => run("justifyCenter")} title="Align center" type="button">
            <RichTextToolbarIcon name="align-center" />
          </button>
          <button aria-label="Align right" aria-pressed={toolbarState.alignRight} className={toolbarState.alignRight ? "is-active" : undefined} onClick={() => run("justifyRight")} title="Align right" type="button">
            <RichTextToolbarIcon name="align-right" />
          </button>
          <button aria-label="Justify" aria-pressed={toolbarState.alignJustify} className={toolbarState.alignJustify ? "is-active" : undefined} onClick={() => run("justifyFull")} title="Justify" type="button">
            <RichTextToolbarIcon name="align-justify" />
          </button>
        </span>
        <span className="rich-text-toolbar-section" aria-label="Indent controls">
          <button aria-label="Increase indent" onClick={() => changeIndent(1)} title="Increase indent" type="button">
            <RichTextToolbarIcon name="indent" />
          </button>
          <button aria-label="Decrease indent" onClick={() => changeIndent(-1)} title="Decrease indent" type="button">
            <RichTextToolbarIcon name="outdent" />
          </button>
        </span>
        <span className="rich-text-toolbar-section" aria-label="List controls">
          <button aria-label="Bulleted list" aria-pressed={toolbarState.bulletList} className={toolbarState.bulletList ? "is-active" : undefined} onClick={() => run("insertUnorderedList")} title="Bulleted list" type="button">
            <RichTextToolbarIcon name="list" />
          </button>
          <button aria-label="Numbered list" aria-pressed={toolbarState.numberedList} className={toolbarState.numberedList ? "is-active" : undefined} onClick={() => run("insertOrderedList")} title="Numbered list" type="button">
            <RichTextToolbarIcon name="list-ordered" />
          </button>
        </span>
        <span className="rich-text-toolbar-section" aria-label="Link controls">
          <button aria-label="Add link" onClick={addLink} title="Add link" type="button">
            <RichTextToolbarIcon name="link" />
          </button>
          <button aria-label="Remove link" onClick={() => run("unlink")} title="Remove link" type="button">
            <RichTextToolbarIcon name="unlink" />
          </button>
        </span>
        <span className="rich-text-toolbar-section" aria-label="Insert controls">
          <button aria-label="Insert table" onClick={insertTable} title="Insert table" type="button">
            <RichTextToolbarIcon name="table" />
          </button>
          <button aria-label="Insert image" onClick={() => imageInputRef.current?.click()} title="Insert image" type="button">
            <RichTextToolbarIcon name="image" />
          </button>
          <input
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="rich-text-file-input"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              const insertionRange = savedRangeRef.current?.cloneRange() ?? null;
              event.target.value = "";
              void uploadAndInsertImages(files, insertionRange);
            }}
            ref={imageInputRef}
            type="file"
          />
          <button
            aria-label="Code block"
            aria-pressed={toolbarState.block === "pre"}
            className={toolbarState.block === "pre" ? "is-active" : undefined}
            onClick={() => run("formatBlock", toolbarState.block === "pre" ? "p" : "pre")}
            title="Code block"
            type="button"
          >
            <RichTextToolbarIcon name="code" />
          </button>
        </span>
        {selectedImage ? (
          <span className="rich-text-toolbar-group" aria-label="Selected image controls">
            <button className={selectedAlignment === "left" ? "is-active" : ""} onClick={() => alignSelectedImage("left")} type="button">
              Image left
            </button>
            <button className={selectedAlignment === "center" ? "is-active" : ""} onClick={() => alignSelectedImage("center")} type="button">
              Image center
            </button>
            <button className={selectedAlignment === "right" ? "is-active" : ""} onClick={() => alignSelectedImage("right")} type="button">
              Image right
            </button>
            <button className={selectedAlignment === "full" ? "is-active" : ""} onClick={() => alignSelectedImage("full")} type="button">
              Full width
            </button>
            <button onClick={removeSelectedImage} type="button">
              <RichTextToolbarIcon name="remove" /> Remove image
            </button>
          </span>
        ) : null}
      </div>
      <div
        aria-label="Chapter rich text body"
        className="rich-text-area"
        contentEditable
        data-placeholder={placeholder}
        onBlur={saveSelection}
        onClick={(event) => {
          const target = event.target;
          selectImage(target instanceof HTMLImageElement ? target : null);
          saveSelection();
        }}
        onDragEnd={() => {
          draggedImageRef.current = null;
        }}
        onDragOver={(event) => {
          const hasImageFiles = imageFilesFromDataTransfer(event.dataTransfer).length > 0;
          if (draggedImageRef.current || hasImageFiles) event.preventDefault();
        }}
        onDragStart={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLImageElement)) return;
          draggedImageRef.current = target;
          selectImage(target);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", target.alt || "Blog image");
        }}
        onDrop={(event) => {
          const imageFiles = imageFilesFromDataTransfer(event.dataTransfer);
          if (imageFiles.length > 0) {
            event.preventDefault();
            const dropRange = getRangeFromPoint(event.clientX, event.clientY);
            void uploadAndInsertImages(imageFiles, dropRange);
            return;
          }

          moveDraggedImage(event);
        }}
        onInput={() => {
          decorateImages();
          saveSelection();
          emitChange();
        }}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onPaste={(event) => {
          saveSelection();
          const imageFiles = imageFilesFromDataTransfer(event.clipboardData);
          if (imageFiles.length === 0) {
            window.setTimeout(() => {
              decorateImages();
              emitChange();
            }, 0);
            return;
          }

          event.preventDefault();
          void uploadAndInsertImages(imageFiles);
        }}
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
      />
      <div className="rich-text-help">
        Format selected text with the toolbar. Paste, drop, or choose images; drag an inserted image to move it, or click it for image alignment controls.
      </div>
      {uploadStatus ? <div className="rich-text-upload-status">{uploadStatus}</div> : null}
    </section>
  );
}
