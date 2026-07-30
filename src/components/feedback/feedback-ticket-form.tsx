"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { uploadWithResilientFallback } from "@/lib/client/resilient-upload";
import type { FeedbackPageContext } from "@/lib/client/recent-activity";
import {
  FEEDBACK_SCREENSHOT_MAX_BYTES,
  FEEDBACK_TYPE_OPTIONS,
  type ConfiguredFeedbackKind
} from "@/modules/feedback-support/config";

type ScreenshotState = {
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
};

type UploadIntentResponse = {
  error?: string;
  intent?: { id: string };
  uploadUrl?: string;
  uploadHeaders?: Record<string, string>;
};

function animationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function capturedVideoFrame(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    if (typeof video.requestVideoFrameCallback === "function") {
      video.requestVideoFrameCallback(() => resolve());
      return;
    }
    window.setTimeout(resolve, 100);
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("The screenshot could not be prepared.")),
      "image/jpeg",
      quality
    );
  });
}

async function captureCurrentTabScreenshot(
  setCaptureHidden: (hidden: boolean) => void
) {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screenshot capture is not supported by this browser. You can continue without one.");
  }

  let stream: MediaStream | null = null;
  try {
    setCaptureHidden(true);
    await animationFrame();
    await animationFrame();

    const options = {
      video: {
        displaySurface: "browser"
      },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: "include",
      surfaceSwitching: "exclude",
      monitorTypeSurfaces: "exclude"
    } as DisplayMediaStreamOptions;
    stream = await navigator.mediaDevices.getDisplayMedia(options);
    const track = stream.getVideoTracks()[0];
    const displaySurface = (track?.getSettings() as MediaTrackSettings & { displaySurface?: string })?.displaySurface;
    if (displaySurface !== "browser") {
      throw new Error("This browser could not confirm a tab-only capture. Continue without a screenshot.");
    }

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    if (!video.videoWidth || !video.videoHeight) {
      await new Promise<void>((resolve) => {
        video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      });
    }
    await capturedVideoFrame(video);
    await capturedVideoFrame(video);

    const scale = Math.min(1, 1600 / video.videoWidth, 1200 / video.videoHeight);
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The screenshot could not be prepared.");
    context.drawImage(video, 0, 0, width, height);

    let blob = await canvasBlob(canvas, 0.78);
    for (const quality of [0.68, 0.58, 0.48]) {
      if (blob.size <= FEEDBACK_SCREENSHOT_MAX_BYTES) break;
      blob = await canvasBlob(canvas, quality);
    }
    if (blob.size > FEEDBACK_SCREENSHOT_MAX_BYTES) {
      throw new Error("The screenshot is still too large after compression. Continue without it.");
    }
    return { blob, width, height };
  } catch (error) {
    if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError")) {
      throw new Error("Screenshot permission was not granted. You can continue without one.");
    }
    throw error;
  } finally {
    setCaptureHidden(false);
    stream?.getTracks().forEach((track) => track.stop());
  }
}

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function uploadScreenshot(screenshot: ScreenshotState) {
  const checksumSha256 = await sha256(screenshot.blob);
  const intentResponse = await fetch("/api/feedback/screenshots/upload-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: "theta-space-feedback.jpg",
      mimeType: screenshot.blob.type,
      sizeBytes: screenshot.blob.size,
      checksumSha256
    })
  });
  const intent = (await intentResponse.json().catch(() => ({}))) as UploadIntentResponse;
  if (!intentResponse.ok || !intent.intent?.id || !intent.uploadUrl || !intent.uploadHeaders) {
    throw new Error(intent.error ?? "Could not prepare the screenshot upload.");
  }

  const file = new File([screenshot.blob], "theta-space-feedback.jpg", {
    type: screenshot.blob.type
  });
  await uploadWithResilientFallback({
    uploadUrl: intent.uploadUrl,
    storageKey: "",
    uploadHeaders: intent.uploadHeaders,
    file,
    onProgress: () => undefined
  });

  const completeResponse = await fetch("/api/feedback/screenshots/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intentId: intent.intent.id })
  });
  const complete = (await completeResponse.json().catch(() => ({}))) as { error?: string };
  if (!completeResponse.ok) {
    throw new Error(complete.error ?? "Could not verify the screenshot upload.");
  }
  return intent.intent.id;
}

export function FeedbackTicketForm({
  pageContext,
  onRequestClose,
  onCaptureVisibilityChange,
  onRefreshContext
}: {
  pageContext: FeedbackPageContext;
  onRequestClose?: () => void;
  onCaptureVisibilityChange?: (hidden: boolean) => void;
  onRefreshContext?: () => void;
}) {
  const [kind, setKind] = useState<ConfiguredFeedbackKind>("BUG");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("normal");
  const [screenshot, setScreenshot] = useState<ScreenshotState | null>(null);
  const [captureError, setCaptureError] = useState("");
  const [error, setError] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionKeyRef = useRef(crypto.randomUUID());
  const typeLabel = useMemo(
    () => FEEDBACK_TYPE_OPTIONS.find((option) => option.value === kind)?.label ?? "Feedback",
    [kind]
  );

  useEffect(() => {
    return () => {
      if (screenshot) URL.revokeObjectURL(screenshot.previewUrl);
    };
  }, [screenshot]);

  function removeScreenshot() {
    setScreenshot((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    setCaptureError("");
  }

  async function handleCapture() {
    setCaptureError("");
    setIsCapturing(true);
    try {
      const captured = await captureCurrentTabScreenshot(
        onCaptureVisibilityChange ?? (() => undefined)
      );
      removeScreenshot();
      setScreenshot({
        ...captured,
        previewUrl: URL.createObjectURL(captured.blob)
      });
    } catch (captureFailure) {
      setCaptureError(
        captureFailure instanceof Error
          ? captureFailure.message
          : "The screenshot could not be captured. You can continue without one."
      );
    } finally {
      setIsCapturing(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    setTicketId("");
    setIsSubmitting(true);

    try {
      const screenshotUploadIntentId = screenshot
        ? await uploadScreenshot(screenshot)
        : undefined;
      const response = await fetch("/api/feedback/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          kind,
          severity,
          pageUrl: pageContext.url,
          sourceRoute: pageContext.route,
          sourceEntityType: pageContext.sourceEntityType ?? undefined,
          sourceEntityId: pageContext.sourceEntityId ?? undefined,
          screenshotUploadIntentId,
          submissionKey: submissionKeyRef.current,
          pageContext: {
            pageTitle: pageContext.pageTitle,
            openedAt: pageContext.openedAt,
            route: pageContext.route,
            recentActions: pageContext.recentActions
          },
          clientContext: {
            viewport: pageContext.viewport,
            deviceClass: pageContext.deviceClass,
            browser: pageContext.browser,
            operatingSystem: pageContext.operatingSystem,
            appVersion: pageContext.appVersion,
            screenshot: screenshot
              ? {
                  width: screenshot.width,
                  height: screenshot.height,
                  sizeBytes: screenshot.blob.size,
                  mimeType: screenshot.blob.type
                }
              : null
          }
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        publicId?: string;
      };
      if (!response.ok || !payload.publicId) {
        throw new Error(payload.error ?? "Feedback could not be submitted.");
      }
      setTicketId(payload.publicId);
      window.dispatchEvent(
        new CustomEvent("theta:feedback-submitted", { detail: { publicId: payload.publicId } })
      );
      setTitle("");
      setDescription("");
      removeScreenshot();
      submissionKeyRef.current = crypto.randomUUID();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Feedback could not be submitted."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="feedback-form" data-feedback-ui onSubmit={handleSubmit}>
      {ticketId ? (
        <div className="feedback-success" role="status">
          <strong>Feedback submitted</strong>
          <span>An administrator will review it. Any reply will arrive as a normal Comm Center message.</span>
          <small>Reference {ticketId}</small>
          <div className="feedback-form-actions">
            {onRequestClose ? (
              <button className="btn-primary" onClick={onRequestClose} type="button">
                Done
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="feedback-source-context">
            <span>Page</span>
            <strong title={pageContext.url}>{pageContext.route}</strong>
            {onRefreshContext ? (
              <button className="feedback-context-refresh" onClick={onRefreshContext} type="button">
                Refresh context
              </button>
            ) : null}
          </div>

          <label className="grid gap-2">
            <span className="form-label">Feedback Type</span>
            <select
              className="form-field"
              name="kind"
              onChange={(event) => setKind(event.target.value as ConfiguredFeedbackKind)}
              value={kind}
            >
              {FEEDBACK_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="form-label">Subject</span>
            <input
              autoFocus
              className="form-field"
              maxLength={120}
              minLength={3}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={`${typeLabel} summary`}
              required
              value={title}
            />
          </label>

          <label className="grid gap-2">
            <span className="form-label">Description</span>
            <textarea
              className="form-field min-h-32 resize-y"
              maxLength={4000}
              minLength={10}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What happened, what did you expect, and what were you doing just before it happened?"
              required
              value={description}
            />
          </label>

          <label className="grid gap-2">
            <span className="form-label">Impact</span>
            <select className="form-field" onChange={(event) => setSeverity(event.target.value)} value={severity}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>

          <section className="feedback-screenshot-section" aria-labelledby="feedback-screenshot-label">
            <div className="feedback-screenshot-heading">
              <div>
                <span className="form-label" id="feedback-screenshot-label">Screenshot</span>
                <p>Choose the current Theta-Space tab when your browser asks.</p>
              </div>
              <button
                className="btn-secondary"
                disabled={isCapturing || isSubmitting}
                onClick={handleCapture}
                type="button"
              >
                {isCapturing ? "Waiting for permission..." : screenshot ? "Capture again" : "Capture screenshot"}
              </button>
            </div>
            {screenshot ? (
              <div className="feedback-screenshot-preview">
                {/* Browser-local blob previews cannot use the Next image optimizer. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="Screenshot preview for this Feedback ticket" src={screenshot.previewUrl} />
                <button className="btn-secondary" onClick={removeScreenshot} type="button">
                  Remove screenshot
                </button>
              </div>
            ) : null}
            {captureError ? <p className="feedback-inline-error" role="alert">{captureError}</p> : null}
          </section>

          {error ? <p className="feedback-inline-error" role="alert">{error}</p> : null}

          <div className="feedback-form-actions">
            {onRequestClose ? (
              <button className="btn-secondary" disabled={isSubmitting} onClick={onRequestClose} type="button">
                Cancel
              </button>
            ) : null}
            <button className="btn-primary" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Submitting..." : "Submit Feedback"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
