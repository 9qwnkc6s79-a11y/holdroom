/**
 * Fixture versions of Hatch's connectors for offline evals.
 *
 * - `deepTools`: what Hatch's harness adapter sees when connectors return full
 *   thread / file bodies (the behaviour PR #30 adds to connectors.ts).
 * - `mainShallowTools`: what main's connectors return today: Gmail subjects only,
 *   Drive names only (`name contains`), 5 results max.
 */
import { EVENTS, FILES, LIBRARY, THREADS, type FixtureThread } from "./fixtures.ts";
import type { HarnessTools, Hit, ToolCallLike } from "../../src/lib/harness/engine.ts";
import type { Evidence } from "../../src/lib/harness/context.ts";

function words(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9@.\s-]+/g, " ").split(/\s+/).filter(Boolean);
}

/** Minimal Gmail query semantics: AND of terms, "quoted phrases", OR groups, from:/to:, newer_than ignored-but-respected vs FIXTURE_TODAY. */
export function gmailMatch(thread: FixtureThread, query: string): boolean {
  const hay = `${thread.subject}\n${thread.messages.map((m) => `${m.from} ${m.to} ${m.body} ${(m.attachments || []).join(" ")}`).join("\n")}`.toLowerCase();
  const q = query.replace(/newer_than:\S+/g, "").trim();
  if (!q) return true;
  // Split on OR at top level into alternatives of AND-groups (good enough for our generated queries).
  const orParts = q.split(/\s+OR\s+/);
  if (orParts.length > 1) {
    // "a b OR c d" -> any part matches as AND-group; also handle "(from:x OR to:x) rest".
    const m = q.match(/^\((.+?)\)\s*(.*)$/);
    if (m) return m[1].split(/\s+OR\s+/).some((alt) => gmailMatch(thread, alt)) && (!m[2] || gmailMatch(thread, m[2]));
    return orParts.some((part) => gmailMatch(thread, part));
  }
  const tokens = q.match(/"[^"]+"|\S+/g) || [];
  return tokens.every((tok) => {
    if (tok.startsWith('"')) return hay.includes(tok.slice(1, -1).toLowerCase());
    if (/^(from|to):/i.test(tok)) return hay.includes(tok.split(":")[1].toLowerCase());
    return words(hay).some((w) => w === tok.toLowerCase() || w.startsWith(tok.toLowerCase()) && tok.length >= 5);
  });
}

function formatThread(thread: FixtureThread): string {
  return thread.messages
    .map((m) => `From: ${m.from}\nTo: ${m.to}\nDate: ${m.date.slice(0, 10)}\n${m.attachments?.length ? `Attachments: ${m.attachments.join(", ")}\n` : ""}\n${m.body}`)
    .join("\n\n");
}

function fileMatch(text: string, query: string) {
  const terms = words(query.replace(/["()]/g, " ")).filter((t) => t.length > 2 && t !== "or");
  const hay = text.toLowerCase();
  if (!terms.length) return false;
  const hits = terms.filter((t) => hay.includes(t)).length;
  return hits >= Math.max(1, Math.ceil(terms.length * 0.6));
}

export const calls: string[] = [];

export const deepTools: HarnessTools = {
  async search(source, query) {
    calls.push(`${source}:${query}`);
    if (source === "mail") {
      const hits: Hit[] = THREADS.filter((t) => gmailMatch(t, query))
        .sort((a, b) => b.messages[b.messages.length - 1].date.localeCompare(a.messages[a.messages.length - 1].date))
        .slice(0, 5)
        .map((t) => ({ title: t.subject, ref: t.id, date: t.messages[t.messages.length - 1].date.slice(0, 10), url: `https://mail.google.com/mail/u/0/#all/${t.id}`, snippet: t.messages[t.messages.length - 1].body.slice(0, 140), from: t.messages[t.messages.length - 1].from }));
      return { ok: true, hits };
    }
    if (source === "files") {
      const hits = FILES.filter((f) => fileMatch(`${f.name} ${f.text}`, query)).slice(0, 5).map((f) => ({ title: f.name, ref: f.id, date: f.modified, url: `https://drive.google.com/file/d/${f.id}/view`, snippet: f.text.slice(0, 120) }));
      return { ok: true, hits };
    }
    if (source === "calendar") {
      return { ok: true, hits: EVENTS.map((e) => ({ title: e.title, ref: e.id, date: e.start, snippet: `${e.start} ${e.title}${e.attendees ? ` with ${e.attendees.join(", ")}` : ""}`, body: `${e.start.replace("T", " ").slice(0, 16)} — ${e.title}${e.attendees ? ` (with ${e.attendees.join(", ")})` : ""}` })) };
    }
    const hits = LIBRARY.filter((p) => fileMatch(`${p.title} ${p.text}`, query)).map((p) => ({ title: p.title, body: p.text }));
    return { ok: true, hits };
  },
  async read(source, ref) {
    calls.push(`read:${source}:${ref}`);
    if (source === "mail") {
      const t = THREADS.find((x) => x.id === ref);
      return t ? { ok: true, title: t.subject, text: formatThread(t), date: t.messages[t.messages.length - 1].date.slice(0, 10), url: `https://mail.google.com/mail/u/0/#all/${t.id}` } : { ok: false, text: "" };
    }
    const f = FILES.find((x) => x.id === ref);
    return f ? { ok: true, title: f.name, text: f.text, date: f.modified, url: `https://drive.google.com/file/d/${f.id}/view` } : { ok: false, text: "" };
  },
};

/** Model-requested tools against the deep fixtures. */
export async function deepRunNamed(call: ToolCallLike): Promise<{ ok: boolean; text: string; evidence?: Evidence[] }> {
  const a = call.arguments || {};
  const q = String(a.query || a.q || "");
  const ref = String(a.ref || a.threadId || a.fileId || "");
  if (call.name === "email_search" || (call.name === "email_read" && !ref)) {
    const r = await deepTools.search("mail", q, {});
    const ev: Evidence[] = [];
    for (const hit of r.hits.slice(0, 3)) {
      const full = await deepTools.read("mail", hit.ref!, hit.title);
      ev.push({ id: `m-${hit.ref}`, source: "mail", title: hit.title, ref: hit.ref, date: hit.date, text: full.text, score: 0.6 });
    }
    return { ok: true, text: ev.length ? "" : "No mail matched.", evidence: ev };
  }
  if (call.name === "email_read") {
    const r = await deepTools.read("mail", ref);
    return r.ok ? { ok: true, text: "", evidence: [{ id: `m-${ref}`, source: "mail", title: r.title || ref, ref, date: r.date, text: r.text, score: 0.7 }] } : { ok: false, text: "Not found." };
  }
  if (call.name === "cloud_files_search" || (call.name === "cloud_files_read" && !ref)) {
    const r = await deepTools.search("files", q, {});
    return { ok: true, text: r.hits.length ? "" : "No files matched.", evidence: r.hits.map((h) => ({ id: `f-${h.ref}`, source: "files" as const, title: h.title, ref: h.ref, date: h.date, text: FILES.find((f) => f.id === h.ref)?.text || "", score: 0.6 })) };
  }
  if (call.name === "cloud_files_read") {
    const r = await deepTools.read("files", ref);
    return r.ok ? { ok: true, text: "", evidence: [{ id: `f-${ref}`, source: "files", title: r.title || ref, ref, text: r.text, score: 0.7 }] } : { ok: false, text: "Not found." };
  }
  if (call.name === "calendar_list") {
    const r = await deepTools.search("calendar", q, {});
    return { ok: true, text: "", evidence: r.hits.map((h) => ({ id: `c-${h.ref}`, source: "calendar" as const, title: h.title, ref: h.ref, date: h.date, text: h.body || "", score: 0.5 })) };
  }
  if (call.name === "search_library") {
    const r = await deepTools.search("library", q, {});
    return { ok: true, text: r.hits.length ? "" : "No library passages matched.", evidence: r.hits.map((h, i) => ({ id: `l-${i}`, source: "library" as const, title: h.title, text: h.body || "", score: 0.4 })) };
  }
  if (call.name === "email_draft") return { ok: true, text: `Draft saved for review to ${a.to || "(no recipient)"}. Not sent.` };
  return { ok: false, text: "Unknown tool." };
}

/** main's connectors today: subjects / names only. */
export const mainShallowTools: HarnessTools = {
  async search(source, query) {
    calls.push(`shallow:${source}:${query}`);
    if (source === "mail") {
      const subjects = THREADS.filter((t) => gmailMatch(t, query)).slice(0, 5).map((t) => ({ title: t.subject }));
      return { ok: true, hits: subjects };
    }
    if (source === "files") {
      const q = query.replace(/'/g, "").toLowerCase();
      return { ok: true, hits: FILES.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 5).map((f) => ({ title: f.name })) };
    }
    if (source === "calendar") return { ok: true, hits: EVENTS.slice(0, 5).map((e) => ({ title: e.title, body: `${e.start} ${e.title}` })) };
    return deepTools.search("library", query, {});
  },
  async read() {
    return { ok: false, text: "" };
  },
};

export async function shallowRunNamed(call: ToolCallLike): Promise<{ ok: boolean; text: string; evidence?: Evidence[] }> {
  const q = String(call.arguments?.query || call.arguments?.q || "");
  if (call.name.startsWith("email_")) {
    const r = await mainShallowTools.search("mail", q, {});
    return { ok: true, text: r.hits.length ? `Gmail: ${r.hits.map((h) => h.title).join(" · ")}` : "No mail matched.", evidence: r.hits.map((h, i) => ({ id: `s-${i}`, source: "mail" as const, title: h.title, text: "", score: 0.4, shallow: true })) };
  }
  if (call.name.startsWith("cloud_files_")) {
    const r = await mainShallowTools.search("files", q, {});
    return { ok: true, text: r.hits.map((h) => h.title).join("\n") || "No files matched.", evidence: r.hits.map((h, i) => ({ id: `sf-${i}`, source: "files" as const, title: h.title, text: "", score: 0.4, shallow: true })) };
  }
  return deepRunNamed(call);
}
