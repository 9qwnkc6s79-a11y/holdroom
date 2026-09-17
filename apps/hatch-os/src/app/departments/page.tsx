"use client";

import { useRouter } from "next/navigation";
import { useHatch } from "@/components/AppProvider";
import { Shell } from "@/components/Shell";
import { workspaceLabel } from "@/lib/departments";

export default function DepartmentsPage() {
  const {
    visibleWorkspaces,
    currentWorkspaceId,
    currentWorkspace,
    threads,
    inboundHandoffs,
    emptyDepartmentsDemo,
    setEmptyDepartmentsDemo,
    setWorkspace,
  } = useHatch();
  const router = useRouter();

  if (emptyDepartmentsDemo) {
    return (
      <Shell>
        <div className="panel">
          <p className="screen-kicker">Departments</p>
          <h1>No departments.</h1>
          <p className="lede">
            Admin grants Little Elm, Prosper, HQ Ops, and Enterprise. Users land in their home
            department. Ask is still firm-capable.
          </p>
          <button className="btn btn-outline" type="button" onClick={() => setEmptyDepartmentsDemo(false)}>
            Show dogfood workspaces
          </button>
        </div>
      </Shell>
    );
  }

  const enterprise = visibleWorkspaces.filter((w) => w.kind === "enterprise");
  const departments = visibleWorkspaces.filter((w) => w.kind !== "enterprise");

  return (
    <Shell>
      <div className="panel">
        <p className="screen-kicker">Workspaces</p>
        <h1>Enterprise and departments.</h1>
        <p className="lede">
          Most people live in a department (Little Elm, Prosper, HQ Ops). Enterprise is the
          firm-wide layer for executives (and anyone admin grants). UX spaces do not leak; Ask may
          still use firm-wide knowledge.
        </p>
        {enterprise.length ? (
          <>
            <p className="screen-kicker">Enterprise</p>
            <div className="room-list" style={{ marginBottom: 18 }}>
              {enterprise.map((space) => {
                const current = space.id === currentWorkspaceId;
                return (
                  <button
                    key={space.id}
                    className={`room-card${current ? " is-current" : ""}`}
                    type="button"
                    onClick={() => {
                      setWorkspace(space.id);
                      router.push("/chat");
                    }}
                  >
                    <span className="room-name">{space.name}</span>
                    <span className={`pill ${current ? "pill-ink" : "pill-mute"}`}>
                      {current ? "Current" : "Enter"}
                    </span>
                    <p className="fine">
                      Firm-wide Files and Library. Chat threads here are executive workspace, not an
                      LLM firewall.
                    </p>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <p className="fine" style={{ marginBottom: 16 }}>
            Enterprise is not granted on this seat.
          </p>
        )}
        <p className="screen-kicker">Departments</p>
        <div className="room-list">
          {departments.map((space) => {
            const empty = !space.files.length && !threads.some((t) => t.departmentId === space.id && !t.archived);
            const current = space.id === currentWorkspaceId;
            return (
              <button
                key={space.id}
                className={`room-card${current ? " is-current" : ""}`}
                type="button"
                onClick={() => {
                  setWorkspace(space.id);
                  router.push("/chat");
                }}
              >
                <span className="room-name">{space.name}</span>
                <span className={`pill ${current ? "pill-ink" : "pill-mute"}`}>
                  {current ? "Current" : "Enter"}
                </span>
                <p className="fine">
                  {empty
                    ? "No files and no threads yet."
                    : `${space.files.length} files · ${threads.filter((t) => t.departmentId === space.id && !t.archived).length} threads`}
                </p>
              </button>
            );
          })}
        </div>
        {inboundHandoffs.length ? (
          <div className="card" style={{ marginTop: 16 }}>
            <h2>Handoffs</h2>
            {inboundHandoffs.map((h) => (
              <p className="fine" key={h.id}>
                {workspaceLabel(h.fromDepartmentId)} → {workspaceLabel(h.toDepartmentId)}: {h.summary}
                {h.facts ? ` — ${h.facts}` : ""} · {h.status}
              </p>
            ))}
          </div>
        ) : null}
        <p className="fine" style={{ marginTop: 16 }}>
          {currentWorkspace.isolation}{" "}
          <button className="linkish" type="button" onClick={() => setEmptyDepartmentsDemo(true)}>
            Show empty departments
          </button>
        </p>
      </div>
    </Shell>
  );
}
