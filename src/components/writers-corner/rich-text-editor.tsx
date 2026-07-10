"use client";

import { useEffect, useRef, useState } from "react";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";

type RichTextEditorProps = {
  html: string;
  onChange: (value: { html: string; text: string }) => void;
  placeholder?: string;
};

type EditorImageAlignment = "left" | "center" | "right" | "full";

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
  const savedRangeRef = useRef<Range | null>(null);
  const draggedImageRef = useRef<HTMLImageElement | null>(null);
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== html) {
      editor.innerHTML = html;
      decorateImages();
    }
  }, [html]);

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
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    decorateImages();
    emitChange();
  }

  function addLink() {
    const href = window.prompt("Paste the link URL");
    if (!href) return;
    if (!href.startsWith("http://") && !href.startsWith("https://") && !href.startsWith("/")) return;
    run("createLink", href);
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
        insertImage(uploaded.publicUrl, uploaded.fileName, rangeOverride);
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
              Remove image
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
        Paste or drop images directly into the editor. Drag an inserted image to move it, or click it for left/center/right/full-width controls.
      </div>
      {uploadStatus ? <div className="rich-text-upload-status">{uploadStatus}</div> : null}
    </section>
  );
}
