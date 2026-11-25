export interface GmailHeader {
  name?: string;
  value?: string;
}

export interface GmailMimePart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  headers?: GmailHeader[];
  parts?: GmailMimePart[];
}

export interface GmailMessage {
  id?: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailMimePart;
}

export interface GmailThread {
  id?: string;
  messages?: GmailMessage[];
}

export interface OutlookMessage {
  id?: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  receivedDateTime?: string;
  hasAttachments?: boolean;
}

const STOPWORDS = new Set([
  "a", "about", "all", "am", "an", "and", "any", "are", "as", "at",
  "be", "been", "by", "can", "check", "could", "did", "do", "does",
  "drive", "email", "emails", "file", "files", "find", "for", "from",
  "get", "give", "gmail", "have", "help", "how", "i", "in", "into",
  "is", "it", "its", "latest", "look", "mail", "me", "messages", "my",
  "need", "of", "on", "or", "our", "outlook", "please", "read",
  "recent", "regarding", "search", "see", "show", "some", "speed",
  "status", "summarize", "summary", "tell", "that", "the", "their",
  "them", "there", "these", "they", "this", "thread", "threads", "to",
  "up", "update", "us", "was", "we", "were", "what", "when", "where",
  "which", "who", "with", "would", "you", "your",
]);

export function extractSearchTerms(raw: string): string[] {
  const tokens = String(raw || "")
    .toLowerCase()
    .split(/[^a-z0-9@._-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return [...new Set(tokens)];
}

export function buildGmailFallbackQueries(raw: string): string[] {
  const cleaned = String(raw || "").trim();
  const terms = extractSearchTerms(cleaned);
  const queries: string[] = [];
  if (cleaned) queries.push(cleaned);
  if (terms.length >= 2) {
    const keywordAnd = terms.slice(0, 6).join(" ");
    if (keywordAnd && keywordAnd !== cleaned.toLowerCase()) queries.push(keywordAnd);
  }
  if (terms.length >= 2) {
    const keywordOr = terms.slice(0, 5).join(" OR ");
    if (keywordOr) queries.push(keywordOr);
  }
  return [...new Set(queries)];
}

export function decodeBase64Url(data: string | undefined): string {
  if (!data) return "";
  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64").toString("utf8").replace(/\u0000/g, "");
  } catch {
    return "";
  }
}

export function stripHtmlToText(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractGmailPayload(payload: GmailMimePart | undefined): {
  body: string;
  attachments: string[];
} {
  const plain: string[] = [];
  const html: string[] = [];
  const attachments: string[] = [];

  function walk(part: GmailMimePart | undefined) {
    if (!part) return;
    const filename = (part.filename || "").trim();
    if (filename) attachments.push(filename);

    const mime = (part.mimeType || "").toLowerCase();
    const rawData = part.body?.data;
    if (rawData) {
      const decoded = decodeBase64Url(rawData).trim();
      if (decoded) {
        if (mime === "text/plain" || (!mime && !part.parts?.length)) {
          plain.push(decoded);
        } else if (mime === "text/html") {
          const stripped = stripHtmlToText(decoded);
          if (stripped) html.push(stripped);
        }
      }
    }
    if (Array.isArray(part.parts)) {
      for (const child of part.parts) walk(child);
    }
  }

  walk(payload);
  const body = (plain.length ? plain.join("\n\n") : html.join("\n\n")).trim();
  return { body, attachments: [...new Set(attachments)] };
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  const target = name.toLowerCase();
  return (headers || []).find((h) => (h.name || "").toLowerCase() === target)?.value?.trim() || "";
}

export function formatGmailThread(
  thread: GmailThread,
  options?: { maxCharsPerMessage?: number; maxTotalChars?: number },
): { subject: string; messageCount: number; summary: string; text: string } {
  const maxPerMsg = options?.maxCharsPerMessage ?? 3500;
  const maxTotal = options?.maxTotalChars ?? 9000;
  const messages = thread.messages || [];
  const firstHeaders = messages[0]?.payload?.headers;
  const lastHeaders = messages[messages.length - 1]?.payload?.headers;
  const subject =
    headerValue(firstHeaders, "Subject") ||
    headerValue(lastHeaders, "Subject") ||
    messages[0]?.snippet ||
    thread.id ||
    "Untitled thread";
  const latestDate = headerValue(lastHeaders, "Date");

  const blocks: string[] = [
    `=== Email Thread: ${subject}${thread.id ? ` [threadId: ${thread.id}]` : ""} (${messages.length} message${messages.length === 1 ? "" : "s"}) ===`,
  ];
  let total = blocks[0].length;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const headers = msg.payload?.headers;
    const from = headerValue(headers, "From") || "(unknown sender)";
    const to = headerValue(headers, "To");
    const cc = headerValue(headers, "Cc");
    const date = headerValue(headers, "Date");
    const extracted = extractGmailPayload(msg.payload);
    const body = (extracted.body || msg.snippet || "(empty message body)").slice(0, maxPerMsg);
    const lines = [
      `--- Message ${i + 1} of ${messages.length}${date ? ` | Date: ${date}` : ""} ---`,
      `From: ${from}`,
      ...(to ? [`To: ${to}`] : []),
      ...(cc ? [`Cc: ${cc}`] : []),
      ...(extracted.attachments.length ? [`Attachments: ${extracted.attachments.join(", ")}`] : []),
      body,
    ];
    const block = lines.join("\n");
    if (total + block.length + 2 > maxTotal && i > 0) {
      blocks.push(`[... ${messages.length - i} more message(s) omitted for length; call email_read with threadId "${thread.id || ""}" if needed ...]`);
      break;
    }
    blocks.push(block);
    total += block.length + 2;
  }

  const summary = `"${subject}" (${messages.length} msg${messages.length === 1 ? "" : "s"}${latestDate ? `, ${latestDate.slice(0, 22)}` : ""})`;
  return { subject, messageCount: messages.length, summary, text: blocks.join("\n\n") };
}

export function formatOutlookMessages(
  rows: OutlookMessage[],
  options?: { maxCharsPerMessage?: number; maxTotalChars?: number },
): { summary: string; text: string } {
  const maxPerMsg = options?.maxCharsPerMessage ?? 3500;
  const maxTotal = options?.maxTotalChars ?? 12000;
  const blocks: string[] = [];
  const summaries: string[] = [];
  let total = 0;

  for (const item of rows) {
    const subject = (item.subject || "Untitled message").trim();
    const from = item.from?.emailAddress?.name
      ? `${item.from.emailAddress.name} <${item.from.emailAddress.address || ""}>`
      : item.from?.emailAddress?.address || "(unknown sender)";
    const to = (item.toRecipients || [])
      .map((r) => r.emailAddress?.address || r.emailAddress?.name || "")
      .filter(Boolean)
      .join(", ");
    const date = item.receivedDateTime || "";
    const rawBody =
      item.body?.contentType?.toLowerCase() === "html"
        ? stripHtmlToText(item.body.content)
        : item.body?.content || item.bodyPreview || "";
    const body = rawBody.trim().slice(0, maxPerMsg) || "(empty body)";
    const block = [
      `=== Outlook Message: ${subject}${date ? ` | Date: ${date}` : ""} ===`,
      `From: ${from}`,
      ...(to ? [`To: ${to}`] : []),
      ...(item.hasAttachments ? ["Has attachments: yes"] : []),
      body,
    ].join("\n");
    if (total + block.length + 2 > maxTotal && blocks.length > 0) break;
    blocks.push(block);
    summaries.push(`"${subject}"`);
    total += block.length + 2;
  }

  return {
    summary: summaries.slice(0, 3).join(" · "),
    text: blocks.join("\n\n"),
  };
}

export function extractPdfTextLite(buf: Buffer): string {
  const raw = buf.toString("latin1");
  const strings = [...raw.matchAll(/\(([^()\\]{3,})\)/g)]
    .map((m) => m[1])
    .filter((s) => /[a-zA-Z0-9]/.test(s));
  return strings.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
