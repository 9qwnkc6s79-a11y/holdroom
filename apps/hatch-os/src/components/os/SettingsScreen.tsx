"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuditScreen } from "@/components/os/AuditScreen";
import { InitialAvatar } from "@/components/os/Avatar";
import { VaultScreen } from "@/components/os/VaultScreen";

const TABS = ["general", "vault", "connections", "usage", "audit", "members"] as const;
type Tab = (typeof TABS)[number];

export function SettingsScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = TABS.includes(params.get("tab") as Tab) ? (params.get("tab") as Tab) : "general";
  const [tab, setTab] = useState<Tab>(initial);
  const [name, setName] = useState("Partner");
  const [theme, setTheme] = useState("system");
  const [language, setLanguage] = useState("English");
  const [zone, setZone] = useState("America/New_York");
  const [notes, setNotes] = useState(true);

  useEffect(() => {
    setName(localStorage.getItem("hatch-account") || "Partner");
    setTheme(localStorage.getItem("hatch-theme") || "system");
    const stored = localStorage.getItem("hatch-theme") || "system";
    applyTheme(stored);
  }, []);

  function applyTheme(value: string) {
    const dark = value === "dark" || (value === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("hatch-theme", value);
    setTheme(value);
  }

  function saveName(value: string) {
    setName(value);
    localStorage.setItem("hatch-account", value);
  }

  return (
    <div className="settings">
      <header className="settings-top">
        <button type="button" className="round" aria-label="Back" onClick={() => router.push("/chat")}>‹</button>
        <h1>Settings</h1>
      </header>
      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "is-on" : ""} onClick={() => setTab(item)}>
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      {tab === "general" ? (
        <div className="os-page">
          <div className="account-row">
            <InitialAvatar label={name} size={56} />
            <label>Account<input value={name} onChange={(event) => saveName(event.target.value)} /></label>
          </div>
          <label>Theme
            <select value={theme} onChange={(event) => applyTheme(event.target.value)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </label>
          <label>Language
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option>English</option>
            </select>
          </label>
          <label>Timezone
            <select value={zone} onChange={(event) => setZone(event.target.value)}>
              <option>America/New_York</option>
              <option>America/Chicago</option>
              <option>America/Denver</option>
              <option>America/Los_Angeles</option>
              <option>Europe/London</option>
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={notes} onChange={(event) => setNotes(event.target.checked)} /> Notifications</label>
        </div>
      ) : null}
      {tab === "vault" ? <VaultScreen embedded /> : null}
      {tab === "connections" ? (
        <div className="os-page">
          <article className="os-row"><h3>File room</h3><p>Connected. Files stay on this Hatch system.</p></article>
          <article className="os-row"><h3>Google Drive</h3><p>Not connected. OAuth is a stub.</p></article>
          <article className="os-row"><h3>Mail</h3><p>Not connected.</p></article>
        </div>
      ) : null}
      {tab === "usage" ? (
        <div className="os-page">
          <article className="os-row"><h3>Model</h3><p>Demo mode answers on this system. Live Ask uses Qwen. Live tools use Hermes. Both scale to zero on RunPod.</p></article>
        </div>
      ) : null}
      {tab === "audit" ? <AuditScreen embedded /> : null}
      {tab === "members" ? (
        <div className="os-page">
          <article className="os-row"><h3>Members</h3><p>Seats and invites stay with the firm admin. This list is not editable in v1.</p></article>
        </div>
      ) : null}
    </div>
  );
}
