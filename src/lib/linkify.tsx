import React from "react";

export function linkifyText(text: string): React.ReactNode[] | string {
  if (!text) return text;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-(--color-primary) underline hover:no-underline"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}
