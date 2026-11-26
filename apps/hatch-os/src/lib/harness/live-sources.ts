/**
 * Live source adapter for the harness: structured search (hits with refs) and
 * full reads, so the agent can open the actual email thread or file instead of
 * stopping at subject lines.
 *
 * Read-only. Uses the firm's existing OAuth connections (connectors.ts). Nothing
 * here sends, writes, or calls any AI API.
 */
import { extractPdfTextLite } from "../connector-read.ts";
import { listConnectors, refreshAccess, refreshAccessStatus, runConnectorTool } from "../connectors.ts";
import { searchLibraryPassages } from "../library-passages.ts";
import { retrieveFirm } from "../store.ts";
import type { Evidence, EvidenceMeta } from "./context.ts";
import type { HarnessTools, Hit, SearchResult, ToolCallLike } from "./engine.ts";
import type { SourceKind } from "./intent.ts";

const TIMEOUT = 10_000;

interface GmailPart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  headers?: { name?: string; value?: string }[];
  parts?: GmailPart[];
}

function b64url(data?: string) {
  if (!data) return "";
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

export function htmlToText(html: string): string {
  return String(html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/** Plain text and attachment names from one Gmail message payload. */
export function gmailBody(part: GmailPart | undefined): { text: string; attachments: string[] } {
  const plain: string[] = [];
  const html: string[] = [];
  const attachments: string[] = [];
  const walk = (p?: GmailPart) => {
    if (!p) return;
    if (p.filename) attachments.push(p.filename);
    else if (p.mimeType === "text/plain" && p.body?.data) plain.push(b64url(p.body.data));
    else if (p.mimeType === "text/html" && p.body?.data) html.push(b64url(p.body.data));
    (p.parts || []).forEach(walk);
  };
  walk(part);
  const text = plain.length ? plain.join("\n") : htmlToText(html.join("\n"));
  return { text: text.trim(), attachments };
}

function header(part: GmailPart | undefined, name: string) {
  return part?.headers?.find((h) => (h.name || "").toLowerCase() === name.toLowerCase())?.value || "";
}

type JsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; timedOut?: boolean; authError?: boolean; status?: number; error: string };

async function getJsonResult<T>(url: string, token: string): Promise<JsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT) });
  } catch (err) {
    const timedOut = err instanceof Error && /timeout|abort/i.test(`${err.name} ${err.message}`);
    return {
      ok: false,
      timedOut,
      error: timedOut ? "Request timed out" : err instanceof Error ? err.message : "Network error",
    };
  }
  if (!res.ok) {
    const authError = res.status === 401 || res.status === 403;
    return {
      ok: false,
      authError,
      status: res.status,
      error: authError ? `Authorization failed (${res.status})` : `HTTP ${res.status}`,
    };
  }
  const data = (await res.json().catch(() => null)) as T | null;
  if (data === null) return { ok: false, error: "Invalid JSON response" };
  return { ok: true, data };
}

function formatCentralTimestamp(ms: number): string {
  const tz = process.env.HATCH_TIME_ZONE || "America/Chicago";
  try {
    return (
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(ms)) + " CT"
    );
  } catch {
    return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  }
}

function extractEmailAddr(raw: string): string {
  const angle = /<([^>\s]+@[^>\s]+)>/.exec(raw);
  if (angle) return angle[1].trim().toLowerCase();
  const bare = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/.exec(raw);
  return bare ? bare[1].trim().toLowerCase() : "";
}

function gmailThreadUrl(threadId: string, accountEmail?: string): string {
  const auth = accountEmail ? `?authuser=${encodeURIComponent(accountEmail)}` : "";
  return `https://mail.google.com/mail/${auth}#all/${encodeURIComponent(threadId)}`;
}

async function gmailSearch(scope: string, query: string): Promise<SearchResult> {
  const { accounts, errors } = await refreshAccessStatus(scope, "google");
  const usable = accounts.slice(0, 2);
  if (!usable.length) {
    const firstErr = errors[0];
    if (firstErr) {
      return {
        ok: false,
        hits: [],
        error: firstErr.message,
        timedOut: firstErr.reason === "timeout",
        needsReconnect: firstErr.needsReconnect,
      };
    }
    return { ok: true, hits: [] };
  }

  const perAccount = await Promise.all(
    usable.map(async (account, index) => {
      const listRes = await getJsonResult<{ threads?: { id: string; snippet?: string }[] }>(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=8&q=${encodeURIComponent(query)}`,
        account.accessToken,
      );
      if (!listRes.ok) return { ok: false as const, err: listRes, hits: [] as Hit[] };
      const threads = (listRes.data.threads || []).slice(0, 8);
      const metas = await Promise.all(
        threads.map((thread) =>
          getJsonResult<{ id: string; messages?: { snippet?: string; internalDate?: string; payload?: GmailPart }[] }>(
            `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(thread.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            account.accessToken,
          ),
        ),
      );
      const hits: Hit[] = [];
      metas.forEach((metaRes, i) => {
        if (!metaRes.ok || !metaRes.data.messages?.length) return;
        const meta = metaRes.data;
        const first = meta.messages![0];
        const last = meta.messages![meta.messages!.length - 1];
        const threadId = threads[i].id;
        hits.push({
          title: header(first.payload, "Subject") || "(no subject)",
          ref: `g${index}:${threadId}`,
          date: last.internalDate ? new Date(Number(last.internalDate)).toISOString().slice(0, 10) : undefined,
          from: header(last.payload, "From"),
          snippet: `${meta.messages!.length} message(s). Latest: ${last.snippet || ""}`.slice(0, 240),
          url: gmailThreadUrl(threadId, account.email),
        });
      });
      return { ok: true as const, hits };
    }),
  );

  const hits = perAccount.flatMap((r) => r.hits);
  const failed = perAccount.filter((r) => !r.ok);
  if (!hits.length && (failed.length === usable.length || (errors.length && !usable.length))) {
    const f = failed[0] as { err: Extract<JsonResult<unknown>, { ok: false }> } | undefined;
    return {
      ok: false,
      hits: [],
      error: f?.err.error || errors[0]?.message || "Gmail search failed",
      timedOut: f?.err.timedOut,
      needsReconnect: f?.err.authError,
    };
  }
  const warn = errors[0]?.message || (failed[0] && "err" in failed[0] ? failed[0].err.error : undefined);
  return { ok: true, hits, note: warn };
}

async function gmailRead(
  scope: string,
  ref: string,
): Promise<{ ok: boolean; title?: string; text: string; date?: string; url?: string; meta?: EvidenceMeta; error?: string; timedOut?: boolean; needsReconnect?: boolean }> {
  const match = ref.match(/^g(\d+):(.+)$/);
  if (!match) return { ok: false, text: "" };
  const { accounts, errors } = await refreshAccessStatus(scope, "google");
  const account = accounts[Number(match[1])];
  if (!account) {
    const firstErr = errors[0];
    return { ok: false, text: "", error: firstErr?.message, timedOut: firstErr?.reason === "timeout", needsReconnect: firstErr?.needsReconnect };
  }
  const threadRes = await getJsonResult<{ messages?: { internalDate?: string; payload?: GmailPart }[] }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(match[2])}?format=full`,
    account.accessToken,
  );
  if (!threadRes.ok) {
    return { ok: false, text: "", error: threadRes.error, timedOut: threadRes.timedOut, needsReconnect: threadRes.authError };
  }
  const thread = threadRes.data;
  if (!thread?.messages?.length) return { ok: false, text: "" };
  const blocks = thread.messages.slice(-12).map((message) => {
    const body = gmailBody(message.payload);
    const date = message.internalDate ? formatCentralTimestamp(Number(message.internalDate)) : header(message.payload, "Date");
    return [
      `From: ${header(message.payload, "From")}`,
      `To: ${header(message.payload, "To")}`,
      `Date: ${date}`,
      body.attachments.length ? `Attachments: ${body.attachments.join(", ")}` : "",
      "",
      body.text.slice(0, 6000),
    ]
      .filter((line, i) => line || i === 4)
      .join("\n");
  });
  const first = thread.messages[0];
  const last = thread.messages[thread.messages.length - 1];
  const subject = header(first.payload, "Subject");
  const accountLower = (account.email || "").toLowerCase();
  let replyToEmail = "";
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    const candidate = extractEmailAddr(header(thread.messages[i].payload, "Reply-To") || header(thread.messages[i].payload, "From"));
    if (candidate && candidate !== accountLower) {
      replyToEmail = candidate;
      break;
    }
  }
  if (!replyToEmail) {
    for (let i = thread.messages.length - 1; i >= 0; i--) {
      const candidate = extractEmailAddr(header(thread.messages[i].payload, "To"));
      if (candidate && candidate !== accountLower) {
        replyToEmail = candidate;
        break;
      }
    }
  }
  const inReplyTo = header(last.payload, "Message-ID") || header(last.payload, "Message-Id");
  const references = [header(last.payload, "References"), inReplyTo].filter(Boolean).join(" ").trim();
  const url = gmailThreadUrl(match[2], account.email);
  return {
    ok: true,
    title: subject,
    text: blocks.join("\n\n"),
    date: last.internalDate ? new Date(Number(last.internalDate)).toISOString().slice(0, 10) : undefined,
    url,
    meta: {
      threadRef: ref,
      gmailThreadId: match[2],
      accountEmail: account.email,
      replyToEmail: replyToEmail || undefined,
      subject: subject || undefined,
      inReplyTo: inReplyTo || undefined,
      references: references || undefined,
    },
  };
}

function driveQuery(query: string) {
  const terms = query
    .replace(/["()]/g, " ")
    .split(/\s+OR\s+|\s+/)
    .map((t) => t.replace(/'/g, "").trim())
    .filter((t) => t.length > 2)
    .slice(0, 4);
  if (!terms.length) return "";
  const exact = query.replace(/["()']/g, "").replace(/\s+OR\s+/g, " ").trim();
  if (/\sOR\s/.test(query)) return `trashed = false and (${terms.map((t) => `fullText contains '${t}'`).join(" or ")})`;
  return `trashed = false and (name contains '${exact}' or fullText contains '${exact}' or (${terms.map((t) => `fullText contains '${t}'`).join(" and ")}))`;
}

function isDriveCodeNoise(name: string, query: string): boolean {
  if (/\b(code|typescript|ts|d\.ts|schema|repo|package|lockfile)\b/i.test(query)) return false;
  return /\.(?:d\.ts|d\.cts|d\.mts|map|lock|test\.[jt]sx?|spec\.[jt]sx?)$/i.test(name);
}

async function driveSearch(scope: string, query: string): Promise<SearchResult> {
  const { accounts, errors } = await refreshAccessStatus(scope, "google");
  const usable = accounts.slice(0, 2);
  if (!usable.length) {
    const firstErr = errors[0];
    if (firstErr) {
      return { ok: false, hits: [], error: firstErr.message, timedOut: firstErr.reason === "timeout", needsReconnect: firstErr.needsReconnect };
    }
    return { ok: true, hits: [] };
  }
  const q = driveQuery(query);
  if (!q) return { ok: true, hits: [] };
  const perAccount = await Promise.all(
    usable.map(async (account, index) => {
      const dataRes = await getJsonResult<{ files?: { id: string; name: string; mimeType?: string; modifiedTime?: string; webViewLink?: string }[] }>(
        `https://www.googleapis.com/drive/v3/files?pageSize=8&orderBy=modifiedTime desc&q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,webViewLink)`,
        account.accessToken,
      );
      if (!dataRes.ok) return { ok: false as const, err: dataRes, hits: [] as Hit[] };
      const hits: Hit[] = [];
      for (const file of dataRes.data.files || []) {
        if (isDriveCodeNoise(file.name, query)) continue;
        hits.push({
          title: file.name,
          ref: `d${index}:${file.id}:${file.mimeType || ""}`,
          date: file.modifiedTime?.slice(0, 10),
          url: file.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`,
        });
      }
      return { ok: true as const, hits };
    }),
  );
  const hits = perAccount.flatMap((r) => r.hits);
  const failed = perAccount.filter((r) => !r.ok);
  if (!hits.length && failed.length === usable.length) {
    const f = failed[0] as { err: Extract<JsonResult<unknown>, { ok: false }> };
    return { ok: false, hits: [], error: f.err.error, timedOut: f.err.timedOut, needsReconnect: f.err.authError };
  }
  return { ok: true, hits, note: errors[0]?.message };
}

async function driveRead(
  scope: string,
  ref: string,
): Promise<{ ok: boolean; title?: string; text: string; date?: string; url?: string; error?: string; timedOut?: boolean; needsReconnect?: boolean }> {
  const match = ref.match(/^d(\d*):([^:]+):(.*)$/);
  const { accounts, errors } = await refreshAccessStatus(scope, "google");
  const idx = match?.[1] ? Number(match[1]) : 0;
  const account = accounts[idx];
  if (!match || !account) {
    const firstErr = errors[0];
    return { ok: false, text: "", error: firstErr?.message, timedOut: firstErr?.reason === "timeout", needsReconnect: firstErr?.needsReconnect };
  }
  const [, , id, mime] = match;
  const viewUrl = `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`;
  let url = "";
  const isPdf = mime === "application/pdf";
  if (mime === "application/vnd.google-apps.document" || mime === "application/vnd.google-apps.presentation") url = `${base}/export?mimeType=text%2Fplain`;
  else if (mime === "application/vnd.google-apps.spreadsheet") url = `${base}/export?mimeType=text%2Fcsv`;
  else if (/^text\//.test(mime) || mime === "application/json" || isPdf) url = `${base}?alt=media`;
  if (!url) return { ok: true, url: viewUrl, text: "(Hatch can see this file but cannot read its contents yet. Name and date only.)" };
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${account.accessToken}` }, signal: AbortSignal.timeout(TIMEOUT) });
  } catch (err) {
    const timedOut = err instanceof Error && /timeout|abort/i.test(`${err.name} ${err.message}`);
    return { ok: false, text: "", timedOut, error: timedOut ? "Drive file read timed out" : "Drive read failed" };
  }
  if (!res.ok) {
    return { ok: false, text: "", needsReconnect: res.status === 401 || res.status === 403, error: `Drive read returned HTTP ${res.status}` };
  }
  if (isPdf) {
    const buf = Buffer.from(await res.arrayBuffer());
    const extracted = extractPdfTextLite(buf.subarray(0, 4 * 1024 * 1024));
    return {
      ok: true,
      url: viewUrl,
      text: extracted ? extracted.slice(0, 12000) : "(Scanned/compressed PDF — no extractable plain text.)",
    };
  }
  return { ok: true, url: viewUrl, text: (await res.text()).replace(/\u0000/g, "").slice(0, 12000) };
}

type CalendarEventItem = {
  id: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  attendees?: { email?: string; displayName?: string }[];
  location?: string;
};

function formatCalendarHit(item: CalendarEventItem): Hit {
  const start = item.start?.dateTime || item.start?.date || "";
  const who = (item.attendees || []).map((a) => a.displayName || a.email).filter(Boolean).slice(0, 4).join(", ");
  return {
    title: item.summary || "Untitled",
    ref: item.id,
    date: start,
    url: item.htmlLink,
    body: `${start.replace("T", " ").slice(0, 16)} — ${item.summary || "Untitled"}${item.location ? ` @ ${item.location}` : ""}${who ? ` (with ${who})` : ""}`,
  };
}

async function calendarSearch(scope: string, query: string, range?: { from: string; to: string }): Promise<SearchResult> {
  const { accounts, errors } = await refreshAccessStatus(scope, "google");
  const usable = accounts.slice(0, 2);
  if (!usable.length) {
    const firstErr = errors[0];
    if (firstErr) {
      return { ok: false, hits: [], error: firstErr.message, timedOut: firstErr.reason === "timeout", needsReconnect: firstErr.needsReconnect };
    }
    return { ok: true, hits: [] };
  }
  const timeMin = range ? new Date(`${range.from}T00:00:00-06:00`).toISOString() : new Date().toISOString();
  const timeMax = range ? new Date(`${range.to}T23:59:59-06:00`).toISOString() : new Date(Date.now() + 14 * 86400000).toISOString();
  const cleanQuery = query
    .replace(/\b(cal|cals|gcal|ical|calendar|schedule|events?|meetings?|today|tomorrow|tmrw|tmr|this week|next week)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const perAccount = await Promise.all(
    usable.map(async (account) => {
      const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=15&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
      const primary = await getJsonResult<{ items?: CalendarEventItem[] }>(
        `${baseUrl}${cleanQuery ? `&q=${encodeURIComponent(cleanQuery)}` : ""}`,
        account.accessToken,
      );
      if (!primary.ok) return { ok: false as const, err: primary, hits: [] as Hit[] };
      let items = primary.data.items || [];
      if (!items.length && cleanQuery) {
        // Fallback: list window without `q` and filter locally (Google Calendar `q` can miss attendee display names or short words).
        const broad = await getJsonResult<{ items?: CalendarEventItem[] }>(baseUrl, account.accessToken);
        if (broad.ok && broad.data.items?.length) {
          const words = cleanQuery.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
          const matched = broad.data.items.filter((it) => {
            const hay = `${it.summary || ""} ${it.description || ""} ${it.location || ""} ${(it.attendees || []).map((a) => `${a.displayName || ""} ${a.email || ""}`).join(" ")}`.toLowerCase();
            return words.some((w) => hay.includes(w));
          });
          items = matched;
        }
      }
      return { ok: true as const, hits: items.map(formatCalendarHit) };
    }),
  );

  const hits = perAccount.flatMap((r) => r.hits);
  const failed = perAccount.filter((r) => !r.ok);
  if (!hits.length && failed.length === usable.length) {
    const f = failed[0] as { err: Extract<JsonResult<unknown>, { ok: false }> };
    return { ok: false, hits: [], error: f.err.error, timedOut: f.err.timedOut, needsReconnect: f.err.authError };
  }
  return { ok: true, hits, note: errors[0]?.message };
}

async function outlookSearch(scope: string, query: string): Promise<SearchResult> {
  const { accounts, errors } = await refreshAccessStatus(scope, "microsoft");
  const account = accounts[0];
  if (!account) {
    const firstErr = errors[0];
    if (firstErr) return { ok: false, hits: [], error: firstErr.message, timedOut: firstErr.reason === "timeout", needsReconnect: firstErr.needsReconnect };
    return { ok: true, hits: [] };
  }
  const q = query.replace(/["()]/g, "").replace(/\s+OR\s+/g, " OR ").replace(/\b(from|to|newer_than):\S+/g, "").trim();
  const dataRes = await getJsonResult<{ value?: { id: string; subject?: string; bodyPreview?: string; receivedDateTime?: string; webLink?: string; from?: { emailAddress?: { name?: string; address?: string } } }[] }>(
    `https://graph.microsoft.com/v1.0/me/messages?$top=5&$search=${encodeURIComponent(`"${q}"`)}&$select=id,subject,bodyPreview,receivedDateTime,webLink,from`,
    account.accessToken,
  );
  if (!dataRes.ok) return { ok: false, hits: [], error: dataRes.error, timedOut: dataRes.timedOut, needsReconnect: dataRes.authError };
  return {
    ok: true,
    hits: (dataRes.data.value || []).map((m) => ({
      title: m.subject || "(no subject)",
      ref: `o:${m.id}`,
      date: m.receivedDateTime?.slice(0, 10),
      from: m.from?.emailAddress?.name || m.from?.emailAddress?.address,
      snippet: m.bodyPreview?.slice(0, 200),
      url: m.webLink,
    })),
  };
}

async function outlookRead(scope: string, ref: string) {
  const account = (await refreshAccess(scope, "microsoft"))[0];
  if (!account) return { ok: false, text: "" };
  const mRes = await getJsonResult<{ subject?: string; webLink?: string; body?: { contentType?: string; content?: string }; receivedDateTime?: string; from?: { emailAddress?: { name?: string; address?: string } } }>(
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(ref.slice(2))}?$select=subject,webLink,body,receivedDateTime,from`,
    account.accessToken,
  );
  if (!mRes.ok) return { ok: false, text: "", error: mRes.error, timedOut: mRes.timedOut, needsReconnect: mRes.authError };
  const m = mRes.data;
  const body = m.body?.contentType === "html" ? htmlToText(m.body?.content || "") : m.body?.content || "";
  return {
    ok: true,
    title: m.subject,
    date: m.receivedDateTime?.slice(0, 10),
    url: m.webLink,
    text: `From: ${m.from?.emailAddress?.name || ""} <${m.from?.emailAddress?.address || ""}>\nDate: ${m.receivedDateTime || ""}\n\n${body.slice(0, 8000)}`,
  };
}

export function liveTools(scope: string, opts: { kinds: Set<string>; dateRange?: { from: string; to: string } }): HarnessTools {
  return {
    async search(source: SourceKind, query: string): Promise<SearchResult> {
      if (source === "mail") {
        const errors: SearchResult[] = [];
        const hits: Hit[] = [];
        if (opts.kinds.has("google")) {
          const g = await gmailSearch(scope, query);
          if (g.ok) hits.push(...g.hits);
          else errors.push(g);
        }
        if (!hits.length && opts.kinds.has("microsoft")) {
          const m = await outlookSearch(scope, query);
          if (m.ok) hits.push(...m.hits);
          else errors.push(m);
        }
        if (!hits.length && opts.kinds.has("email")) {
          const r = await runConnectorTool(scope, "email_search", { query }, false);
          if (r.event.ok && r.extra && !/No mail matched/i.test(r.extra)) hits.push({ title: `Mailbox search: ${query}`, body: r.extra });
          else if (!r.event.ok) errors.push({ ok: false, hits: [], error: r.event.detail });
        }
        if (!hits.length && errors.length) return errors[0];
        return { ok: true, hits };
      }
      if (source === "files") return opts.kinds.has("google") ? driveSearch(scope, query) : { ok: true, hits: [] };
      if (source === "calendar") return opts.kinds.has("google") ? calendarSearch(scope, query, opts.dateRange) : { ok: true, hits: [] };
      const passages = [...(await searchLibraryPassages(scope, query)), ...retrieveFirm(query, 4)];
      return { ok: true, hits: passages.map((p) => ({ title: p.file, body: p.snippet })) };
    },
    async read(source: SourceKind, ref: string) {
      if (source === "mail") return ref.startsWith("o:") ? outlookRead(scope, ref) : gmailRead(scope, ref);
      if (source === "files") return driveRead(scope, ref);
      return { ok: false, text: "" };
    },
  };
}

/** Tools the model asks for by name, mapped onto the same live sources. */
export function liveRunNamed(scope: string, tools: HarnessTools) {
  return async (call: ToolCallLike): Promise<{ ok: boolean; text: string; evidence?: Evidence[] }> => {
    const a = call.arguments || {};
    const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));
    const query = str(a.query || a.q);
    const ref = str(a.ref || a.threadId || a.fileId || a.id);
    const searchAndRead = async (source: SourceKind) => {
      const r = await tools.search(source, query, {});
      if (!r.ok && !r.hits.length) {
        return { ok: false, text: r.error || "Source search failed." };
      }
      const picked = r.hits.slice(0, source === "mail" ? 3 : 2);
      const reads = await Promise.all(
        picked.map(async (hit) => {
          if (hit.body) return { hit, full: { ok: true as const, text: hit.body, url: hit.url, meta: undefined } };
          if (!hit.ref) return { hit, full: { ok: false as const, text: "", url: hit.url, meta: undefined } };
          const full = await tools.read(source, hit.ref, hit.title);
          return { hit, full };
        }),
      );
      const out: Evidence[] = reads.map(({ hit, full }, idx) => ({
        id: `${source}-${idx}`,
        source,
        title: hit.title,
        ref: hit.ref,
        date: hit.date,
        url: full.url || hit.url,
        text: full.ok ? full.text : hit.snippet || "",
        score: 0.55,
        shallow: !full.ok,
        meta: full.meta,
      }));
      return { ok: true, text: out.length ? "" : "Nothing matched.", evidence: out };
    };
    if (call.name === "email_search" || (call.name === "email_read" && !ref)) return searchAndRead("mail");
    if (call.name === "cloud_files_search" || (call.name === "cloud_files_read" && !ref)) return searchAndRead("files");
    if (call.name === "search_library") return searchAndRead("library");
    if (call.name === "calendar_list") return searchAndRead("calendar");
    if (call.name === "email_read" || call.name === "cloud_files_read") {
      const source: SourceKind = call.name === "email_read" ? "mail" : "files";
      const r = await tools.read(source, ref);
      return r.ok
        ? { ok: true, text: "", evidence: [{ id: `${source}-${ref}`, source, title: r.title || ref, ref, date: r.date, url: r.url, text: r.text, score: 0.7, meta: r.meta }] }
        : { ok: false, text: r.error || "Could not open that item." };
    }
    if (call.name === "email_draft") {
      const r = await runConnectorTool(scope, "email_draft", { to: str(a.to), subject: str(a.subject), body: str(a.body || a.text) }, false);
      return { ok: r.event.ok, text: r.event.detail };
    }
    return { ok: false, text: "That tool is not available." };
  };
}

export async function connectedKinds(scope: string): Promise<string[]> {
  const rows = await listConnectors(scope).catch(() => []);
  return [...new Set(rows.map((row) => row.kind))];
}
