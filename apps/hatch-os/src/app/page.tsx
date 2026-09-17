"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useHatch } from "@/components/AppProvider";

export default function HomePage() {
  const { ready, session } = useHatch();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    router.replace(session ? "/ask" : "/signin");
  }, [ready, session, router]);

  return <p className="boot-note">Opening Hatch OS…</p>;
}
