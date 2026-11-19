"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useHatch } from "@/components/AppProvider";

export default function SignInPage() {
  const { pair, pairError, session } = useHatch();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<boolean | null>(null);
  const [invite, setInvite] = useState(false);

  useEffect(() => {
    void fetch("/api/status", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { demoMode?: boolean }) => setDemo(Boolean(data.demoMode)))
      .catch(() => setDemo(false));
  }, []);

  if (session) return <p className="boot-note">Opening Hatch…</p>;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = String(new FormData(form).get("invite") || "");
    const totp = String(new FormData(form).get("totp") || "");
    const device = String(new FormData(form).get("device") || "");
    setBusy(true);
    const ok = await pair({ invite: code, totp, device, method: "totp" });
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
        <p>The firm’s private agents. Sign in on the office network.</p>
        {pairError ? <p className="os-error">{pairError}</p> : null}
        {demo !== false ? (
          <button className="demo-go" type="button" onClick={() => void onDemo()} disabled={busy || demo === null}>
            Continue in demo
          </button>
        ) : null}
        <button className="text-btn" type="button" onClick={() => setInvite((value) => !value)}>
          {invite ? "Hide invite" : "Use an invite code"}
        </button>
        {invite ? (
          <form className="os-form" onSubmit={onSubmit}>
            <label>Invite code<input name="invite" autoComplete="one-time-code" required /></label>
            <label>Authenticator code<input name="totp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label>
            <label>Device<input name="device" placeholder="This phone" /></label>
            <button className="os-btn" type="submit" disabled={busy}>Sign in</button>
          </form>
        ) : null}
        <p className="os-fine">
          Hatch does not fall back to a public lab. <Link href="/offline">Offline</Link>
        </p>
      </div>
    </div>
  );
}
