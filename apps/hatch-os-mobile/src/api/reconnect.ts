/** Shared copy and helpers for connector health, matching the web Connect apps UI. */

export type ConnectorStatus = "ok" | "missing_scope" | "expired" | "unreadable";

export type ConnectorHealth = {
  status?: ConnectorStatus;
  missing?: string[];
};

export function needsReconnect(row: ConnectorHealth | null | undefined): boolean {
  return Boolean(row?.status && row.status !== "ok");
}

export function anyNeedsReconnect(rows: ConnectorHealth[] | null | undefined): boolean {
  return (rows || []).some(needsReconnect);
}

/** Same sentences the web app shows for a missing or expired grant. */
export function reconnectReason(row: ConnectorHealth): string {
  if (row.status === "missing_scope") {
    return `Reconnect to let Hatch ${(row.missing || ["finish setup"]).join(" and ")}. Tap Reconnect and allow every permission Google asks for.`;
  }
  if (row.status === "expired") return "This connection expired. Tap Reconnect to sign in again.";
  if (row.status === "unreadable") return "This connection could not be read. Tap Reconnect to sign in again.";
  return "";
}

export function reconnectCta(provider?: string, name?: string): string {
  if (provider === "google") return "Reconnect Google";
  if (provider === "microsoft") return "Reconnect Microsoft";
  return name ? `Reconnect ${name}` : "Reconnect";
}
