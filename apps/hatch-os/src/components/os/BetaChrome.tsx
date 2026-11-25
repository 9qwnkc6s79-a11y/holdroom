"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useHatch } from "@/components/AppProvider";
import { IconX } from "@/components/os/Icons";
import { APP_VERSION } from "@/lib/version";

const ERRORS_KEY = "hatch-console-errors";

function recentErrors(): string[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(ERRORS_KEY) || "[]") as string[];
    return Array.isArray(raw) ? raw.slice(-10) : [];
  } catch {
    return [];
  }
}

export function BetaChrome() {
  const { session } = useHatch();
  const [banner, setBanner] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [shot, setShot] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const sentSession = useRef("");
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setBanner(localStorage.getItem("hatch-beta-ack") !== "1");
    const code = session?.inviteCode || "";
    if (code && sentSession.current !== code) {
      sentSession.current = code;
      void fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "session", code }),
      }).catch(() => undefined);
    }
    const push = (message: string) => {
      const next = [...recentErrors(), message.slice(0, 300)].slice(-10);
      sessionStorage.setItem(ERRORS_KEY, JSON.stringify(next));
    };
    const onError = (event: ErrorEvent) => push(event.message || "error");
    const onReject = (event: PromiseRejectionEvent) => push(String(event.reason || "rejected"));
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    const openSheet = () => setOpen(true);
    window.addEventListener("hatch-feedback", openSheet);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
      window.removeEventListener("hatch-feedback", openSheet);
    };
  }, [session?.inviteCode]);

  useEffect(() => {
    const root = document.documentElement;
    if (!banner || !bannerRef.current) {
      root.style.setProperty("--beta-banner-h", "0px");
      return;
    }
    const update = () => {
      const h = bannerRef.current ? Math.ceil(bannerRef.current.getBoundingClientRect().height) : 0;
      root.style.setProperty("--beta-banner-h", `${h}px`);
    };
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(bannerRef.current);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
      root.style.setProperty("--beta-banner-h", "0px");
    };
  }, [banner]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNote("");
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        screenshot: shot,
        page: window.location.pathname + window.location.search,
        agent: new URLSearchParams(window.location.search).get("agent") || "",
        testerLabel: session?.testerLabel || "",
        inviteCode: session?.inviteCode || "",
        ua: navigator.userAgent,
        errors: recentErrors(),
        version: APP_VERSION,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setNote(data?.error || "Could not send that.");
      return;
    }
    setText("");
    setShot("");
    setNote("Sent. Thank you.");
    window.setTimeout(() => setOpen(false), 800);
  }

  return (
    <>
      {banner ? (
        <div ref={bannerRef} className="beta-banner" role="status">
          <p>
            <span className="beta-long">Hatch beta — test hardware only; please avoid uploading confidential client files.</span>
            <span className="beta-short">Hatch beta · avoid confidential files</span>
          </p>
          <button type="button" onClick={() => { localStorage.setItem("hatch-beta-ack", "1"); setBanner(false); }}>Got it</button>
        </div>
      ) : null}
      {open ? (
        <div className="sheet feedback-sheet" role="dialog" aria-label="Send feedback">
          <header>
            <button type="button" className="round" aria-label="Close" onClick={() => setOpen(false)}><IconX /></button>
            <strong>Send feedback</strong>
            <span className="sheet-balance" aria-hidden="true" />
          </header>
          <form className="os-form" onSubmit={onSubmit}>
            <label>What happened<textarea value={text} onChange={(event) => setText(event.target.value)} required placeholder="A sentence or two" /></label>
            <label>Screenshot (optional)
              <input type="file" accept="image/*" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) { setShot(""); return; }
                const reader = new FileReader();
                reader.onload = () => setShot(typeof reader.result === "string" ? reader.result : "");
                reader.readAsDataURL(file);
              }} />
            </label>
            <p className="fine">Sends with {session?.testerLabel || "your sign-in"}, this page, {APP_VERSION}, and this browser. Models for this beta run on isolated cloud test hardware.</p>
            {note ? <p className="os-error">{note}</p> : null}
            <button className="os-btn" type="submit" disabled={busy || !text.trim()}>Send</button>
          </form>
        </div>
      ) : null}
    </>
  );
}
