"use client";

import { useEffect, useState } from "react";
import { ETHICS_PRESETS, defaultEthics, type EthicsPreset, type EthicsProfile } from "@/lib/ethics-profile";

export function ModelEthics({ scope, agentId }: { scope: string; agentId?: string }) {
  const [profile, setProfile] = useState<EthicsProfile>(defaultEthics());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const key = agentId ? `hatch-ethics-${agentId}` : "hatch-ethics";
    const cached = localStorage.getItem(key);
    if (cached) {
      try { setProfile(JSON.parse(cached) as EthicsProfile); } catch { /* ignore a bad cache */ }
    }
    const url = agentId ? `/api/ethics?agentId=${encodeURIComponent(agentId)}` : "/api/ethics";
    void fetch(url, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { profile?: EthicsProfile }) => {
        if (data.profile) setProfile(data.profile);
      })
      .catch(() => setError("Could not load Model & Ethics."));
  }, [scope, agentId]);

  function patch(next: Partial<EthicsProfile>) {
    setProfile((current) => ({ ...current, ...next }));
  }

  function applyPreset(preset: Exclude<EthicsPreset, "custom">) {
    const starter = ETHICS_PRESETS[preset];
    patch({ preset, charter: starter.charter, redLines: starter.redLines, posture: starter.posture, tone: starter.tone });
  }

  async function save(reset = false) {
    setError("");
    setNote("");
    const res = await fetch("/api/ethics", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reset ? { scope, agentId, reset: true } : { scope, agentId, profile }),
    });
    const data = (await res.json().catch(() => null)) as { profile?: EthicsProfile; error?: string } | null;
    if (!res.ok || !data?.profile) {
      setError("Could not save Model & Ethics.");
      return;
    }
    setProfile(data.profile);
    const key = agentId ? `hatch-ethics-${agentId}` : "hatch-ethics";
    localStorage.setItem(key, JSON.stringify(data.profile));
    setNote(reset ? "Restored defaults." : "Saved.");
  }

  return (
    <div className="ethics">
      {agentId ? (
        <label className="check">
          <input type="checkbox" checked={profile.inherit} onChange={(event) => patch({ inherit: event.target.checked })} />
          Use the workspace Model & Ethics
        </label>
      ) : (
        <p className="set-note">This beta runs open-weight models on isolated test GPUs (and firm deployments run on your own Hatch box), so the firm sets its own principles, guardrails, and voice instead of an outside AI lab.</p>
      )}
      {error ? <p className="os-error" role="alert">{error}</p> : null}
      {note ? <p className="set-note" role="status">{note}</p> : null}
      {!agentId || !profile.inherit ? (
        <>
          <p className="set-label">Ethics & worldview</p>
          <div className="segmented" role="group" aria-label="Charter presets">
            {(["neutral", "executive", "compliance", "custom"] as const).map((item) => (
              <button key={item} type="button" className={profile.preset === item ? "is-on" : ""} onClick={() => item === "custom" ? patch({ preset: "custom" }) : applyPreset(item)}>
                {item === "neutral" ? "Neutral Fiduciary" : item === "executive" ? "Direct Executive" : item === "compliance" ? "Strict Compliance" : "Values-Aligned / Custom"}
              </button>
            ))}
          </div>
          <label className="set-field">Firm charter
            <textarea aria-label="Firm charter" value={profile.charter} onChange={(event) => patch({ preset: "custom", charter: event.target.value })} />
          </label>
          <label className="set-field">Firm red lines
            <textarea aria-label="Firm red lines" value={profile.redLines} onChange={(event) => patch({ redLines: event.target.value })} />
          </label>
          <p className="set-label">Refusal & guardrail posture</p>
          <div className="segmented" role="group" aria-label="Refusal posture">
            {(["strict", "balanced", "direct"] as const).map((item) => (
              <button key={item} type="button" className={profile.posture === item ? "is-on" : ""} onClick={() => patch({ posture: item })}>
                {item === "strict" ? "Strict" : item === "balanced" ? "Balanced" : "Direct Analyst"}
              </button>
            ))}
          </div>
          <p className="set-label">Communication & voice</p>
          <div className="segmented" role="group" aria-label="Tone">
            {(["concise", "warm", "blunt", "formal"] as const).map((item) => (
              <button key={item} type="button" className={profile.tone === item ? "is-on" : ""} onClick={() => patch({ tone: item })}>
                {item === "concise" ? "Concise Executive" : item === "warm" ? "Warm Partner" : item === "blunt" ? "Blunt Analyst" : "Formal Memo"}
              </button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="Response length">
            {(["short", "balanced", "detailed"] as const).map((item) => (
              <button key={item} type="button" className={profile.length === item ? "is-on" : ""} onClick={() => patch({ length: item })}>
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={profile.leadWithAnswer} onChange={(event) => patch({ leadWithAnswer: event.target.checked })} />
            Lead with the answer
          </label>
          <label className="set-field">House style rules
            <textarea aria-label="House style rules" value={profile.styleRules} onChange={(event) => patch({ styleRules: event.target.value })} />
          </label>
          <p className="set-label">Model & inference</p>
          <div className="segmented" role="group" aria-label="Default model">
            <button type="button" className={profile.model === "hermes" ? "is-on" : ""} onClick={() => patch({ model: "hermes" })}>Hermes 4.3 36B</button>
            <button type="button" className={profile.model === "qwen" ? "is-on" : ""} onClick={() => patch({ model: "qwen" })}>Qwen 3.8 27B</button>
          </div>
          <p className="fine">{profile.model === "qwen" ? "Plain drafting uses Qwen. Turns that need tools still run on Hermes." : "Agent turns, including tools, run on Hermes."}</p>
          <label className="set-field">Temperature {profile.temperature.toFixed(1)}
            <input
              aria-label="Temperature"
              type="range"
              min={0}
              max={0.9}
              step={0.1}
              value={profile.temperature}
              style={{ ["--range" as string]: `${Math.round((profile.temperature / 0.9) * 100)}%` }}
              onChange={(event) => patch({ temperature: Number(event.target.value) })}
            />
          </label>
          <p className="fine">Private weight tuning (LoRA / post-training) is available on Firm and Enterprise hardware. This test build does not train weights.</p>
        </>
      ) : null}
      <div className="row-actions">
        <button type="button" className="os-btn" onClick={() => void save(false)}>Save</button>
        <button type="button" className="ghost" onClick={() => void save(true)}>Reset defaults</button>
      </div>
    </div>
  );
}
