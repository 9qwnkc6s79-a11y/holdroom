"use client";

import { FormEvent, useEffect, useState } from "react";
import { useHatch } from "@/components/AppProvider";
import type { VaultKind, VaultPublicItem } from "@/lib/types";

interface Secret {
  password?: string;
  token?: string;
  pan?: string;
  cvv?: string;
  exp?: string;
  holder?: string;
}

export function VaultScreen({ embedded = false }: { embedded?: boolean }) {
  const { session } = useHatch();
  const actor = session ? `${session.role} · ${session.deviceName}` : "owner";
  const [items, setItems] = useState<VaultPublicItem[]>([]);
  const [configured, setConfigured] = useState(true);
  const [keyError, setKeyError] = useState("");
  const [kind, setKind] = useState<VaultKind>("login");
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState<{ id: string; secret: Secret } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/vault", { cache: "no-store" });
    const data = (await res.json()) as { items?: VaultPublicItem[]; configured?: boolean; error?: string | null };
    setItems(data.items || []);
    setConfigured(data.configured !== false);
    setKeyError(data.error || "");
  }

  useEffect(() => {
    void load().catch(() => setKeyError("Could not reach the vault."));
  }, []);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    const res = await fetch("/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        name: String(form.get("name") || ""),
        whenToUse: String(form.get("whenToUse") || ""),
        username: String(form.get("username") || ""),
        password: String(form.get("password") || ""),
        token: String(form.get("token") || ""),
        pan: String(form.get("pan") || ""),
        cvv: String(form.get("cvv") || ""),
        exp: String(form.get("exp") || ""),
        holder: String(form.get("holder") || ""),
        actor,
      }),
    });
    const data = (await res.json().catch(() => null)) as { error?: string };
    if (!res.ok) {
      setError(data?.error || "Could not save.");
      return;
    }
    event.currentTarget.reset();
    setRevealed(null);
    await load();
  }

  async function reveal(item: VaultPublicItem) {
    if (revealed?.id === item.id) {
      setRevealed(null);
      return;
    }
    const res = await fetch(`/api/vault/${item.id}/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor }),
    });
    const data = (await res.json().catch(() => null)) as { secret?: Secret; error?: string };
    if (!res.ok || !data?.secret) {
      setError(data?.error || "Could not reveal.");
      return;
    }
    setRevealed({ id: item.id, secret: data.secret });
  }

  async function remove(item: VaultPublicItem) {
    await fetch(`/api/vault/${item.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor, name: item.name }),
    });
    if (revealed?.id === item.id) setRevealed(null);
    setConfirmId(null);
    await load();
  }

  const body = (
      <div className="os-page">
        {!configured ? <div className="os-banner">{keyError}</div> : null}
        <div className="os-list">
          {items.map((item) => {
            const secret = revealed?.id === item.id ? revealed.secret : null;
            return (
              <article key={item.id} className="os-row">
                <h3>{item.name}</h3>
                <p>{item.whenToUse}</p>
                <div className="os-meta">
                  <span className="os-tag">{item.kind}</span>
                  {item.username ? <span className="os-tag">{item.username}</span> : null}
                  {item.last4 ? <span className="os-tag">•••• {item.last4}</span> : null}
                </div>
                <p className="os-secret" style={{ marginTop: 8 }}>
                  {secret
                    ? secret.password || secret.token || secret.pan || "—"
                    : "••••••••"}
                  {secret?.cvv ? ` · ${secret.cvv}` : ""}
                  {secret?.exp ? ` · ${secret.exp}` : ""}
                </p>
                <div className="os-meta">
                  <button className="os-btn-ghost" type="button" onClick={() => void reveal(item)}>
                    {secret ? "Hide" : "Reveal"}
                  </button>
                  {confirmId === item.id ? (
                    <button className="os-btn-ghost" type="button" onClick={() => void remove(item)}>
                      Confirm delete
                    </button>
                  ) : (
                    <button className="os-btn-ghost" type="button" onClick={() => setConfirmId(item.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {!items.length ? <p>Nothing in the vault yet.</p> : null}
        </div>
        <h2>Add an item</h2>
        <form className="os-form" onSubmit={onCreate}>
          <label>
            Kind
            <select name="kind" value={kind} onChange={(event) => setKind(event.target.value as VaultKind)}>
              <option value="login">Login</option>
              <option value="token">API key</option>
              <option value="card">Payment card</option>
            </select>
          </label>
          <label>
            Name
            <input name="name" required placeholder="Payroll portal" />
          </label>
          <label>
            When to use
            <textarea name="whenToUse" required placeholder="When the agent is filing payroll, and only after you approve." />
          </label>
          {kind === "login" ? (
            <>
              <label>
                Username
                <input name="username" autoComplete="off" />
              </label>
              <label>
                Password
                <input name="password" type="password" autoComplete="new-password" required />
              </label>
            </>
          ) : null}
          {kind === "token" ? (
            <label>
              Token
              <input name="token" type="password" autoComplete="off" required />
            </label>
          ) : null}
          {kind === "card" ? (
            <>
              <label>
                Name on card
                <input name="holder" autoComplete="off" />
              </label>
              <label>
                Card number
                <input name="pan" inputMode="numeric" autoComplete="off" required />
              </label>
              <label>
                Expiry
                <input name="exp" placeholder="MM/YY" autoComplete="off" />
              </label>
              <label>
                Security code
                <input name="cvv" type="password" autoComplete="off" />
              </label>
            </>
          ) : null}
          {error ? <p className="os-error">{error}</p> : null}
          <button className="os-btn" type="submit" disabled={!configured}>
            Save in the vault
          </button>
        </form>
      </div>
  );
  if (embedded) return body;
  return <div className="settings">{body}</div>;
}
