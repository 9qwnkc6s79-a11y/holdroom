"use client";

import { useRouter } from "next/navigation";
import { useHatch } from "@/components/AppProvider";
import { Shell } from "@/components/Shell";

export default function SettingsPage() {
  const { session, devices, toast, signOut, resetTotp } = useHatch();
  const router = useRouter();

  return (
    <Shell>
      <div className="panel">
        <p className="screen-kicker">Settings</p>
        <h1>This device.</h1>
        <p className="lede">
          Sign out, reset TOTP, and how to reach the same box from the road. Hatch does not host
          the tunnel.
        </p>
        {devices.map((device) => (
          <div className="card device" key={device.id}>
            <div>
              <strong>{device.current ? session?.deviceName || device.name : device.name}</strong>
              <p className="fine">
                {device.current ? "Paired · session pointer only" : device.lastSeen}
              </p>
            </div>
            <span className={`pill ${device.current ? "pill-ok" : "pill-mute"}`}>
              {device.current ? "On box" : "This box"}
            </span>
          </div>
        ))}
        <div className="card howto" style={{ marginTop: 10 }}>
          <h2>Remote how-to</h2>
          <p className="muted" style={{ margin: "0 0 8px" }}>
            Firm-owned path. Hatch does not host the tunnel and does not run the model off this
            box. Never log into a Hatch cloud.
          </p>
          <ol>
            <li>
              Connect this phone or laptop to the firm’s WireGuard, Tailscale-class mesh, or
              existing client VPN first.
            </li>
            <li>
              Then open the same Hatch OS URL your IT set (for example{" "}
              <code>https://ai.firm.local</code>).
            </li>
            <li>
              If the tunnel is down, you will see “can’t reach the room.” There is no on-device
              model.
            </li>
          </ol>
          <p className="fine" style={{ marginTop: 12 }}>
            Remote is not configured. Your IT owns the tunnel. Until it exists, use the box on the
            office LAN only.
          </p>
        </div>
        <div className="card" style={{ marginTop: 10 }}>
          <h2>Add to Home Screen</h2>
          <p className="muted" style={{ margin: 0 }}>
            iPhone: Share → Add to Home Screen. Android: browser menu → Install app. Same origin as
            the desktop UI. No store listing in Phase 1.
          </p>
        </div>
        <div className="btn-row">
          <button className="btn btn-outline" type="button" onClick={() => router.push("/offline")}>
            Demo: can’t reach the room
          </button>
          <button className="btn btn-ghost" type="button" onClick={resetTotp}>
            Reset TOTP (stub)
          </button>
          <button
            className="btn btn-dark"
            type="button"
            onClick={() => {
              signOut();
              router.push("/signin");
            }}
          >
            Sign out
          </button>
        </div>
        {toast ? (
          <div className="banner banner-ok" style={{ marginTop: 14 }}>
            <p>{toast}</p>
          </div>
        ) : null}
        <p className="fine" style={{ marginTop: 24 }}>
          Powered by Hatch OS
        </p>
      </div>
    </Shell>
  );
}
