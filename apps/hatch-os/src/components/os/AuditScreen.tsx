"use client";

import { useEffect, useState } from "react";
import { OsShell } from "@/components/os/OsShell";
import { AGENTS } from "@/lib/agents";
import type { AuditEntry } from "@/lib/types";

function when(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function AuditScreen() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    void fetch("/api/audit", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { entries?: AuditEntry[] }) => setEntries(data.entries || []))
      .catch(() => setEntries([]));
  }, []);

  return (
    <OsShell title="Audit" lede="Who asked, which tools ran, and which approvals were given. Vault secrets are not written here.">
      <div className="os-page">
        {entries.length ? (
          <table className="os-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Agent</th>
                <th>Event</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{when(entry.at)}</td>
                  <td>{entry.actor || "—"}</td>
                  <td>{AGENTS.find((agent) => agent.id === entry.agentId)?.name || entry.agentId || "—"}</td>
                  <td>
                    {entry.kind || "tool"} · {entry.tool}
                    {entry.ok ? "" : " · denied"}
                  </td>
                  <td>{entry.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No audit entries yet. A question in chat will show up here.</p>
        )}
      </div>
    </OsShell>
  );
}
