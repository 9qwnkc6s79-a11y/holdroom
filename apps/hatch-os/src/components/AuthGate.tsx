"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useHatch } from "./AppProvider";

const OPEN = new Set(["/signin", "/offline"]);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, session } = useHatch();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!session && !OPEN.has(pathname)) {
      router.replace("/signin");
    }
    if (session && pathname === "/signin") {
      router.replace("/chat");
    }
  }, [ready, session, pathname, router]);

  if (!ready) {
    return <p className="boot-note">Opening Hatch OS…</p>;
  }

  return <>{children}</>;
}
