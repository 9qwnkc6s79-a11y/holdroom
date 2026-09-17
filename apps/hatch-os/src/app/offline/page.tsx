"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useHatch } from "@/components/AppProvider";

export default function OfflinePage() {
  const { session } = useHatch();
  const router = useRouter();

  return (
    <div className="gate">
      <div className="gate-inner">
        <p className="brand">
          <Image className="brand-logo is-large" src="/brand/boundaries-logo.svg" alt="Boundaries Coffee" width={200} height={40} unoptimized priority />
        </p>
        <h1>Can’t reach Hatch.</h1>
        <p className="lede">
          Join the office network or the firm VPN, then retry. This phone does not keep a local
          copy of the library.
        </p>
        <div className="btn-row">
          <button
            className="btn btn-dark"
            type="button"
            onClick={() => router.push(session ? "/chat" : "/signin")}
          >
            Retry
          </button>
        </div>
        <p className="fine" style={{ marginTop: 18 }}>
          Hatch OS does not fall back to a public lab when the box is unreachable.
        </p>
      </div>
    </div>
  );
}
