"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CarouselImage = { id: string; src: string; alt: string };

export function ImageCarousel({
  autoAdvanceMs = 3000,
  className = "",
  imageClassName = "",
  images,
  showControls = true
}: {
  autoAdvanceMs?: number;
  className?: string;
  imageClassName?: string;
  images: CarouselImage[];
  showControls?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const count = images.length;

  const move = useCallback((delta: number) => {
    if (count < 2) return;
    setIndex((current) => (current + delta + count) % count);
  }, [count]);

  useEffect(() => {
    setIndex((current) => (count > 0 ? Math.min(current, count - 1) : 0));
  }, [count]);

  useEffect(() => {
    if (count < 2 || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => move(1), autoAdvanceMs);
    return () => window.clearInterval(timer);
  }, [autoAdvanceMs, count, move, paused]);

  const active = images[index];
  if (!active) return null;

  return (
    <div
      aria-label={`Image carousel, image ${index + 1} of ${count}`}
      className={["image-carousel", className].filter(Boolean).join(" ")}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
      onFocus={() => setPaused(true)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") move(-1);
        if (event.key === "ArrowRight") move(1);
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.clientX;
        touchStartX.current = null;
        if (start == null || end == null || Math.abs(start - end) < 40) return;
        move(start > end ? 1 : -1);
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      role="region"
      tabIndex={0}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={active.alt} className={imageClassName} src={active.src} />
      {count > 1 && showControls ? (
        <>
          <button aria-label="Previous image" className="image-carousel-arrow is-previous" onClick={() => move(-1)} type="button">‹</button>
          <button aria-label="Next image" className="image-carousel-arrow is-next" onClick={() => move(1)} type="button">›</button>
          <div aria-label="Choose image" className="image-carousel-dots">
            {images.map((image, imageIndex) => (
              <button
                aria-label={`Show image ${imageIndex + 1}`}
                aria-pressed={imageIndex === index}
                className={imageIndex === index ? "is-active" : ""}
                key={image.id}
                onClick={() => setIndex(imageIndex)}
                type="button"
              />
            ))}
          </div>
        </>
      ) : null}
      {count > 1 ? <span className="image-carousel-count">{index + 1} / {count}</span> : null}
    </div>
  );
}
