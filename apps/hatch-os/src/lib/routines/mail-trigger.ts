/**
 * Email triggers by polling Gmail (read-only scope already granted). A check
 * never calls a model, so watching for "Robert replied" costs no GPU time.
 */
import { refreshAccess } from "../connectors.ts";
import type { RoutineTrigger } from "./types.ts";

export interface MailHit {
  id: string;
  threadId?: string;
  from: string;
  subject: string;
  snippet: string;
  date?: string;
}

/** Returns null when no Google account is connected for the scope. */
export type MailSearch = (scope: string, query: string, knownIds: Set<string>) => Promise<MailHit[] | null>;

const SEEN_CAP = 60;
const TIMEOUT = 12_000;

/** Window and self-exclusion added to every trigger query. */
export function triggerSearchQuery(query: string): string {
  return `${query} -from:me newer_than:3d`;
}

export const gmailSearchNew: MailSearch = async (scope, query, knownIds) => {
  const accounts = await refreshAccess(scope, "google").catch(() => []);
  if (!accounts.length) return null;
  const token = accounts[0].accessToken;
  const get = async <T>(url: string): Promise<T | null> => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT) }).catch(() => null);
    if (!res?.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  };
  const list = await get<{ messages?: { id: string; threadId: string }[] }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(triggerSearchQuery(query))}`,
  );
  if (!list) throw new Error("Gmail search failed.");
  const hits: MailHit[] = [];
  for (const item of list.messages || []) {
    if (knownIds.has(item.id)) {
      hits.push({ id: item.id, threadId: item.threadId, from: "", subject: "", snippet: "" });
      continue;
    }
    const meta = await get<{ snippet?: string; internalDate?: string; payload?: { headers?: { name?: string; value?: string }[] } }>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
    );
    const header = (name: string) => meta?.payload?.headers?.find((h) => (h.name || "").toLowerCase() === name.toLowerCase())?.value || "";
    hits.push({
      id: item.id,
      threadId: item.threadId,
      from: header("From"),
      subject: header("Subject") || "(no subject)",
      snippet: (meta?.snippet || "").replace(/\s+/g, " ").slice(0, 240),
      date: meta?.internalDate ? new Date(Number(meta.internalDate)).toISOString() : undefined,
    });
  }
  return hits;
};

/**
 * Split hits into fresh vs. already seen. The first check after a trigger is
 * saved only records what is already in the inbox, so it never fires on old mail.
 */
export function freshMatches(trigger: RoutineTrigger, hits: MailHit[]): { fresh: MailHit[]; seenIds: string[]; primed: boolean } {
  const seen = new Set(trigger.seenIds || []);
  const fresh = trigger.primed ? hits.filter((hit) => !seen.has(hit.id)) : [];
  const seenIds = [...(trigger.seenIds || []), ...hits.map((h) => h.id).filter((id) => !seen.has(id))].slice(-SEEN_CAP);
  return { fresh: fresh.reverse(), seenIds, primed: true };
}

export function notifyText(hits: MailHit[]): string {
  const lines = hits.slice(0, 5).map((hit) => {
    const from = hit.from.replace(/\s*<[^>]+>\s*/, "").replace(/"/g, "").trim() || hit.from || "Someone";
    return `• **${from}**: “${hit.subject}”${hit.snippet ? `. ${hit.snippet}` : ""}`;
  });
  const more = hits.length > 5 ? `\n\n…and ${hits.length - 5} more.` : "";
  return `${hits.length === 1 ? "New email" : `${hits.length} new emails`}:\n\n${lines.join("\n")}${more}`;
}
