"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useHatch } from "@/components/AppProvider";

export default function SignInPage() {
  const { pair, pairError, session } = useHatch();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    void fetch("/api/status", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { demoMode?: boolean }) => setDemo(Boolean(data.demoMode)))
      .catch(() => setDemo(false));
  }, []);

  if (session) return <p className="boot-note">Opening Hatch OS…</p>;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const invite = String(new FormData(form).get("invite") || "");
    const totp = String(new FormData(form).get("totp") || "");
    const device = String(new FormData(form).get("device") || "");
    setBusy(true);
    const ok = await pair({ invite, totp, device, method: "totp" });
    setBusy(false);
    if (ok) router.push("/chat?agent=general");
  }

  async function onDemo() {
    setBusy(true);
    const ok = await pair({ invite: "BOUNDARIES", totp: "000000", device: "Demo", method: "totp" });
    setBusy(false);
    if (ok) router.push("/chat?agent=general");
  }

  return (
    <div className="os-gate">
      <div className="os-gate-card">
        <p className="os-kicker" style={{ color: "#6d776f" }}>
          Private to the firm
        </p>
        <h1>Hatch</h1>
        <p>The firm’s assistant. It runs on your network. Sign in to open it.</p>
        {pairError ? <p className="os-error">{pairError}</p> : null}
        {demo ? (
          <p>
            <button className="os-btn" type="button" onClick={() => void onDemo()} disabled={busy}>
              Continue in demo
            </button>
          </p>
        ) : null}
        <form className="os-form" onSubmit={onSubmit}>
          <label>
            Invite code
            <input name="invite" autoComplete="one-time-code" placeholder="Invite" required />
          </label>
          <label>
            Authenticator code
            <input name="totp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="6 digits" required />
          </label>
          <label>
            Device
            <input name="device" placeholder="This browser" />
          </label>
          <button className="os-btn" type="submit" disabled={busy}>
            Sign in
          </button>
        </form>
        <p className="os-fine">
          If the office network is down, Hatch does not fall back to a public lab.{" "}
          <Link href="/offline">Offline</Link>
        </p>
      </div>
    </div>
  );
}
