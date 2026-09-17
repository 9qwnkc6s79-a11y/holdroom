"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function Shell({
  children,
  stageClass,
}: {
  children: React.ReactNode;
  stageClass?: string;
}) {
  const pathname = usePathname();
  const { currentRoom } = useHatch();

  return (
    <div className="app-shell">
      <aside className="desktop-nav" aria-label="Hatch OS">
        <Link className="brand" href="/ask">
          Hatch<span className="dot">.</span>
        </Link>
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
        <p className="rail-foot">
          Same box as the office. Phase 1 beta.
        </p>
      </aside>
      <header className="topbar">
        <Link className="brand" href="/ask">
          Hatch<span className="dot">.</span>
        </Link>
        <div className="topbar-meta">
          <Link className="room-chip" href="/rooms" title="Current room">
            {currentRoom.name}
          </Link>
          <Link className="health-dot" href="/status" title="Box health" aria-label="Box health" />
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
