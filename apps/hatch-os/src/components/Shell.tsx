"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AskIcon, LibraryIcon, MoreIcon, RoomsIcon } from "./Icons";
import { useHatch } from "./AppProvider";

const DESKTOP = [
  { href: "/ask", label: "Ask" },
  { href: "/rooms", label: "Rooms" },
  { href: "/library", label: "Library" },
  { href: "/status", label: "Status", sep: true },
  { href: "/admin", label: "Admin" },
  { href: "/settings", label: "Settings" },
];

const PHONE = [
  { href: "/ask", label: "Ask", icon: <AskIcon />, routes: ["/ask", "/sources"] },
  { href: "/rooms", label: "Rooms", icon: <RoomsIcon />, routes: ["/rooms"] },
  { href: "/library", label: "Library", icon: <LibraryIcon />, routes: ["/library"] },
  { href: "/more", label: "More", icon: <MoreIcon />, routes: ["/more", "/status", "/admin", "/settings"] },
];

function BrandMark({ large }: { large?: boolean }) {
  return (
    <Link className="brand" href="/ask">
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
  const { currentRoom } = useHatch();
  const [llmOk, setLlmOk] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: { llm?: { reachable?: boolean; connected?: boolean } }) =>
        setLlmOk(Boolean(s.llm?.reachable)),
      )
      .catch(() => setLlmOk(false));
  }, [pathname]);

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
          <Link className="room-chip" href="/rooms" title="Current room">
            {currentRoom.name}
          </Link>
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
