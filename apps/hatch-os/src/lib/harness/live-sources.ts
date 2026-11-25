/**
 * Live source adapter for the harness: structured search (hits with refs) and
 * full reads, so the agent can open the actual email thread or file instead of
 * stopping at subject lines.
 *
 * Read-only. Uses the firm's existing OAuth connections (connectors.ts). Nothing
 * here sends, writes, or calls any AI API.
 */
import { refreshAccess, runConnectorTool, listConnectors } from "../connectors.ts";
import { searchLibraryPassages } from "../library-passages.ts";
import { retrieveFirm } from "../store.ts";
import type { Evidence } from "./context.ts";
import type { HarnessTools, Hit, ToolCallLike } from "./engine.ts";
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

async function getJson<T>(url: string, token: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT) }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

async function gmailSearch(scope: string, query: string): Promise<Hit[]> {
  const accounts = (await refreshAccess(scope, "google")).slice(0, 2);
  const hits: Hit[] = [];
  for (const [index, account] of accounts.entries()) {
    const list = await getJson<{ threads?: { id: string; snippet?: string }[] }>(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=5&q=${encodeURIComponent(query)}`,
      account.accessToken,
    );
    const metas = await Promise.all(
      (list?.threads || []).slice(0, 5).map((thread) =>
        getJson<{ id: string; messages?: { snippet?: string; internalDate?: string; payload?: GmailPart }[] }>(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(thread.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          account.accessToken,
        ),
      ),
    );
    metas.forEach((meta, i) => {
      if (!meta?.messages?.length) return;
      const first = meta.messages[0];
      const last = meta.messages[meta.messages.length - 1];
      hits.push({
        title: header(first.payload, "Subject") || "(no subject)",
        ref: `g${index}:${list!.threads![i].id}`,
        date: last.internalDate ? new Date(Number(last.internalDate)).toISOString().slice(0, 10) : undefined,
        from: header(last.payload, "From"),
        snippet: `${meta.messages.length} message(s). Latest: ${last.snippet || ""}`.slice(0, 240),
      });
    });
  }
  return hits;
}

async function gmailRead(scope: string, ref: string): Promise<{ ok: boolean; title?: string; text: string; date?: string }> {
  const match = ref.match(/^g(\d+):(.+)$/);
  if (!match) return { ok: false, text: "" };
  const account = (await refreshAccess(scope, "google"))[Number(match[1])];
  if (!account) return { ok: false, text: "" };
  const thread = await getJson<{ messages?: { internalDate?: string; payload?: GmailPart }[] }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(match[2])}?format=full`,
    account.accessToken,
  );
  if (!thread?.messages?.length) return { ok: false, text: "" };
  const blocks = thread.messages.slice(-12).map((message) => {
    const body = gmailBody(message.payload);
    const date = message.internalDate ? new Date(Number(message.internalDate)).toISOString().slice(0, 16).replace("T", " ") : header(message.payload, "Date");
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
  const last = thread.messages[thread.messages.length - 1];
  return {
    ok: true,
    title: header(thread.messages[0].payload, "Subject"),
    text: blocks.join("\n\n"),
    date: last.internalDate ? new Date(Number(last.internalDate)).toISOString().slice(0, 10) : undefined,
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

async function driveSearch(scope: string, query: string): Promise<Hit[]> {
  const account = (await refreshAccess(scope, "google"))[0];
  if (!account) return [];
  const q = driveQuery(query);
  if (!q) return [];
  const data = await getJson<{ files?: { id: string; name: string; mimeType?: string; modifiedTime?: string }[] }>(
    `https://www.googleapis.com/drive/v3/files?pageSize=5&orderBy=modifiedTime desc&q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime)`,
    account.accessToken,
  );
  return (data?.files || []).map((file) => ({ title: file.name, ref: `d:${file.id}:${file.mimeType || ""}`, date: file.modifiedTime?.slice(0, 10) }));
}

async function driveRead(scope: string, ref: string): Promise<{ ok: boolean; title?: string; text: string; date?: string }> {
  const match = ref.match(/^d:([^:]+):(.*)$/);
  const account = (await refreshAccess(scope, "google"))[0];
  if (!match || !account) return { ok: false, text: "" };
  const [, id, mime] = match;
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`;
  let url = "";
  if (mime === "application/vnd.google-apps.document" || mime === "application/vnd.google-apps.presentation") url = `${base}/export?mimeType=text%2Fplain`;
  else if (mime === "application/vnd.google-apps.spreadsheet") url = `${base}/export?mimeType=text%2Fcsv`;
  else if (/^text\//.test(mime) || mime === "application/json") url = `${base}?alt=media`;
  if (!url) return { ok: true, text: "(Hatch can see this file but cannot read its contents yet, e.g. a PDF or image. Name and date only.)" };
  const res = await fetch(url, { headers: { Authorization: `Bearer ${account.accessToken}` }, signal: AbortSignal.timeout(TIMEOUT) }).catch(() => null);
  if (!res?.ok) return { ok: false, text: "" };
  return { ok: true, text: (await res.text()).replace(/\u0000/g, "").slice(0, 12000) };
}

async function calendarSearch(scope: string, query: string, range?: { from: string; to: string }): Promise<Hit[]> {
  const account = (await refreshAccess(scope, "google"))[0];
  if (!account) return [];
  const timeMin = range ? new Date(`${range.from}T00:00:00-06:00`).toISOString() : new Date().toISOString();
  const timeMax = range ? new Date(`${range.to}T23:59:59-06:00`).toISOString() : new Date(Date.now() + 14 * 86400000).toISOString();
  const data = await getJson<{ items?: { id: string; summary?: string; start?: { dateTime?: string; date?: string }; attendees?: { email?: string; displayName?: string }[]; location?: string }[] }>(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=15&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}${query ? `&q=${encodeURIComponent(query)}` : ""}`,
    account.accessToken,
  );
  return (data?.items || []).map((item) => {
    const start = item.start?.dateTime || item.start?.date || "";
    const who = (item.attendees || []).map((a) => a.displayName || a.email).filter(Boolean).slice(0, 4).join(", ");
    return { title: item.summary || "Untitled", ref: item.id, date: start, body: `${start.replace("T", " ").slice(0, 16)} — ${item.summary || "Untitled"}${item.location ? ` @ ${item.location}` : ""}${who ? ` (with ${who})` : ""}` };
  });
}

async function outlookSearch(scope: string, query: string): Promise<Hit[]> {
  const account = (await refreshAccess(scope, "microsoft"))[0];
  if (!account) return [];
  const q = query.replace(/["()]/g, "").replace(/\s+OR\s+/g, " OR ").replace(/\b(from|to|newer_than):\S+/g, "").trim();
  const data = await getJson<{ value?: { id: string; subject?: string; bodyPreview?: string; receivedDateTime?: string; from?: { emailAddress?: { name?: string; address?: string } } }[] }>(
    `https://graph.microsoft.com/v1.0/me/messages?$top=5&$search=${encodeURIComponent(`"${q}"`)}&$select=id,subject,bodyPreview,receivedDateTime,from`,
    account.accessToken,
  );
  return (data?.value || []).map((m) => ({ title: m.subject || "(no subject)", ref: `o:${m.id}`, date: m.receivedDateTime?.slice(0, 10), from: m.from?.emailAddress?.name || m.from?.emailAddress?.address, snippet: m.bodyPreview?.slice(0, 200) }));
}

async function outlookRead(scope: string, ref: string) {
  const account = (await refreshAccess(scope, "microsoft"))[0];
  if (!account) return { ok: false, text: "" };
  const m = await getJson<{ subject?: string; body?: { contentType?: string; content?: string }; receivedDateTime?: string; from?: { emailAddress?: { name?: string; address?: string } } }>(
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(ref.slice(2))}?$select=subject,body,receivedDateTime,from`,
    account.accessToken,
  );
  if (!m) return { ok: false, text: "" };
  const body = m.body?.contentType === "html" ? htmlToText(m.body?.content || "") : m.body?.content || "";
  return { ok: true, title: m.subject, date: m.receivedDateTime?.slice(0, 10), text: `From: ${m.from?.emailAddress?.name || ""} <${m.from?.emailAddress?.address || ""}>\nDate: ${m.receivedDateTime || ""}\n\n${body.slice(0, 8000)}` };
}

export function liveTools(scope: string, opts: { kinds: Set<string>; dateRange?: { from: string; to: string } }): HarnessTools {
  return {
    async search(source: SourceKind, query: string) {
      if (source === "mail") {
        const hits = opts.kinds.has("google") ? await gmailSearch(scope, query) : [];
        if (!hits.length && opts.kinds.has("microsoft")) hits.push(...(await outlookSearch(scope, query)));
        if (!hits.length && opts.kinds.has("email")) {
          const r = await runConnectorTool(scope, "email_search", { query }, false);
          if (r.event.ok && r.extra && !/No mail matched/i.test(r.extra)) hits.push({ title: `Mailbox search: ${query}`, body: r.extra });
        }
        return { ok: true, hits };
      }
      if (source === "files") return { ok: true, hits: opts.kinds.has("google") ? await driveSearch(scope, query) : [] };
      if (source === "calendar") return { ok: true, hits: opts.kinds.has("google") ? await calendarSearch(scope, query, opts.dateRange) : [] };
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
      const out: Evidence[] = [];
      for (const hit of r.hits.slice(0, source === "mail" ? 3 : 2)) {
        if (hit.body) {
          out.push({ id: `${source}-${out.length}`, source, title: hit.title, ref: hit.ref, date: hit.date, text: hit.body, score: 0.55 });
          continue;
        }
        const full = hit.ref ? await tools.read(source, hit.ref, hit.title) : { ok: false, text: "" };
        out.push({ id: `${source}-${out.length}`, source, title: hit.title, ref: hit.ref, date: hit.date, text: full.ok ? full.text : hit.snippet || "", score: 0.55, shallow: !full.ok });
      }
      return { ok: true, text: out.length ? "" : "Nothing matched.", evidence: out };
    };
    if (call.name === "email_search" || (call.name === "email_read" && !ref)) return searchAndRead("mail");
    if (call.name === "cloud_files_search" || (call.name === "cloud_files_read" && !ref)) return searchAndRead("files");
    if (call.name === "search_library") return searchAndRead("library");
    if (call.name === "calendar_list") return searchAndRead("calendar");
    if (call.name === "email_read" || call.name === "cloud_files_read") {
      const source: SourceKind = call.name === "email_read" ? "mail" : "files";
      const r = await tools.read(source, ref);
      return r.ok ? { ok: true, text: "", evidence: [{ id: `${source}-${ref}`, source, title: r.title || ref, ref, date: r.date, text: r.text, score: 0.7 }] } : { ok: false, text: "Could not open that item." };
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
