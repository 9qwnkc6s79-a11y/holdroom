"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useHatch } from "@/components/AppProvider";

async function tryPasskey(device: string) {
  if (!window.PublicKeyCredential) return "demo";
  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);
    await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Hatch OS", id: location.hostname },
        user: {
          id: userId,
          name: "partner@firm.local",
          displayName: device || "This device",
        },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        timeout: 30000,
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "preferred",
          residentKey: "preferred",
        },
      },
    });
    return "webauthn";
  } catch {
    return "demo";
  }
}

export default function SignInPage() {
  const { pair, pairError, session } = useHatch();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [passkeyNote, setPasskeyNote] = useState("");

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
    if (ok) router.push("/ask");
  }

  async function onPasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = document.getElementById("pair-form") as HTMLFormElement | null;
    const invite = String(form ? new FormData(form).get("invite") : "");
    const device = String(form ? new FormData(form).get("device") : "");
    setBusy(true);
    const result = await tryPasskey(device);
    const ok = await pair({ invite, device, method: "passkey" });
    setBusy(false);
    if (ok) {
      setPasskeyNote(
        result === "webauthn"
          ? "Passkey registered on this box."
          : "Passkey registered on this box (demo).",
      );
      router.push("/ask");
    }
  }

  return (
    <div className="gate">
      <div className="gate-inner">
        <p className="brand">
          Hatch<span className="dot">.</span>
        </p>
        <h1>This device is not paired.</h1>
        <p className="lede">
          Ask your admin for an invite code. The session lives on this box — the phone stores a
          pointer, not the corpus.
        </p>
        {pairError ? (
          <div className="banner banner-warn" role="alert">
            <p>{pairError}</p>
          </div>
        ) : null}
        {passkeyNote ? (
          <div className="banner banner-ok">
            <p>{passkeyNote}</p>
          </div>
        ) : null}
        <form className="card" id="pair-form" onSubmit={onSubmit}>
          <label htmlFor="invite">Invite code</label>
          <input
            id="invite"
            name="invite"
            type="text"
            autoComplete="one-time-code"
            placeholder="HATCH-····"
            required
          />
          <p className="field-hint">
            Beta stub. Try HATCH-BETA, HATCH-ASSOC (Matter Alpha only), or HATCH-NOSEAT for the
            empty-seat path.
          </p>
          <label htmlFor="totp">Authenticator code</label>
          <input
            id="totp"
            name="totp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="000000"
          />
          <p className="field-hint">TOTP stub — any six digits. No SMS. No “sign in with Google.”</p>
          <label htmlFor="device">Device name (optional)</label>
          <input id="device" name="device" type="text" placeholder="Jane iPhone" />
          <div className="btn-row">
            <button className="btn btn-dark btn-block" type="submit" disabled={busy}>
              Pair this device
            </button>
          </div>
        </form>
        <form onSubmit={onPasskey}>
          <div className="btn-row">
            <button className="btn btn-outline btn-block" type="submit" disabled={busy}>
              Use a passkey
            </button>
          </div>
        </form>
        <p className="fine" style={{ marginTop: 16 }}>
          If the box is not reachable, you will see “can’t reach the room” — not a login that
          pretends to work.{" "}
          <Link className="linkish" href="/offline">
            Show offline demo
          </Link>
        </p>
      </div>
    </div>
  );
}
