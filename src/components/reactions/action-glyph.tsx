export type ActionGlyphKind = "react" | "comment" | "share";

export function ActionGlyph({ className = "", kind }: { className?: string; kind: ActionGlyphKind }) {
  return (
    // These are the approved Theta-Space interaction glyphs supplied by the product owner.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" aria-hidden="true" className={`action-glyph ${className}`} draggable={false} src={`/assets/action-glyphs/action-${kind}.png`} />
  );
}
