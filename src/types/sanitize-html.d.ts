declare module "sanitize-html" {
  type SanitizeOptions = {
    allowedTags?: string[];
    allowedAttributes?: Record<string, string[]>;
  };

  export default function sanitizeHtml(input: string, options?: SanitizeOptions): string;
}
