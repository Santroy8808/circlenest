export function CarouselGuidance({
  firstImageText,
  imageCount,
  maxImages,
  orderText,
  paidSlotSeconds,
  title = "How the carousel works"
}: {
  firstImageText: string;
  imageCount?: number;
  maxImages?: number;
  orderText: string;
  paidSlotSeconds?: number;
  title?: string;
}) {
  const cycleSeconds = imageCount && imageCount > 1 ? imageCount * 3 : null;

  return (
    <aside className="carousel-guidance" aria-label={title}>
      <h3>{title}</h3>
      <ul>
        <li><strong>Timing:</strong> Each image stays visible for 3 seconds. Two images take 6 seconds; three take 9 seconds.</li>
        <li><strong>Order:</strong> {orderText}</li>
        <li><strong>First image:</strong> {firstImageText}</li>
        <li><strong>Controls:</strong> Visitors can use the arrows, dots, keyboard arrow keys, or swipe on a phone. Hovering or focusing pauses automatic movement.</li>
        {maxImages ? <li><strong>Limit:</strong> You can use up to {maxImages} images here.</li> : null}
        {cycleSeconds ? <li><strong>Your full cycle:</strong> {imageCount} images take {cycleSeconds} seconds before starting again.</li> : null}
        {paidSlotSeconds ? (
          <li>
            <strong>Paid ad time:</strong> The current placement provides {paidSlotSeconds} seconds. The carousel must complete within that time; it does not receive free extra display time.
          </li>
        ) : null}
      </ul>
    </aside>
  );
}
