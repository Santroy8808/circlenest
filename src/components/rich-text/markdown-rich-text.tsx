import type { ReactNode } from "react";

export function safeRichTextHref(href: string) {
  if (href.startsWith("https://") || href.startsWith("http://") || href.startsWith("/")) {
    return href;
  }
  return "#";
}

function renderInlineRichText(text: string): ReactNode {
  const pieces = text.split(/(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);

  return pieces.map((piece, index) => {
    if (piece.startsWith("**") && piece.endsWith("**")) {
      return <strong key={`${piece}-${index}`}>{piece.slice(2, -2)}</strong>;
    }

    if (piece.startsWith("_") && piece.endsWith("_")) {
      return <em key={`${piece}-${index}`}>{piece.slice(1, -1)}</em>;
    }

    const linkMatch = piece.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

    if (linkMatch) {
      return (
        <a className="feed-rich-link" href={safeRichTextHref(linkMatch[2])} key={`${piece}-${index}`} rel="noreferrer" target="_blank">
          {linkMatch[1]}
        </a>
      );
    }

    return <span key={`${piece}-${index}`}>{piece}</span>;
  });
}

export function MarkdownRichText({ className = "", value }: { className?: string; value: string }) {
  if (!value.trim()) return null;

  return (
    <div className={`feed-rich-text ${className}`.trim()}>
      {value.split("\n").map((line, index) => {
        const numberedMatch = line.match(/^(\d+)[.)]\s+(.+)$/);

        if (line.startsWith("- ")) {
          return (
            <p className="feed-rich-list-line" key={`${line}-${index}`}>
              {renderInlineRichText(line.slice(2))}
            </p>
          );
        }

        if (numberedMatch) {
          return (
            <p className="feed-rich-list-line is-numbered" data-list-number={`${numberedMatch[1]}.`} key={`${line}-${index}`}>
              {renderInlineRichText(numberedMatch[2])}
            </p>
          );
        }

        return <p key={`${line}-${index}`}>{renderInlineRichText(line)}</p>;
      })}
    </div>
  );
}
