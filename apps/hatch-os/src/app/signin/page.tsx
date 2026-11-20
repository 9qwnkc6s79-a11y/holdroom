"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useHatch } from "@/components/AppProvider";
import { TESTER_HOST } from "@/lib/version";

export default function SignInPage() {
  const { pair, pairError, session } = useHatch();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const testerSite = typeof window !== "undefined" && window.location.hostname === TESTER_HOST;

  if (session) return <p className="boot-note">Opening Hatch…</p>;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("invite") || "");
    setBusy(true);
    const ok = await pair({ invite: code, device: "This phone", method: "totp" });
    setBusy(false);
    if (ok) router.push("/chat");
  }

  async function onDemo() {
    setBusy(true);
    const ok = await pair({ invite: "BOUNDARIES", totp: "000000", device: "Demo", method: "totp" });
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
        {testerSite ? null : (
          <button className="demo-go" type="button" onClick={() => void onDemo()} disabled={busy}>
            Staff preview — not for testers
          </button>
        )}
        <p className="os-fine">
          This beta runs on cloud test hardware, not a firm’s own box. <Link href="/offline">Offline</Link>
        </p>
      </div>
    </div>
  );
}
