import { createElement, Fragment } from "react";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UrlMatch {
  /** The matched URL string. */
  url: string;
  /** Start index in the source string. */
  start: number;
  /** End index (exclusive) in the source string. */
  end: number;
}

// ---------------------------------------------------------------------------
// URL regex
// ---------------------------------------------------------------------------

// Matches http://, https://, and bare localhost (with optional port + path).
// The pattern intentionally avoids matching URLs already inside markdown link
// syntax — callers that need that guard should use `linkifyText` which handles
// it automatically.
const URL_REGEX =
  /(?:https?:\/\/(?:www\.)?|(?<!\()(?<!\[)[a-zA-Z0-9-]+\.)(?:[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%-]+)|(?:https?:\/\/)?localhost(?::\d{1,5})?(?:\/[^\s]*)?/g;

// ---------------------------------------------------------------------------
// detectUrls
// ---------------------------------------------------------------------------

/**
 * Scans `text` and returns every URL found along with its character positions.
 * URLs that are already part of a markdown link (`[label](url)`) are excluded
 * so that `linkifyText` doesn't double-wrap them.
 *
 * @param text - Plain or markdown text to scan.
 * @returns Array of `UrlMatch` objects sorted by `start` position.
 */
export function detectUrls(text: string): UrlMatch[] {
  const matches: UrlMatch[] = [];

  // Build a set of ranges that belong to existing markdown links so we can
  // skip them.  A markdown link looks like [text](url).
  const mdLinkRanges: [number, number][] = [];
  const mdLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let md: RegExpExecArray | null;
  while ((md = mdLinkRegex.exec(text)) !== null) {
    mdLinkRanges.push([md.index, md.index + md[0].length]);
  }

  const isInsideMdLink = (start: number, end: number): boolean =>
    mdLinkRanges.some(([s, e]) => start >= s && end <= e);

  URL_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_REGEX.exec(text)) !== null) {
    const raw = m[0];
    const start = m.index;
    const end = start + raw.length;

    if (isInsideMdLink(start, end)) continue;

    // Normalise: prepend https:// if the match has no scheme (e.g. bare
    // localhost or www.example.com).
    let url = raw;
    if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }

    matches.push({ url, start, end });
  }

  return matches;
}

// ---------------------------------------------------------------------------
// linkifyText
// ---------------------------------------------------------------------------

/**
 * Converts a plain-text string into a React node where every detected URL is
 * wrapped in an `<a>` tag that opens in a new tab.
 *
 * URLs already inside markdown link syntax (`[text](url)`) are left untouched.
 *
 * @param text - The text to linkify.
 * @returns A React node (a Fragment containing mixed strings and `<a>` elements).
 */
export function linkifyText(text: string): ReactNode {
  const urlMatches = detectUrls(text);

  if (urlMatches.length === 0) {
    return text;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of urlMatches) {
    // Text segment before this URL
    if (match.start > cursor) {
      nodes.push(text.slice(cursor, match.start));
    }

    // The raw URL as it appears in the source (for display)
    const displayUrl = text.slice(match.start, match.end);

    nodes.push(
      createElement(
        "a",
        {
          key: match.start,
          href: match.url,
          target: "_blank",
          rel: "noopener noreferrer",
          className: "text-[var(--color-primary)] hover:underline",
        },
        displayUrl,
      ),
    );

    cursor = match.end;
  }

  // Remaining text after the last URL
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return createElement(Fragment, null, ...nodes);
}
