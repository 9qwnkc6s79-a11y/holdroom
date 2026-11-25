"use client";

import { FormEvent, useState } from "react";

interface Account {
  code: string;
  label: string;
  unlimited: boolean;
  balance: number;
  grantedFree: boolean;
  freeGrant: number;
  lifetimeUsed: number;
  lifetimePurchased: number;
  lifetimeGranted: number;
  updatedAt: string;
}

export default function TokenAdminPage() {
  const [admin, setAdmin] = useState("");
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");

  async function load(event?: FormEvent) {
    event?.preventDefault();
    setError("");
    setStatus("");
    const res = await fetch("/api/admin/tokens", { headers: { "x-hatch-admin": admin }, cache: "no-store" });
    const data = (await res.json().catch(() => null)) as { error?: string; accounts?: Account[] } | null;
    if (!res.ok) {
      setAccounts(null);
      setError(data?.error || "Could not open the token list.");
      return;
    }
    setAccounts(data?.accounts || []);
  }

  async function grant(event: FormEvent) {
    event.preventDefault();
    setError("");
    setStatus("");
    const res = await fetch("/api/admin/tokens", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hatch-admin": admin },
      body: JSON.stringify({ code, amount: Number(amount), note }),
    });
    const data = (await res.json().catch(() => null)) as { error?: string; applied?: boolean; account?: Account } | null;
    if (!res.ok) {
      setError(data?.error || "Could not grant tokens.");
      return;
    }
    setStatus(data?.applied === false ? "That grant was already applied." : "Tokens were added.");
    setAmount("");
    await load();
  }

  return (
    <main className="os-gate">
      <div className="os-gate-card" style={{ maxWidth: 720, textAlign: "left" }}>
        <h1>Tester tokens</h1>
        <form className="os-form" onSubmit={(event) => void load(event)}>
          <label>Admin code<input value={admin} onChange={(event) => setAdmin(event.target.value)} autoComplete="off" /></label>
          <button className="os-btn" type="submit">Open</button>
        </form>
        {error ? <p className="os-error">{error}</p> : null}
        {status ? <p className="fine">{status}</p> : null}
        {accounts ? (
          <section className="set-card">
            {accounts.map((account) => (
              <div key={account.code} className="set-row is-static">
                <span className="set-main">
                  <strong>{account.code}</strong>
                  <span>
                    {account.label}
                    {account.unlimited ? " · unlimited" : ` · ${account.balance.toLocaleString()} left`}
                    {` · used ${account.lifetimeUsed.toLocaleString()}`}
                    {account.lifetimePurchased ? ` · bought ${account.lifetimePurchased.toLocaleString()}` : ""}
                    {account.lifetimeGranted ? ` · granted ${account.lifetimeGranted.toLocaleString()}` : ""}
                  </span>
                </span>
              </div>
            ))}
            {accounts.length === 0 ? <p className="set-note">No tester codes are configured yet.</p> : null}
          </section>
        ) : null}
        {accounts ? (
          <form className="os-form" onSubmit={(event) => void grant(event)}>
            <label>Invite code<input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" /></label>
            <label>Tokens to grant<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" /></label>
            <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
            <button className="os-btn" type="submit">Grant tokens</button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
