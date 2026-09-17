"use client";

import { DragEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useHatch } from "@/components/AppProvider";
import { Shell } from "@/components/Shell";
import { ACCEPT_ATTR, ingestStatusLabel } from "@/lib/files";
import { HQ_OPS, LITTLE_ELM, workspaceLabel } from "@/lib/departments";
import type { IngestStatus } from "@/lib/types";

function pillFor(status: IngestStatus) {
  if (status === "ready" || status === "indexed") return "pill-ok";
  if (status === "failed") return "pill-bad";
  if (status === "extracting" || status === "queued") return "pill-warn";
  return "pill-mute";
}

export default function LibraryPage() {
  const {
    currentWorkspace,
    currentWorkspaceId,
    isEnterpriseView,
    currentLibrary,
    currentFiles,
    session,
    ingest,
    deleteFile,
    setInLibrary,
    openArtifact,
    toast,
  } = useHatch();
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [writeDept, setWriteDept] = useState(LITTLE_ELM);
  const notInLibrary = currentFiles.filter((f) => !f.inLibrary);

  function takeFile(file?: File | null) {
    if (file) {
      ingest(file, {
        toLibrary: true,
        departmentId: isEnterpriseView ? writeDept : currentWorkspaceId,
      });
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setOver(false);
    takeFile(event.dataTransfer.files?.[0]);
  }

  return (
    <Shell>
      <div className="panel">
        <p className="screen-kicker">Library · {currentWorkspace.name}</p>
        <h1>{isEnterpriseView ? "Firm library." : `Ask corpus for ${currentWorkspace.name}.`}</h1>
        <p className="lede">
          What Ask can cite. Distinct from Files (the shared drive). Promote a file with Add to
          Library. Retrieval is firm-capable even when you are sitting in one department.
        </p>
        {isEnterpriseView ? (
          <label htmlFor="lib-dept">
            Upload into department
            <select id="lib-dept" value={writeDept} onChange={(e) => setWriteDept(e.target.value)}>
              {(session?.departments || [LITTLE_ELM, HQ_OPS]).map((id) => (
                <option key={id} value={id}>
                  {workspaceLabel(id)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label
          className={`drop${over ? " is-over" : ""}`}
          htmlFor="lib-file-input"
          onDragEnter={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setOver(false);
          }}
          onDrop={onDrop}
        >
          <strong>Drop a file to ingest into Library</strong>
          <span className="fine">Also lands in Files · PDF, Office, markdown, images</span>
        </label>
        <input
          className="hidden-file"
          id="lib-file-input"
          type="file"
          accept={ACCEPT_ATTR}
          onChange={(e) => {
            takeFile(e.currentTarget.files?.[0]);
            e.currentTarget.value = "";
          }}
        />
        {notInLibrary.length ? (
          <div className="card" style={{ marginTop: 14 }}>
            <h2>In Files, not Library</h2>
            <p className="fine">Promote when you want Ask to cite these.</p>
            {notInLibrary.map((file) => (
              <div className="file-row" key={file.id} style={{ marginTop: 10 }}>
                <div>
                  <div className="file-name">{file.name}</div>
                  <p className="fine">
                    {workspaceLabel(file.departmentId)}
                    {file.origin === "drive" ? " · Drive stub" : ""}
                    {file.origin === "draft" ? " · Draft" : ""}
                  </p>
                </div>
                <div className="grant-row">
                  <button
                    className="linkish"
                    type="button"
                    onClick={() => {
                      openArtifact(file.id);
                      router.push("/chat");
                    }}
                  >
                    Open in panel
                  </button>
                  <button className="btn btn-outline btn-tiny" type="button" onClick={() => setInLibrary(file.id, true)}>
                    Add to Library
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ marginTop: 14 }}>
          {!currentLibrary.length ? (
            <div className="card">
              <h2>Nothing indexed in this view.</h2>
              <p className="muted" style={{ margin: 0 }}>
                Upload here or add a file from Files. DEMO seed files are labeled DEMO.
              </p>
            </div>
          ) : (
            currentLibrary.map((file) => (
              <div className="card" key={file.id}>
                <div className="file-row">
                  <div>
                    <div className="file-name">{file.name}</div>
                    <p className="fine">
                      {file.kind} · {workspaceLabel(file.departmentId)}
                      {file.folderPath ? ` · ${file.folderPath}` : ""}
                      {file.demo ? " · DEMO" : ""}
                    </p>
                  </div>
                  <span className={`pill ${pillFor(file.status)}`}>
                    {ingestStatusLabel(file.status, file.kind)}
                  </span>
                  {file.error ? (
                    <p className="fine" style={{ gridColumn: "1 / -1", color: "var(--bad)" }}>
                      {file.error}
                    </p>
                  ) : null}
                  <div className="grant-row" style={{ gridColumn: "1 / -1" }}>
                    <button
                      className="linkish"
                      type="button"
                      onClick={() => {
                        openArtifact(file.id);
                        router.push("/chat");
                      }}
                    >
                      Open in panel
                    </button>
                    <button className="linkish" type="button" onClick={() => setInLibrary(file.id, false)}>
                      Remove from Library
                    </button>
                    <button className="linkish" type="button" onClick={() => deleteFile(file.id)}>
                      Delete file and chunks
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
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
