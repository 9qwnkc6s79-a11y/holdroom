import { MOCK_STATUS } from "./mock-data";
import type { BoxStatus, EgressCheck, EgressResult, Source } from "./types";

const STATUS_URL = process.env.STATUS_URL || "http://127.0.0.1:8090";
const RAG_URL = process.env.RAG_URL || "http://127.0.0.1:8091";

function asEgress(value: unknown): EgressResult {
  if (value === "FAIL=blocked" || value === "PASS=reachable") return value;
  return null;
}

function normalizeStatus(raw: Record<string, unknown>, source: BoxStatus["source"]): BoxStatus {
  const egress = (raw.egress_check ?? {}) as Record<string, unknown>;
  const check: EgressCheck = {
    status: egress.status === "checked" ? "checked" : "unknown",
    detail: typeof egress.detail === "string" ? egress.detail : "",
    openai: asEgress(egress.openai),
    anthropic: asEgress(egress.anthropic),
  };
  return {
    ok: Boolean(raw.ok),
    version: typeof raw.version === "string" ? raw.version : "unknown",
    egress_check: check,
    label: typeof raw.label === "string" ? raw.label : "Hatch OS",
    stack: typeof raw.stack === "string" ? raw.stack : "Hatch",
    model: typeof raw.model === "string" ? raw.model : MOCK_STATUS.model,
    disk_free: typeof raw.disk_free === "string" ? raw.disk_free : MOCK_STATUS.disk_free,
    last_backup: typeof raw.last_backup === "string" ? raw.last_backup : MOCK_STATUS.last_backup,
    last_egress_check:
      typeof raw.last_egress_check === "string"
        ? raw.last_egress_check
        : MOCK_STATUS.last_egress_check,
    source,
  };
}

export async function fetchBoxStatus(): Promise<BoxStatus> {
  try {
    const res = await fetch(`${STATUS_URL}/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const json = (await res.json()) as Record<string, unknown>;
      return normalizeStatus(json, "adapter");
    }
  } catch {
    /* dry-run status :8090 is optional */
  }
  return { ...MOCK_STATUS, source: "mock" };
}

export interface RagHit {
  file?: string;
  filename?: string;
  title?: string;
  snippet?: string;
  text?: string;
  page?: string | number;
  room?: string;
}

export async function ragSearch(query: string): Promise<Source[] | null> {
  try {
    const url = new URL("/search", RAG_URL);
    url.searchParams.set("q", query);
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: RagHit[] } | RagHit[];
    const rows = Array.isArray(json) ? json : json.results ?? [];
    return rows.map((row) => ({
      file: String(row.file || row.filename || row.title || "retrieved.txt"),
      room: String(row.room || "Little Elm"),
      page: row.page != null ? String(row.page) : undefined,
      snippet: String(row.snippet || row.text || ""),
    }));
  } catch {
    return null;
  }
}

export async function ragIngest(filename: string): Promise<boolean> {
  try {
    const res = await fetch(`${RAG_URL}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function statusUrls() {
  return { STATUS_URL, RAG_URL };
}
