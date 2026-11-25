"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useHatch } from "@/components/AppProvider";
import { AuditScreen } from "@/components/os/AuditScreen";
import { InitialAvatar } from "@/components/os/Avatar";
import { IconChevronLeft, IconChevronRight, IconX } from "@/components/os/Icons";
import { ConnectApps } from "@/components/os/ConnectApps";
import { ModelEthics } from "@/components/os/ModelEthics";
import { VaultScreen } from "@/components/os/VaultScreen";
import type { TokenBalanceView } from "@/lib/token-types";

const ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "UTC",
];

const RULES = [
  { name: "Write a draft", detail: "Saving a file into an agent’s file room waits for Approve." },
  { name: "Send a handoff", detail: "Notifying another desk waits for Approve." },
  { name: "Delete a file", detail: "Removing a file waits for Approve." },
  { name: "Use a vault item", detail: "An agent may name a vault item only after Approve. The secret stays hidden." },
];

const PAGES = ["home", "account", "usage", "plan", "vault", "connect", "ethics", "permissions", "zone", "hardware", "devices", "memory", "audit", "members", "appearance"] as const;
type Page = (typeof PAGES)[number];

function isPage(value: string | null): value is Page {
  return Boolean(value && (PAGES as readonly string[]).includes(value));
}

export function SettingsScreen({ onClose, initialPage = "home" }: { onClose?: () => void; initialPage?: Page }) {
  const router = useRouter();
  const params = useSearchParams();
  const { signOut, session } = useHatch();
  const requested = params.get("tab");
  const [page, setPage] = useState<Page>(isPage(requested) ? requested : initialPage);
  const [name, setName] = useState("Partner");
  const [email, setEmail] = useState("demo@this-preview");
  const [theme, setTheme] = useState("system");
  const [autoZone, setAutoZone] = useState(true);
  const [zone, setZone] = useState("America/Chicago");
  const [hardware, setHardware] = useState("Checking the firm model…");
  const [tokens, setTokens] = useState<TokenBalanceView | null>(null);
  const [tokenError, setTokenError] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const topupState = params.get("topup");

  useEffect(() => {
    setName(localStorage.getItem("hatch-account") || "Partner");
    setEmail(localStorage.getItem("hatch-email") || "demo@this-preview");
    const themeStored = localStorage.getItem("hatch-theme") || "light";
    setTheme(themeStored);
    applyTheme(themeStored);
    const auto = localStorage.getItem("hatch-tz-auto");
    const useAuto = auto !== "0";
    setAutoZone(useAuto);
    const savedZone = localStorage.getItem("hatch-tz");
    if (useAuto) {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      setZone(detected);
      localStorage.setItem("hatch-tz", detected);
    } else if (savedZone) setZone(savedZone);
    void fetch("/api/status", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { demoMode?: boolean; modelState?: string; label?: string }) => {
        if (data.demoMode) setHardware("Demo mode. The firm model is not called. Ask is Qwen and tools are Hermes when a RunPod key is set.");
        else if (data.modelState === "offline") setHardware("Offline. Hatch could not reach the firm model.");
        else setHardware(data.label || "The firm model responded.");
      })
      .catch(() => setHardware("Offline. Hatch could not reach the status check."));
  }, []);

  useEffect(() => {
    const code = session?.inviteCode;
    if (!code) return;
    let cancelled = false;
    void fetch("/api/tokens", { cache: "no-store", headers: { "x-hatch-tester": code } })
      .then((res) => res.json())
      .then((data: TokenBalanceView) => {
        if (!cancelled) setTokens(data);
      })
      .catch(() => {
        if (!cancelled) setTokenError("The token balance could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [session?.inviteCode, topupState]);

  function applyTheme(value: string) {
    const dark = value === "dark" || (value === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#09090B" : "#FFFFFF");
    localStorage.setItem("hatch-theme", value);
    setTheme(value);
  }

  function close() {
    if (onClose) onClose();
    else router.push("/chat");
  }

  function leave() {
    signOut();
    router.push("/signin");
  }

  return (
    <div className="set-sheet" role="dialog" aria-label="Settings">
      {page === "home" ? (
        <>
          <button type="button" className="round set-x" aria-label="Close settings" onClick={close}><IconX /></button>
          <section className="set-card">
            <button type="button" className="set-row" onClick={() => setPage("account")}>
              <InitialAvatar label={name} size={44} />
              <span className="set-main">
                <strong>{name}</strong>
                <span>{email}</span>
              </span>
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("usage")}>
              <span className="set-main"><strong>Usage</strong></span>
              <span className="set-value">{usageLabel(tokens)}</span>
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("plan")}>
              <span className="set-main"><strong>Plan</strong><span>Firm</span></span>
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("vault")}>
              <span className="set-main"><strong>Vault</strong><span>Logins, cards and keys your agents can use</span></span>
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </button>
          </section>
          <section className="set-card">
            <button type="button" className="set-row" onClick={() => setPage("connect")}>
              <span className="set-main"><strong>Connect apps</strong><span>Search connectors</span></span>
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("ethics")}>
              <span className="set-main"><strong>Model & Ethics</strong><span>Charter, voice, and which open model answers</span></span>
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </button>
          </section>
          <p className="set-label">Workspace</p>
          <section className="set-card">
            <button type="button" className="set-row" onClick={() => setPage("permissions")}>
              <span className="set-main"><strong>Permissions</strong><span>Approvals on · {RULES.length} rules</span></span>
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </button>
            <div className="set-row is-static">
              <span className="set-main">
                <strong>Set time zone automatically</strong>
                <span>Hatch follows this device’s time zone.</span>
              </span>
              <button
                type="button"
                className={`switch${autoZone ? " is-on" : ""}`}
                role="switch"
                aria-checked={autoZone}
                onClick={() => {
                  const next = !autoZone;
                  setAutoZone(next);
                  localStorage.setItem("hatch-tz-auto", next ? "1" : "0");
                  if (next) {
                    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
                    setZone(detected);
                    localStorage.setItem("hatch-tz", detected);
                  }
                }}
              >
                <span />
              </button>
            </div>
            <button type="button" className="set-row" onClick={() => setPage("zone")}>
              <span className="set-main"><strong>Time zone</strong></span>
              <span className="set-value">{zone.replace(/_/g, " ")}</span>
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("hardware")}>
              <span className="set-main"><strong>Hatch hardware</strong></span>
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("devices")}>
              <span className="set-main"><strong>Manage your devices</strong></span>
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("memory")}>
              <span className="set-main"><strong>Import memory</strong></span>
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("audit")}>
              <span className="set-main"><strong>Audit log</strong></span>
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("members")}>
              <span className="set-main"><strong>Members</strong></span>
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("appearance")}>
              <span className="set-main"><strong>Appearance</strong></span>
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </button>
          </section>
          <section className="set-card">
            <button type="button" className="set-row" onClick={() => window.dispatchEvent(new Event("hatch-feedback"))}>
              <span className="set-main"><strong>Send feedback</strong><span>A note, and a screenshot if you have one</span></span>
              <span className="chev" aria-hidden="true"><IconChevronRight /></span>
            </button>
          </section>
          <button type="button" className="set-signout" onClick={leave}>Sign out</button>
        </>
      ) : (
        <Subpage title={titleFor(page)} onBack={() => setPage("home")}>
          {page === "account" ? (
            <section className="set-card">
              <label className="set-field">Name
                <input value={name} onChange={(event) => { setName(event.target.value); localStorage.setItem("hatch-account", event.target.value); }} />
              </label>
              <label className="set-field">Email
                <input value={email} onChange={(event) => { setEmail(event.target.value); localStorage.setItem("hatch-email", event.target.value); }} />
              </label>
              <p className="fine">This is the demo profile on this preview, not a verified mailbox.</p>
            </section>
          ) : null}
          {page === "usage" ? (
            <TokenUsagePanel
              tokens={tokens}
              error={tokenError}
              topupState={topupState}
              busy={checkoutBusy}
              onAdd={async () => {
                const code = session?.inviteCode;
                if (!code || checkoutBusy) return;
                setCheckoutBusy(true);
                setTokenError("");
                try {
                  const res = await fetch("/api/tokens/checkout", {
                    method: "POST",
                    headers: { "content-type": "application/json", "x-hatch-tester": code },
                    body: JSON.stringify({ code }),
                  });
                  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
                  if (!res.ok || !data?.url) {
                    setTokenError(data?.error || "Token top-ups are not set up yet.");
                    return;
                  }
                  window.location.assign(data.url);
                } catch {
                  setTokenError("Stripe checkout could not be opened.");
                } finally {
                  setCheckoutBusy(false);
                }
              }}
            />
          ) : null}
          {page === "plan" ? (
            <section className="set-card">
              <div className="set-row is-static"><span className="set-main"><strong>Firm</strong><span>Dedicated hardware, on the firm’s network. This preview is the interface only.</span></span></div>
            </section>
          ) : null}
          {page === "vault" ? <VaultScreen embedded /> : null}
          {page === "connect" ? <ConnectApps scope={session?.inviteCode || "staff"} /> : null}
          {page === "ethics" ? <ModelEthics scope={session?.inviteCode || "staff"} /> : null}
          {page === "permissions" ? (
            <section className="set-card">
              {RULES.map((rule) => (
                <div key={rule.name} className="set-row is-static">
                  <span className="set-main"><strong>{rule.name}</strong><span>{rule.detail}</span></span>
                </div>
              ))}
            </section>
          ) : null}
          {page === "zone" ? (
            <section className="set-card">
              {ZONES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="set-row"
                  onClick={() => {
                    setAutoZone(false);
                    setZone(item);
                    localStorage.setItem("hatch-tz-auto", "0");
                    localStorage.setItem("hatch-tz", item);
                    setPage("home");
                  }}
                >
                  <span className="set-main"><strong>{item.replace(/_/g, " ")}</strong></span>
                  {zone === item ? <span className="set-value">Current</span> : null}
                </button>
              ))}
            </section>
          ) : null}
          {page === "hardware" ? (
            <section className="set-card">
              <div className="set-row is-static"><span className="set-main"><strong>Model endpoints</strong><span>{hardware}</span></span></div>
              <p className="fine">Ask is Qwen on diqb3ykkxo0i16. Tools are Hermes on gy5a9f9lpjz2y7. Both scale to zero.</p>
            </section>
          ) : null}
          {page === "devices" ? (
            <section className="set-card">
              <div className="set-row is-static">
                <span className="set-main"><strong>{session?.deviceName || "This device"}</strong><span>This session · {session?.role || "Signed in"}</span></span>
              </div>
              <button type="button" className="set-row" onClick={leave}>
                <span className="set-main"><strong>Revoke this device</strong><span>Signs out this browser.</span></span>
              </button>
            </section>
          ) : null}
          {page === "memory" ? (
            <section className="set-card">
              <p className="set-note">Import is not connected. Agent memory stays in each chat on this system.</p>
            </section>
          ) : null}
          {page === "audit" ? <AuditScreen embedded /> : null}
          {page === "members" ? (
            <section className="set-card">
              <p className="set-note">Member admin is not editable in this version. Seats stay with the firm.</p>
            </section>
          ) : null}
          {page === "appearance" ? (
            <section className="set-card">
              {["light", "dark", "system"].map((item) => (
                <button key={item} type="button" className="set-row" onClick={() => applyTheme(item)}>
                  <span className="set-main"><strong>{item[0].toUpperCase() + item.slice(1)}</strong></span>
                  {theme === item ? <span className="set-value">On</span> : null}
                </button>
              ))}
            </section>
          ) : null}
        </Subpage>
      )}
    </div>
  );
}

function Subpage({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div>
      <header className="set-sub">
        <button type="button" className="round" aria-label="Back" onClick={onBack}><IconChevronLeft /></button>
        <h1>{title}</h1>
      </header>
      {children}
    </div>
  );
}

function titleFor(page: Page) {
  const titles: Record<Page, string> = {
    home: "Settings",
    account: "Account",
    usage: "Usage",
    plan: "Plan",
    vault: "Vault",
    connect: "Connect apps",
    ethics: "Model & Ethics",
    permissions: "Permissions",
    zone: "Time zone",
    hardware: "Hatch hardware",
    devices: "Devices",
    memory: "Import memory",
    audit: "Audit log",
    members: "Members",
    appearance: "Appearance",
  };
  return titles[page];
}

function usageLabel(tokens: TokenBalanceView | null) {
  if (!tokens) return "…";
  if (tokens.unlimited) return "Unlimited";
  if (!tokens.metered) return "Not metered";
  return `${tokens.balance.toLocaleString()} tokens`;
}

function TokenUsagePanel({
  tokens,
  error,
  topupState,
  busy,
  onAdd,
}: {
  tokens: TokenBalanceView | null;
  error: string;
  topupState: string | null;
  busy: boolean;
  onAdd: () => void;
}) {
  const canBuy = Boolean(tokens && tokens.metered && !tokens.unlimited);
  return (
    <section className="set-card">
      {topupState === "success" ? <p className="set-note">Payment received. Your balance updates once Stripe confirms the payment.</p> : null}
      {topupState === "cancel" ? <p className="set-note">The checkout was cancelled. No tokens were added.</p> : null}
      <div className="set-row is-static">
        <span className="set-main">
          <strong>{usageLabel(tokens)}</strong>
          <span>
            {tokens?.unlimited
              ? "This sign-in is not metered."
              : tokens
                ? `Used ${tokens.lifetimeUsed.toLocaleString()} tokens on Ask and Agent replies.`
                : "Loading the token balance…"}
          </span>
        </span>
      </div>
      {tokens?.message ? <p className="set-note">{tokens.message}</p> : null}
      {error ? <p className="os-error">{error}</p> : null}
      {canBuy ? (
        <div className="set-row is-static" style={{ display: "block", paddingTop: 8, paddingBottom: 16 }}>
          <button type="button" className="os-btn" disabled={busy || !tokens?.checkoutReady} onClick={onAdd}>
            {busy ? "Opening checkout…" : tokens?.topupTokens ? `Add ${tokens.topupTokens.toLocaleString()} tokens` : "Add tokens"}
          </button>
          {!tokens?.checkoutReady ? (
            <p className="fine" style={{ marginTop: 8 }}>Payments are not set up yet. Stripe test mode and a pack size need to be configured.</p>
          ) : (
            <p className="fine" style={{ marginTop: 8 }}>Checkout opens a Stripe test-mode page. No live charges run until test keys are replaced.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
