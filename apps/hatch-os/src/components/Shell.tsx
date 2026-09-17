"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChatIcon, FilesIcon, LibraryIcon, MoreIcon } from "./Icons";
import { useHatch } from "./AppProvider";

const DESKTOP = [
  { href: "/chat", label: "Chat" },
  { href: "/files", label: "Files" },
  { href: "/library", label: "Library" },
  { href: "/status", label: "Status", sep: true },
  { href: "/admin", label: "Admin" },
  { href: "/settings", label: "Settings" },
];

const PHONE = [
  { href: "/chat", label: "Chat", icon: <ChatIcon />, routes: ["/chat", "/ask", "/sources"] },
  { href: "/files", label: "Files", icon: <FilesIcon />, routes: ["/files"] },
  { href: "/library", label: "Library", icon: <LibraryIcon />, routes: ["/library"] },
  { href: "/more", label: "More", icon: <MoreIcon />, routes: ["/more", "/status", "/admin", "/settings", "/departments"] },
];

function BrandMark({ large }: { large?: boolean }) {
  return (
    <Link className="brand" href="/chat">
      <Image
        className={`brand-logo${large ? " is-large" : ""}`}
        src="/brand/boundaries-logo.svg"
        alt="Boundaries Coffee"
        width={180}
        height={36}
        unoptimized
        priority
      />
    </Link>
  );
}

export function Shell({
  children,
  stageClass,
}: {
  children: React.ReactNode;
  stageClass?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentWorkspace, visibleWorkspaces, setWorkspace, isEnterpriseView } = useHatch();
  const [llmOk, setLlmOk] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: { llm?: { reachable?: boolean; connected?: boolean } }) =>
        setLlmOk(Boolean(s.llm?.reachable)),
      )
      .catch(() => setLlmOk(false));
  }, [pathname]);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="app-shell">
      <div className="dry-banner" role="status">
        Software dry-run — appliance not connected
      </div>
      <aside className="desktop-nav" aria-label="Boundaries Coffee">
        <BrandMark large />
        {DESKTOP.map((item) => (
          <span key={item.href}>
            {item.sep ? <div className="nav-sep" /> : null}
            <Link
              className="nav-link"
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          </span>
        ))}
        <p className="rail-foot">Powered by Hatch OS</p>
      </aside>
      <header className="topbar">
        <BrandMark />
        <div className="topbar-meta">
          <div className="workspace-switch" ref={menuRef}>
            <button
              className={`room-chip${isEnterpriseView ? " is-enterprise" : ""}`}
              type="button"
              title="Switch workspace"
              aria-haspopup="listbox"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {currentWorkspace.name}
            </button>
            {open ? (
              <div className="workspace-menu" role="listbox" aria-label="Enterprise and departments">
                <p className="workspace-kicker">Enterprise</p>
                {visibleWorkspaces
                  .filter((w) => w.kind === "enterprise")
                  .map((space) => (
                    <button
                      key={space.id}
                      type="button"
                      className={`workspace-item${space.id === currentWorkspace.id ? " is-on" : ""}`}
                      onClick={() => {
                        setWorkspace(space.id);
                        setOpen(false);
                        if (pathname === "/departments") router.push("/chat");
                      }}
                    >
                      {space.name}
                      <span className="fine">Firm-wide view</span>
                    </button>
                  ))}
                <p className="workspace-kicker">Departments</p>
                {visibleWorkspaces
                  .filter((w) => w.kind !== "enterprise")
                  .map((space) => (
                    <button
                      key={space.id}
                      type="button"
                      className={`workspace-item${space.id === currentWorkspace.id ? " is-on" : ""}`}
                      onClick={() => {
                        setWorkspace(space.id);
                        setOpen(false);
                        if (pathname === "/departments") router.push("/chat");
                      }}
                    >
                      {space.name}
                      <span className="fine">{space.files.length} files</span>
                    </button>
                  ))}
                <Link className="workspace-more" href="/departments" onClick={() => setOpen(false)}>
                  All workspaces
                </Link>
              </div>
            ) : null}
          </div>
          <Link
            className={`health-dot${llmOk === false ? " is-bad" : ""}`}
            href="/status"
            title={llmOk === false ? "Local LLM disconnected" : "Box health"}
            aria-label="Box health"
          />
        </div>
      </header>
      <main id="stage" className={`stage${stageClass ? ` ${stageClass}` : ""}`}>
        {children}
      </main>
      <nav className="tabbar" aria-label="Phone">
        {PHONE.map((item) => {
          const on = item.routes.includes(pathname);
          return (
            <Link
              key={item.href}
              className={`tab${on ? " is-active" : ""}`}
              href={item.href}
              aria-current={on ? "page" : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
