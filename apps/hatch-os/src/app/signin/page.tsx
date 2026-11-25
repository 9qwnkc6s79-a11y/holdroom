"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useHatch } from "@/components/AppProvider";

export default function SignInPage() {
  const { pair, pairError, session } = useHatch();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    void fetch("/api/status", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { demoMode?: boolean }) => setDemoMode(Boolean(data.demoMode)))
      .catch(() => setDemoMode(false));
  }, []);

  if (session) return <p className="boot-note">Opening Hatch…</p>;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("invite") || "");
    setBusy(true);
    const ok = await pair({ invite: code, device: "This browser", method: "totp" });
    setBusy(false);
    if (ok) router.push("/chat");
  }

  async function onDemo() {
    setBusy(true);
    const ok = await pair({ invite: "STAFF-PREVIEW", device: "Staff preview", method: "totp" });
    setBusy(false);
    if (ok) router.push("/chat");
  }

  return (
    <div className="os-gate">
      <div className="os-gate-card">
        <h1>Hatch</h1>
        <p>Sign in with the code you were sent.</p>
        {pairError ? <p className="os-error">{pairError}</p> : null}
        <form className="os-form" onSubmit={onSubmit}>
          <label>Your code<input name="invite" autoComplete="one-time-code" autoCapitalize="characters" required /></label>
          <button className="os-btn" type="submit" disabled={busy}>Sign in</button>
        </form>
        {demoMode ? (
          <button className="demo-go" type="button" onClick={() => void onDemo()} disabled={busy}>
            Staff preview — demo mode
          </button>
        ) : null}
        <p className="os-fine">
          This beta runs on cloud test hardware, not a firm’s own box. <Link href="/offline">Offline</Link>
        </p>
      </div>
    </div>
  );
}
