"use client";

import { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import type { BoxStatus, EgressResult } from "@/lib/types";

function egressClass(value: EgressResult, checked: boolean) {
  if (!checked || value == null) return "egress-warn";
  if (value === "FAIL=blocked") return "egress-ok";
  return "egress-bad";
}

function egressMeaning(value: EgressResult, checked: boolean) {
  if (!checked || value == null) return "Not checked";
  if (value === "FAIL=blocked") return "FAIL=blocked";
  return "PASS=reachable";
}

export default function StatusPage() {
  const [status, setStatus] = useState<BoxStatus | null>(null);
  const [mode, setMode] = useState<"live" | "pass" | "unknown">("live");
  const [error, setError] = useState("");

  const load = useCallback(async (next: "live" | "pass" | "unknown") => {
    setMode(next);
    setError("");
    const qs = next === "live" ? "" : `?egress=${next}`;
    try {
      const res = await fetch(`/api/status${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error("status");
      setStatus((await res.json()) as BoxStatus);
    } catch {
      setError("Egress not checked — run the proof before anyone treats this as live.");
    }
  }, []);

  useEffect(() => {
    void load("live");
  }, [load]);

  const check = status?.egress_check;
  const checked = check?.status === "checked";
  const passIsError =
    check?.openai === "PASS=reachable" || check?.anthropic === "PASS=reachable";

  return (
    <Shell>
      <div className="panel">
        <p className="screen-kicker">Status</p>
        <h1>This box.</h1>
        <p className="lede">
          Software dry-run — appliance not connected. Ask uses a temporary OpenAI-compatible
          endpoint, then local Ollama if that is down. Egress FAIL=blocked is the good production
          outcome. PASS=reachable is an error.
        </p>
        {error ? (
          <div className="banner banner-warn" role="alert">
            <p>{error}</p>
          </div>
        ) : null}
        {!checked && status ? (
          <div className="banner banner-warn" role="alert">
            <p>Egress not checked — run the proof before anyone treats this as live.</p>
          </div>
        ) : null}
        {passIsError ? (
          <div className="banner banner-bad" role="alert">
            <p>
              PASS=reachable means OpenAI or Anthropic can be reached. That is a production error —
              lock egress before anyone treats this as live.
            </p>
          </div>
        ) : null}
        {status?.dryRun ? (
          <div className="banner banner-warn" role="status">
            <p>Software dry-run — appliance not connected</p>
          </div>
        ) : null}
        <div className="card">
          <div className="status-row">
            <span>Inference</span>
            <b>{status?.llm?.label || (status?.llm?.kind === "ollama" ? "Ollama (local)" : "OpenAI-compatible")}</b>
          </div>
          <div className="status-row">
            <span>Configured model</span>
            <b>{status?.llm?.model || "qwen3:8b"}</b>
          </div>
          <div className="status-row">
            <span>Endpoint</span>
            <b>
              {status?.llm?.host || "…"}
              {status?.llm?.kind ? ` · ${status.llm.kind}` : ""}
              {status?.llm?.fallback ? " · local fallback" : ""}
            </b>
          </div>
          <div className="status-row">
            <span>Reachable</span>
            <b className={status?.llm?.reachable ? "egress-ok" : "egress-bad"}>
              {status?.llm
                ? status.llm.reachable
                  ? "reachable"
                  : `not reachable${status.llm.error ? ` · ${status.llm.error}` : ""}`
                : "…"}
            </b>
          </div>
          <div className="status-row">
            <span>Ask ready</span>
            <b className={status?.llm?.connected ? "egress-ok" : "egress-bad"}>
              {status?.llm?.connected
                ? `${status.llm.model}${status.llm.fallback ? " (fallback)" : ""}`
                : status?.llm?.error || "not ready"}
            </b>
          </div>
          <div className="status-row">
            <span>API key</span>
            <b>{status?.llm?.hasKey ? "set" : "not set"}</b>
          </div>
          <div className="status-row">
            <span>Health</span>
            <b className={status?.ok ? "egress-ok" : "egress-bad"}>{status?.ok ? "ok" : "not ok"}</b>
          </div>
          <div className="status-row">
            <span>Image</span>
            <b>{status?.version || "…"}</b>
          </div>
          <div className="status-row">
            <span>Model loaded</span>
            <b>{status?.model || "local instruct (box)"}</b>
          </div>
          <div className="status-row">
            <span>Disk free</span>
            <b>{status?.disk_free || "—"}</b>
          </div>
          <div className="status-row">
            <span>Last backup</span>
            <b>{status?.last_backup || "No backup recorded — do not put real files on this box."}</b>
          </div>
          <div className="status-row">
            <span>Last egress check</span>
            <b>{status?.last_egress_check || "never"}</b>
          </div>
          <div className="status-row">
            <span>Status source</span>
            <b>{status?.source === "adapter" ? "dry-run :8090" : "mock (adapter optional)"}</b>
          </div>
        </div>
        <div className="card" style={{ marginTop: 10 }}>
          <h2>Egress</h2>
          <p className="fine" style={{ marginBottom: 8 }}>
            Green means the public APIs were blocked. PASS=reachable is not a green light.
          </p>
          <div className="status-row">
            <span>OpenAI</span>
            <span className={egressClass(check?.openai ?? null, Boolean(checked))}>
              {egressMeaning(check?.openai ?? null, Boolean(checked))}
            </span>
          </div>
          <div className="status-row">
            <span>Anthropic</span>
            <span className={egressClass(check?.anthropic ?? null, Boolean(checked))}>
              {egressMeaning(check?.anthropic ?? null, Boolean(checked))}
            </span>
          </div>
        </div>
        <div className="btn-row">
          <button
            className={`btn ${mode === "live" ? "btn-dark" : "btn-ghost"}`}
            type="button"
            onClick={() => void load("live")}
          >
            Live / mock
          </button>
          <button
            className={`btn ${mode === "pass" ? "btn-dark" : "btn-ghost"}`}
            type="button"
            onClick={() => void load("pass")}
          >
            Demo PASS=reachable
          </button>
          <button
            className={`btn ${mode === "unknown" ? "btn-dark" : "btn-ghost"}`}
            type="button"
            onClick={() => void load("unknown")}
          >
            Demo unchecked
          </button>
        </div>
        {!status?.llm?.reachable || !status?.llm?.connected ? (
          <div className="card howto" style={{ marginTop: 10 }}>
            <h2>Connect a model</h2>
            <ol>
              <li>
                RunPod A100 FP8: <code>https://api.runpod.ai/v2/diqb3ykkxo0i16/openai/v1</code>,{" "}
                <code>Qwen/Qwen3.8-27B-FP8</code>, <code>HATCH_LLM_API_KEY</code>
              </li>
              <li>
                Local fallback: <code>ollama serve</code> then{" "}
                <code>ollama pull qwen3:8b</code>
              </li>
              <li>
                Restart: <code>cd apps/hatch-os && npm run dev</code>
              </li>
            </ol>
          </div>
        ) : null}
        <p className="fine" style={{ marginTop: 14 }}>
          This page does not prove model quality, RAG correctness, or that a real corpus is
          absent. Operators keep files synthetic until accept.
        </p>
      </div>
    </Shell>
  );
}
