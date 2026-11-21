"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { IconChevronLeft } from "@/components/os/Icons";

interface CatalogItem {
  kind: string;
  name: string;
  blurb: string;
  auth: string;
}

interface Connected {
  kind: string;
  label: string;
  detail: string;
}

interface Setup {
  kind: string;
  configured: boolean;
  callbackUrl: string;
}

const OAUTH = new Set(["google", "microsoft", "slack", "notion"]);

export function ConnectApps({ scope }: { scope: string }) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [connected, setConnected] = useState<Connected[]>([]);
  const [setup, setSetup] = useState<Setup[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/connectors", { headers: { "x-hatch-tester": scope }, cache: "no-store" });
    const data = (await res.json()) as { catalog: CatalogItem[]; connected: Connected[]; setup: Setup[] };
    setCatalog(data.catalog || []);
    setConnected(data.connected || []);
    setSetup(data.setup || []);
  }

  useEffect(() => {
    void load().catch(() => setError("Could not load connectors."));
  }, [scope]);

  useEffect(() => {
    if (!kind) return;
    document.querySelector(".set-sheet")?.scrollTo(0, 0);
  }, [kind]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((item) => !q || `${item.name} ${item.blurb} ${item.kind}`.toLowerCase().includes(q));
  }, [catalog, query]);

  const active = catalog.find((item) => item.kind === kind) || null;
  const live = connected.find((item) => item.kind === kind);

  async function beginOAuth(provider: string) {
    setError("");
    setNote("");
    const res = await fetch(`/api/connectors/${provider}/start?scope=${encodeURIComponent(scope)}`, { redirect: "manual" });
    const type = res.headers.get("content-type") || "";
    if (res.status >= 300 && res.status < 400) {
      window.location.href = res.headers.get("location") || `/api/connectors/${provider}/start?scope=${encodeURIComponent(scope)}`;
      return;
    }
    if (type.includes("json")) {
      const data = (await res.json()) as { message?: string; callbackUrl?: string; configured?: boolean };
      setNote(`${data.message || "OAuth is not configured."}${data.callbackUrl ? ` Callback: ${data.callbackUrl}` : ""}`);
      return;
    }
    setError("The OAuth start route did not answer.");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind) return;
    setBusy(true);
    setError("");
    setNote("");
    const form = new FormData(event.currentTarget);
    const payload: Record<string, string> = { kind, scope };
    form.forEach((value, key) => {
      payload[key] = String(value);
    });
    const res = await fetch("/api/connectors", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hatch-tester": scope },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res.ok) {
      setError(data?.error || "Could not connect.");
      return;
    }
    setNote("Connected.");
    setKind(null);
    await load();
  }

  async function test(provider: string) {
    setError("");
    const res = await fetch("/api/connectors", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-hatch-tester": scope },
      body: JSON.stringify({ kind: provider, scope }),
    });
    const data = (await res.json().catch(() => null)) as { detail?: string; error?: string } | null;
    if (!res.ok) setError(data?.error || "Test failed.");
    else setNote(data?.detail || "Test succeeded.");
  }

  async function disconnect(provider: string) {
    await fetch(`/api/connectors?kind=${encodeURIComponent(provider)}`, { method: "DELETE", headers: { "x-hatch-tester": scope } });
    setNote("Disconnected.");
    await load();
  }

  if (active) {
    return (
      <div className="connect">
        <header className="set-sub">
          <button type="button" className="round" aria-label="Back to connectors" onClick={() => { setKind(null); setError(""); setNote(""); }}>
            <IconChevronLeft />
          </button>
          <h1>{active.name}</h1>
        </header>
        {error ? <p className="os-error" role="alert">{error}</p> : null}
        {note ? <p className="set-note" role="status">{note}</p> : null}
        <section className="set-card" aria-label={`${active.name} setup`}>
          <div className="set-row is-static">
            <span className="set-main"><strong>{active.name}</strong><span>{live ? live.detail : active.blurb}</span></span>
          </div>
          {live ? (
            <div className="row-actions">
              <button type="button" className="os-btn" onClick={() => void test(active.kind)}>Test</button>
              <button type="button" className="ghost" onClick={() => void disconnect(active.kind)}>Disconnect</button>
            </div>
          ) : null}
          {OAUTH.has(active.kind) ? (
            <div className="set-field">
              <button type="button" className="os-btn" onClick={() => void beginOAuth(active.kind)}>Connect {active.name}</button>
              {active.kind === "slack" || active.kind === "notion" ? <p className="fine">Or paste a token below. OAuth is used when its credentials are set.</p> : null}
              {!setup.find((item) => item.kind === active.kind)?.configured ? (
                <p className="fine">Needs {active.name} OAuth credentials in Vercel. Callback: {setup.find((item) => item.kind === active.kind)?.callbackUrl}</p>
              ) : null}
            </div>
          ) : null}
          {active.kind === "email" || active.kind === "slack" || active.kind === "notion" || active.kind === "github" || active.kind === "linear" || active.kind === "mcp" ? (
            <form onSubmit={onSubmit}>
              {active.kind === "email" ? <EmailFields /> : null}
              {active.kind === "mcp" ? (
                <>
                  <label className="set-field">MCP URL<input name="url" type="url" required placeholder="https://example.com/mcp" aria-label="MCP URL" /></label>
                  <label className="set-field">Bearer token<input name="token" type="password" autoComplete="off" aria-label="MCP bearer token" /></label>
                </>
              ) : null}
              {active.kind !== "email" && active.kind !== "mcp" ? (
                <label className="set-field">{active.kind === "linear" ? "API key" : "Token"}
                  <input name="token" type="password" required autoComplete="off" aria-label={`${active.name} token`} />
                </label>
              ) : null}
              <div className="row-actions">
                <button className="os-btn" type="submit" disabled={busy}>{busy ? "Checking…" : "Save connection"}</button>
              </div>
            </form>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="connect">
      <input
        className="connect-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search connectors"
        aria-label="Search connectors"
      />
      {error ? <p className="os-error" role="alert">{error}</p> : null}
      {note ? <p className="set-note" role="status">{note}</p> : null}
      <section className="set-card">
        {rows.map((item) => {
          const on = connected.find((row) => row.kind === item.kind);
          return (
            <button key={item.kind} type="button" className="set-row" onClick={() => { setKind(item.kind); setError(""); setNote(""); }}>
              <span className="set-main">
                <strong>{item.name}</strong>
                <span>{on ? on.label : item.blurb}</span>
              </span>
              {on ? <span className="status-live">Connected</span> : <span className="set-value">{item.auth}</span>}
            </button>
          );
        })}
        {!rows.length ? <p className="set-note">No connectors match that search.</p> : null}
      </section>
    </div>
  );
}

function EmailFields() {
  return (
    <>
      <label className="set-field">Provider
        <select name="preset" aria-label="Email provider" defaultValue="gmail">
          <option value="gmail">Gmail app password</option>
          <option value="outlook">Outlook / Exchange</option>
          <option value="fastmail">Fastmail</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <label className="set-field">Email<input name="email" type="email" required aria-label="Mailbox address" /></label>
      <label className="set-field">App password<input name="password" type="password" required autoComplete="off" aria-label="Mailbox password" /></label>
      <label className="set-field">IMAP host<input name="imapHost" placeholder="imap.gmail.com" aria-label="IMAP host" /></label>
      <label className="set-field">IMAP port<input name="imapPort" inputMode="numeric" placeholder="993" aria-label="IMAP port" /></label>
      <label className="set-field">SMTP host<input name="smtpHost" placeholder="smtp.gmail.com" aria-label="SMTP host" /></label>
      <label className="set-field">SMTP port<input name="smtpPort" inputMode="numeric" placeholder="587" aria-label="SMTP port" /></label>
    </>
  );
}
