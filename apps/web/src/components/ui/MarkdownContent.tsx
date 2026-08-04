import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";

marked.setOptions({
  breaks: true,
  gfm: true,
});

const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const highlightHtml = (html: string, term: string): string => {
  const escaped = escapeRegExp(term);
  const regex = new RegExp(`(${escaped})`, "gi");

  // Only highlight text nodes — skip anything inside HTML tags
  // Split on tags, highlight only the non-tag segments
  const parts = html.split(/(<[^>]*>)/);
  return parts
    .map((part) => {
      if (part.startsWith("<")) return part;
      return part.replace(regex, '<mark class="search-highlight">$1</mark>');
    })
    .join("");
};

const sanitizeMarkdownHtml = (html: string) =>
  DOMPurify.sanitize(html, {
    FORBID_ATTR: ["style"],
    FORBID_TAGS: ["base", "form", "iframe", "link", "meta", "object", "style"],
    USE_PROFILES: { html: true },
  });

type MarkdownContentProps = {
  content: string;
  className?: string;
  highlightTerm?: string;
};

export const MarkdownContent = ({ content, className, highlightTerm }: MarkdownContentProps) => {
  const html = useMemo(() => {
    const rendered = marked.parse(content, { async: false }) as string;
    const highlighted =
      highlightTerm && highlightTerm.length > 0 ? highlightHtml(rendered, highlightTerm) : rendered;
    return sanitizeMarkdownHtml(highlighted);
  }, [content, highlightTerm]);

  // The markdown parser can emit HTML, so sanitize its output before React inserts it.
  // biome-ignore lint/security/noDangerouslySetInnerHtml: html is sanitized above with a strict HTML-only profile.
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
};
