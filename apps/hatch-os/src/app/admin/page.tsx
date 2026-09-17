"use client";

import { useHatch, seatLine } from "@/components/AppProvider";
import { Shell } from "@/components/Shell";
import { FUND_A, FUND_B } from "@/lib/mock-data";
import type { RoomId } from "@/lib/types";

export default function AdminPage() {
  const {
    seats,
    toast,
    generatedInvite,
    emptySeatsDemo,
    setEmptySeatsDemo,
    mintInvite,
    revokeSeat,
    grantRooms,
    createRoom,
    startBackup,
    importUpdate,
  } = useHatch();

  if (emptySeatsDemo) {
    return (
      <Shell>
        <div className="panel">
          <p className="screen-kicker">Admin</p>
          <h1>No seats issued.</h1>
          <p className="lede">
            Create an invite for the first partner. Hatch does not keep an always-on admin account
            and does not take a copy of the corpus.
          </p>
          {generatedInvite ? (
            <div className="card invite-card">
              <p className="screen-kicker">Invite ready</p>
              <p className="invite-code">{generatedInvite}</p>
              <p className="muted" style={{ margin: 0 }}>
                Share this code in person. The partner pairs on this box — it is not emailed from
                outside the firm.
              </p>
            </div>
          ) : null}
          <div className="btn-row">
            <button className="btn btn-dark" type="button" onClick={mintInvite}>
              {generatedInvite ? "Generate another invite" : "Generate invite"}
            </button>
            <button className="btn btn-outline" type="button" onClick={() => setEmptySeatsDemo(false)}>
              Show issued seats
            </button>
          </div>
          {toast ? (
            <div className="banner banner-ok" style={{ marginTop: 14 }}>
              <p>{toast}</p>
            </div>
          ) : null}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="panel">
        <p className="screen-kicker">Admin</p>
        <h1>Seats and the box.</h1>
        <p className="lede">
          Invite, revoke, room grants. Support works from Status plus a synthetic repro — not from
          a copy of client files.
        </p>
        <div className="stat-pills">
          <span className="pill pill-ink">
            {seats.filter((s) => !s.pending).length} of {seatLine.cap} seats
          </span>
          <span className="pill pill-mute">{seatLine.label}</span>
        </div>
        {seats.map((seat) => (
          <div className="card" key={seat.id}>
            <div className="file-row">
              <div>
                <div className="file-name">{seat.name}</div>
                <p className="fine">
                  {seat.role} · {seat.rooms.length ? seat.rooms.map((id) => (id === FUND_A ? "Fund A" : id === FUND_B ? "Fund B" : id)).join(" · ") : "—"}
                </p>
              </div>
              <span className={`pill ${seat.pending ? "pill-warn" : "pill-ok"}`}>
                {seat.pending ? "Invite" : "Active"}
              </span>
              <p className="fine" style={{ gridColumn: "1 / -1" }}>
                {seat.device}
              </p>
              <div className="grant-row" style={{ gridColumn: "1 / -1" }}>
                <label>
                  <input
                    type="checkbox"
                    checked={seat.rooms.includes(FUND_A)}
                    onChange={(e) => {
                      const next: RoomId[] = e.target.checked
                        ? [...seat.rooms, FUND_A]
                        : seat.rooms.filter((r) => r !== FUND_A);
                      grantRooms(seat.id, next);
                    }}
                  />
                  Fund A
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={seat.rooms.includes(FUND_B)}
                    onChange={(e) => {
                      const next: RoomId[] = e.target.checked
                        ? [...seat.rooms, FUND_B]
                        : seat.rooms.filter((r) => r !== FUND_B);
                      grantRooms(seat.id, next);
                    }}
                  />
                  Fund B
                </label>
                <button className="linkish" type="button" onClick={() => revokeSeat(seat.id)}>
                  Revoke
                </button>
              </div>
            </div>
          </div>
        ))}
        <div className="btn-row">
          <button className="btn btn-dark" type="button" onClick={mintInvite}>
            Create invite
          </button>
          <button className="btn btn-outline" type="button" onClick={createRoom}>
            Create empty room
          </button>
          <button className="linkish" type="button" onClick={() => setEmptySeatsDemo(true)}>
            Show empty seats
          </button>
        </div>
        {toast ? (
          <div className="banner banner-ok" style={{ marginTop: 14 }}>
            <p>{toast}</p>
          </div>
        ) : null}
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Backup</h2>
          <p className="muted">
            Last success 14 Sep 2026 · 22:10. Restore drill is a placeholder. No backup recorded
            means do not put real files on this box.
          </p>
          <div className="btn-row">
            <button className="btn btn-ghost" type="button" onClick={startBackup}>
              Start backup
            </button>
          </div>
        </div>
        <div className="card" style={{ marginTop: 10 }}>
          <h2>Updates</h2>
          <p className="muted">
            Import a signed offline bundle → inactive slot → health → cutover / rollback. No
            always-on Hatch remote admin.
          </p>
          <div className="btn-row">
            <button className="btn btn-ghost" type="button" onClick={importUpdate}>
              Import bundle (placeholder)
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
