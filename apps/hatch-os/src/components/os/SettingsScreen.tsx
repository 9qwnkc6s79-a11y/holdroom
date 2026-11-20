"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useHatch } from "@/components/AppProvider";
import { AuditScreen } from "@/components/os/AuditScreen";
import { InitialAvatar } from "@/components/os/Avatar";
import { VaultScreen } from "@/components/os/VaultScreen";

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

const PAGES = ["home", "account", "usage", "plan", "vault", "connect", "permissions", "zone", "hardware", "devices", "memory", "audit", "members", "appearance"] as const;
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

  useEffect(() => {
    setName(localStorage.getItem("hatch-account") || "Partner");
    setEmail(localStorage.getItem("hatch-email") || "demo@this-preview");
    const themeStored = localStorage.getItem("hatch-theme") || "system";
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

  function applyTheme(value: string) {
    const dark = value === "dark" || (value === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
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
          <button type="button" className="round set-x" aria-label="Close settings" onClick={close}>×</button>
          <section className="set-card">
            <button type="button" className="set-row" onClick={() => setPage("account")}>
              <InitialAvatar label={name} size={44} />
              <span className="set-main">
                <strong>{name}</strong>
                <span>{email}</span>
              </span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("usage")}>
              <span className="set-main"><strong>Usage</strong></span>
              <span className="set-value">Demo</span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("plan")}>
              <span className="set-main"><strong>Plan</strong><span>Firm</span></span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("vault")}>
              <span className="set-main"><strong>Vault</strong><span>Logins, cards and keys your agents can use</span></span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
          </section>
          <section className="set-card">
            <button type="button" className="set-row" onClick={() => setPage("connect")}>
              <span className="set-main"><strong>Connect apps</strong><span>Search connectors</span></span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
          </section>
          <p className="set-label">Workspace</p>
          <section className="set-card">
            <button type="button" className="set-row" onClick={() => setPage("permissions")}>
              <span className="set-main"><strong>Permissions</strong><span>Approvals on · {RULES.length} rules</span></span>
              <span className="chev" aria-hidden="true">›</span>
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
              <span className="chev" aria-hidden="true">›</span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("hardware")}>
              <span className="set-main"><strong>Hatch hardware</strong></span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("devices")}>
              <span className="set-main"><strong>Manage your devices</strong></span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("memory")}>
              <span className="set-main"><strong>Import memory</strong></span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("audit")}>
              <span className="set-main"><strong>Audit log</strong></span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("members")}>
              <span className="set-main"><strong>Members</strong></span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
            <button type="button" className="set-row" onClick={() => setPage("appearance")}>
              <span className="set-main"><strong>Appearance</strong></span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
          </section>
          <section className="set-card">
            <button type="button" className="set-row" onClick={() => window.dispatchEvent(new Event("hatch-feedback"))}>
              <span className="set-main"><strong>Send feedback</strong><span>A note, and a screenshot if you have one</span></span>
              <span className="chev" aria-hidden="true">›</span>
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
            <section className="set-card">
              <p className="set-note">Demo values. This preview does not measure the firm’s compute.</p>
              {["Hatch", "Operations", "Legal", "Finance"].map((agent) => (
                <div key={agent} className="set-row is-static">
                  <span className="set-main"><strong>{agent}</strong><span>Not measured · demo</span></span>
                </div>
              ))}
            </section>
          ) : null}
          {page === "plan" ? (
            <section className="set-card">
              <div className="set-row is-static"><span className="set-main"><strong>Firm</strong><span>Dedicated hardware, on the firm’s network. This preview is the interface only.</span></span></div>
            </section>
          ) : null}
          {page === "vault" ? <VaultScreen embedded /> : null}
          {page === "connect" ? (
            <section className="set-card">
              {[
                ["File room", "Connected on this Hatch system"],
                ["Google Drive", "Not connected"],
                ["Microsoft 365", "Not connected"],
                ["Slack", "Not connected"],
              ].map(([title, state]) => (
                <div key={title} className="set-row is-static">
                  <span className="set-main"><strong>{title}</strong><span>{state}</span></span>
                </div>
              ))}
            </section>
          ) : null}
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
        <button type="button" className="round" aria-label="Back" onClick={onBack}>‹</button>
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
