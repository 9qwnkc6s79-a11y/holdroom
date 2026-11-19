"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useHatch } from "@/components/AppProvider";
import { AGENTS } from "@/lib/agents";
import type { ChatThread } from "@/lib/types";

const NAV = [
  { href: "/library", label: "Library" },
  { href: "/routines", label: "Routines" },
  { href: "/vault", label: "Vault" },
  { href: "/audit", label: "Audit" },
];

export function OsShell({
  children,
  title,
  lede,
}: {
  children: React.ReactNode;
  title: string;
  lede?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const { signOut, session } = useHatch();
  const agentId = params.get("agent") || "general";
  const threadId = params.get("thread");
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [modelState, setModelState] = useState<"demo" | "offline" | "ready" | "">("");

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const [threadRes, statusRes] = await Promise.all([
          fetch("/api/threads", { cache: "no-store" }),
          fetch("/api/status", { cache: "no-store" }),
        ]);
        if (stop) return;
        if (threadRes.ok) {
          const data = (await threadRes.json()) as { threads?: ChatThread[] };
          setThreads(data.threads || []);
        }
        if (statusRes.ok) {
          const status = (await statusRes.json()) as { modelState?: "demo" | "offline" | "ready"; demoMode?: boolean };
          setModelState(status.demoMode ? "demo" : status.modelState || "");
        }
      } catch {
        if (!stop) setModelState("offline");
      }
    }
    void load();
    function onRefresh() {
      void load();
    }
    window.addEventListener("hatch-refresh", onRefresh);
    return () => {
      stop = true;
      window.removeEventListener("hatch-refresh", onRefresh);
    };
  }, [pathname]);

  const agentThreads = threads.filter((thread) => thread.agentId === agentId && !thread.archived).slice(0, 12);
  const pill =
    modelState === "demo" ? "Demo mode" : modelState === "offline" ? "Model offline" : modelState === "ready" ? "Model ready" : "";

  function goAgent(id: string) {
    setOpen(false);
    router.push(`/chat?agent=${id}`);
  }

  return (
    <div className="os">
      {open ? <button className="os-scrim" type="button" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <aside className={`os-side${open ? " is-open" : ""}`} aria-label="Agents">
        <Link className="os-brand" href="/chat?agent=general" onClick={() => setOpen(false)}>
          <strong>Hatch</strong>
          <span>OS</span>
        </Link>
        <p className="os-kicker">Agents</p>
        <div className="os-agents">
          {AGENTS.map((agent) => (
            <button
              key={agent.id}
              type="button"
              className={`os-agent${agent.id === agentId && pathname === "/chat" ? " is-on" : ""}`}
              onClick={() => goAgent(agent.id)}
            >
              <span className="os-agent-name">{agent.name}</span>
              <span className="os-agent-desc">{agent.description}</span>
            </button>
          ))}
        </div>
        <button className="os-add" type="button" onClick={() => setAddOpen(true)}>
          + Add agent
        </button>
        <p className="os-kicker">Chats</p>
        <button className="os-add" type="button" onClick={() => { setOpen(false); router.push(`/chat?agent=${agentId}`); }}>
          New chat
        </button>
        <ul className="os-threads">
          {agentThreads.length ? (
            agentThreads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  className={thread.id === threadId ? "is-on" : ""}
                  onClick={() => {
                    setOpen(false);
                    router.push(`/chat?agent=${agentId}&thread=${thread.id}`);
                  }}
                >
                  {thread.title}
                </button>
              </li>
            ))
          ) : (
            <li className="os-side-note">No chats with this agent yet.</li>
          )}
        </ul>
        <nav className="os-nav" aria-label="Hatch">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? "is-on" : ""}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <button
            className="os-signout"
            type="button"
            onClick={() => {
              signOut();
              router.push("/signin");
            }}
          >
            Sign out{session ? ` · ${session.role}` : ""}
          </button>
        </nav>
        <p className="os-side-note">Private to this firm.</p>
      </aside>
      <div className="os-main">
        <header className="os-top">
          <div>
            <button className="os-menu" type="button" onClick={() => setOpen(true)}>
              Agents
            </button>
            <h1>{title}</h1>
            {lede ? <p>{lede}</p> : null}
          </div>
          {pill ? (
            <span className={`os-pill${modelState === "offline" ? " is-bad" : ""}${modelState === "demo" ? " is-demo" : ""}`}>
              {pill}
            </span>
          ) : null}
        </header>
        <div className="os-stage" id="stage">{children}</div>
      </div>
      <nav className="os-tabs" aria-label="Phone">
        <Link href={`/chat?agent=${agentId}`} className={pathname === "/chat" ? "is-on" : ""}>
          Chat
        </Link>
        <Link href="/library" className={pathname === "/library" ? "is-on" : ""}>
          Library
        </Link>
        <Link href="/vault" className={pathname === "/vault" ? "is-on" : ""}>
          Vault
        </Link>
        <Link href="/audit" className={pathname === "/audit" ? "is-on" : ""}>
          Audit
        </Link>
      </nav>
      {addOpen ? (
        <div className="os-dialog" role="presentation" onClick={() => setAddOpen(false)}>
          <article role="dialog" aria-labelledby="add-agent-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="add-agent-title">Add an agent</h2>
            <p>
              New agents are stood up with a department when Hatch installs the firm. This button does not create one
              in this version.
            </p>
            <button className="os-btn" type="button" onClick={() => setAddOpen(false)}>
              Close
            </button>
          </article>
        </div>
      ) : null}
    </div>
  );
}
