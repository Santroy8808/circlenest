export function MarkdownDocument({ content }: { content: string }) {
  return (
    <article className="surface rounded-md p-6">
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[var(--text)]">{content}</pre>
    </article>
  );
}

