"use client";

import Link from "next/link";
import { Shell } from "@/components/Shell";

export default function MorePage() {
  return (
    <Shell>
      <div className="panel">
        <p className="screen-kicker">More</p>
        <h1>Box and account.</h1>
        <div className="more-list">
          <Link href="/status">Status</Link>
          <Link href="/admin">Admin</Link>
          <Link href="/settings">Settings</Link>
          <Link href="/departments">Enterprise / Departments</Link>
          <Link href="/offline">Can’t reach Hatch (demo)</Link>
        </div>
      </div>
    </Shell>
  );
}
