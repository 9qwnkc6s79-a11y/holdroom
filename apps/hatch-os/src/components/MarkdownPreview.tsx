import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") || token.startsWith("_")) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("[")) {
      const m = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = m?.[2] || "";
      const safe = /^https?:\/\//i.test(href) || href.startsWith("/");
      nodes.push(
        safe ? (
          <a key={key++} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
            {m?.[1]}
          </a>
        ) : (
          <span key={key++}>{m?.[1]}</span>
        ),
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MarkdownPreview({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const fence: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        fence.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(
        <pre key={key++}>
          <code>{fence.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (/^[-*_]{3,}\s*$/.test(line)) {
      blocks.push(<hr key={key++} />);
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const body = inline(heading[2]);
      if (heading[1].length === 1) blocks.push(<h1 key={key++}>{body}</h1>);
      else if (heading[1].length === 2) blocks.push(<h2 key={key++}>{body}</h2>);
      else blocks.push(<h3 key={key++}>{body}</h3>);
      i += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quote.push(lines[i].slice(2));
        i += 1;
      }
      blocks.push(<blockquote key={key++}>{inline(quote.join(" "))}</blockquote>);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+\.\s+/.test(lines[i]) : /^\s*[-*]\s+/.test(lines[i]))) {
        items.push(lines[i].replace(/^\s*(?:[-*]|\d+\.)\s+/, ""));
        i += 1;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={key++}>
          {items.map((item, idx) => (
            <li key={idx}>{inline(item)}</li>
          ))}
        </Tag>,
      );
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].startsWith("```") && !lines[i].startsWith("> ") && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(<p key={key++}>{inline(para.join(" "))}</p>);
  }

  return <div className="artifact-md">{blocks}</div>;
}
