import DOMPurify from 'dompurify';

// Explicit allowlist. RSS contentRaw frequently carries paragraphs, links,
// images, and basic inline formatting; everything else (script, iframe,
// event handlers, javascript: hrefs) is stripped. ALLOWED_URI_REGEXP rejects
// non-http(s)/mailto schemes so onclick=… / javascript: payloads can't slip
// through href or src.
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'a',
    'strong',
    'em',
    'b',
    'i',
    'u',
    'h1',
    'h2',
    'h3',
    'h4',
    'ul',
    'ol',
    'li',
    'blockquote',
    'code',
    'pre',
    'img',
    'span',
    'div',
    'figure',
    'figcaption',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel'],
  ALLOWED_URI_REGEXP: /^(https?|mailto):/i,
};

export function ArticleContent({ html }: { html: string }) {
  const clean = DOMPurify.sanitize(html, SANITIZE_CONFIG);
  return (
    <div
      className="prose prose-sm max-w-none prose-a:text-primary prose-img:rounded-md prose-img:my-4"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
