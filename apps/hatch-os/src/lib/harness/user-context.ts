/**
 * Clock and settings context shown to the model on every turn, so it can
 * confirm Hatch settings and treat the current year as the present.
 */
import type { EthicsProfile } from "../ethics-profile.ts";
import type { ConnectorPublic } from "../connectors.ts";
import { DEFAULT_TZ, tzLabel } from "../routines/cron.ts";

export const DEFAULT_USER_TZ = DEFAULT_TZ;

export function resolveTimeZone(tz?: string | null): string {
  const raw = String(tz || "").trim() || DEFAULT_USER_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return DEFAULT_USER_TZ;
  }
}

/** "Current date and time: Friday, November 27, 2026, 9:54 PM, America/Chicago (CT). It is 2026; dates in 2026 are not in the future." */
export function formatNowForPrompt(now = new Date(), timeZone?: string | null): string {
  const tz = resolveTimeZone(timeZone);
  const datePart = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(now);
  const timePart = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(now);
  const year = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(now);
  const abbrev = tzLabel(tz);
  const zone = abbrev && abbrev !== tz ? `${tz} (${abbrev})` : tz;
  return `Current date and time: ${datePart}, ${timePart}, ${zone}. It is ${year}; dates in ${year} are not in the future.`;
}

/** YYYY-MM-DD in the user's time zone. */
export function todayIsoInZone(now = new Date(), timeZone?: string | null): string {
  const tz = resolveTimeZone(timeZone);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "Coming days: Sat Nov 28; Sun Nov 29; …" computed in the user's zone, not UTC. */
export function comingDaysLine(now = new Date(), timeZone?: string | null, days = 8): string {
  const tz = resolveTimeZone(timeZone);
  const iso = todayIsoInZone(now, tz);
  const [year, month, day] = iso.split("-").map(Number);
  const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
  const list = Array.from({ length: days }, (_, i) => fmt.format(new Date(Date.UTC(year, month - 1, day + i + 1, 12, 0, 0))).replace(",", ""));
  return `Coming days: ${list.join("; ")}.`;
}

export type SettingsConnector = Pick<ConnectorPublic, "kind" | "label" | "status" | "missing">;
export type SettingsRoutine = { name: string; schedule?: string; enabled?: boolean; trigger?: { query?: string } };

function formatConnector(row: SettingsConnector): string {
  const name = row.label || row.kind || "App";
  const status = row.status || "ok";
  if (status === "ok") return `${name} (connected)`;
  if (status === "missing_scope") {
    const missing = (row.missing || []).join(", ") || "some permissions";
    return `${name} (needs reconnect — missing ${missing})`;
  }
  if (status === "expired") return `${name} (needs reconnect — expired)`;
  if (status === "unreadable") return `${name} (could not be read; reconnect in Connect apps)`;
  return `${name} (${status})`;
}

function formatRoutine(row: SettingsRoutine): string {
  const when = row.schedule || (row.trigger?.query ? `when email matches “${row.trigger.query}”` : "");
  return `${row.name}${when ? ` (${when})` : ""}${row.enabled === false ? " — paused" : ""}`;
}

/** Compact, readable settings the model can confirm or describe. It cannot change them. */
export function buildSettingsBlock(input: {
  model?: EthicsProfile["model"] | string;
  ethicsPreset?: EthicsProfile["preset"] | string;
  tone?: EthicsProfile["tone"] | string;
  posture?: EthicsProfile["posture"] | string;
  length?: EthicsProfile["length"] | string;
  connectors?: SettingsConnector[];
  routines?: SettingsRoutine[];
}): string {
  const modelName =
    input.model === "qwen"
      ? "Qwen for drafting; tool turns still run on Hermes"
      : input.model === "hermes"
        ? "Hermes"
        : input.model || "Hermes";
  const ethicsBits = [
    input.ethicsPreset ? `preset ${input.ethicsPreset}` : "",
    input.tone ? `voice ${input.tone}` : "",
    input.posture ? `refusal ${input.posture}` : "",
    input.length ? `length ${input.length}` : "",
  ].filter(Boolean);
  const apps = (input.connectors || []).map(formatConnector);
  const routines = (input.routines || []).map(formatRoutine);
  return [
    "The person's current Hatch settings (you can confirm or describe these; you cannot change them yourself):",
    `- Model: ${modelName}.`,
    ethicsBits.length
      ? `- Model & Ethics: ${ethicsBits.join(", ")}. Firm rules from Model & Ethics are listed above.`
      : "- Model & Ethics: see the firm rules above.",
    apps.length ? `- Connected apps: ${apps.join("; ")}.` : "- Connected apps: none connected yet.",
    routines.length ? `- Routines: ${routines.join("; ")}.` : "- Routines: none saved.",
    "To change these, the person uses Settings in Hatch: Model & Ethics for the model and guidance, Connect apps to connect or reconnect accounts, and Routines to add or edit scheduled asks. Do not say you cannot see their settings.",
  ].join("\n");
}
