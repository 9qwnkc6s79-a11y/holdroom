"use client";

import { DragEvent, FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHatch } from "@/components/AppProvider";
import { Shell } from "@/components/Shell";
import { ACCEPT_ATTR, ingestStatusLabel } from "@/lib/files";
import { HQ_OPS, LITTLE_ELM, PROSPER, isEnterprise, workspaceLabel } from "@/lib/departments";
import type { IngestStatus } from "@/lib/types";

function pillFor(status: IngestStatus) {
  if (status === "ready" || status === "indexed") return "pill-ok";
  if (status === "failed") return "pill-bad";
  if (status === "extracting" || status === "queued") return "pill-warn";
  return "pill-mute";
}

export default function FilesPage() {
  const {
    currentWorkspace,
    currentWorkspaceId,
    isEnterpriseView,
    currentFiles,
    folders,
    session,
    ingest,
    deleteFile,
    setInLibrary,
    importDrive,
    createFolder,
    openArtifact,
    toast,
  } = useHatch();
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [activeFolder, setActiveFolder] = useState<string | "all">("all");
  const [writeDept, setWriteDept] = useState(LITTLE_ELM);

  const deptFolders = useMemo(
    () =>
      isEnterpriseView
        ? folders
        : folders.filter((f) => f.departmentId === currentWorkspaceId),
    [folders, isEnterpriseView, currentWorkspaceId],
  );

  const shown = useMemo(() => {
    if (activeFolder === "all") return currentFiles;
    return currentFiles.filter((f) => f.folderId === activeFolder);
  }, [currentFiles, activeFolder]);

  function takeFile(file?: File | null) {
    if (file) {
      ingest(file, {
        toLibrary: false,
        folderId: activeFolder === "all" ? null : activeFolder,
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
        <p className="screen-kicker">Files · {currentWorkspace.name}</p>
        <h1>{isEnterpriseView ? "Firm files." : `${currentWorkspace.name} file room.`}</h1>
        <p className="lede">
          Shared drive for this workspace. Upload and Drive import land in Files. Add to Library
          when Ask should cite them. Writes follow your department membership
          {session ? ` (${session.departments.map(workspaceLabel).join(", ") || "none"})` : ""}.
        </p>
        <div className="folder-tree">
          <button
            type="button"
            className={`folder-item${activeFolder === "all" ? " is-on" : ""}`}
            onClick={() => setActiveFolder("all")}
          >
            All files
            <span className="fine">{currentFiles.length}</span>
          </button>
          {deptFolders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className={`folder-item${activeFolder === folder.id ? " is-on" : ""}`}
              onClick={() => setActiveFolder(folder.id)}
            >
              {isEnterprise(currentWorkspaceId) ? `${workspaceLabel(folder.departmentId)} / ` : ""}
              {folder.name}
              <span className="fine">
                {currentFiles.filter((f) => f.folderId === folder.id).length}
              </span>
            </button>
          ))}
        </div>
        {isEnterpriseView ? (
          <label htmlFor="write-dept">
            Upload into department
            <select id="write-dept" value={writeDept} onChange={(e) => setWriteDept(e.target.value)}>
              {(session?.departments || [LITTLE_ELM, PROSPER, HQ_OPS]).map((id) => (
                <option key={id} value={id}>
                  {workspaceLabel(id)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label
          className={`drop${over ? " is-over" : ""}`}
          htmlFor="file-input"
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
          <strong>Drop a PDF, Office file, markdown, or image</strong>
          <span className="fine">
            Stays in {isEnterpriseView ? workspaceLabel(writeDept) : currentWorkspace.name} Files —
            not Library until you add it
          </span>
        </label>
        <input
          className="hidden-file"
          id="file-input"
          type="file"
          accept={ACCEPT_ATTR}
          onChange={(e) => {
            takeFile(e.currentTarget.files?.[0]);
            e.currentTarget.value = "";
          }}
        />
        <div className="btn-row">
          <button className="btn btn-outline" type="button" onClick={() => setDriveOpen(true)}>
            Import from Google Drive
          </button>
        </div>
        <form
          className="folder-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!folderName.trim() || isEnterpriseView) return;
            createFolder(folderName.trim());
            setFolderName("");
          }}
        >
          <input
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="New folder name"
            disabled={isEnterpriseView}
          />
          <button className="btn btn-ghost" type="submit" disabled={isEnterpriseView}>
            Add folder
          </button>
        </form>
        {isEnterpriseView ? (
          <p className="fine">Create folders inside a department, not in the Enterprise view.</p>
        ) : null}
        <div style={{ marginTop: 14 }}>
          {!shown.length ? (
            <div className="card">
              <h2>Nothing in this folder.</h2>
              <p className="muted" style={{ margin: 0 }}>
                Upload a file or import the Drive stub. Files stay on the firm’s box.
              </p>
            </div>
          ) : (
            shown.map((file) => (
              <div className="card" key={file.id}>
                <div className="file-row">
                  <div>
                    <div className="file-name">{file.name}</div>
                    <p className="fine">
                      {file.kind} · {workspaceLabel(file.departmentId)}
                      {file.folderPath ? ` · ${file.folderPath}` : ""}
                      {file.demo ? " · DEMO" : ""}
                      {file.origin === "drive" ? " · Drive stub" : ""}
                      {file.origin === "draft" ? " · Draft" : ""}
                      {file.inLibrary ? " · In Library" : " · Files only"}
                    </p>
                  </div>
                  <span className={`pill ${pillFor(file.status)}`}>
                    {ingestStatusLabel(file.status, file.kind)}
                  </span>
                  {file.status === "queued" || file.status === "extracting" ? (
                    <div className="progress">
                      <span style={{ width: `${file.progress || 20}%` }} />
                    </div>
                  ) : null}
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
                    <button className="linkish" type="button" onClick={() => setInLibrary(file.id, !file.inLibrary)}>
                      {file.inLibrary ? "Remove from Library" : "Add to Library"}
                    </button>
                    <button className="linkish" type="button" onClick={() => deleteFile(file.id)}>
                      Delete
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
      {driveOpen ? (
        <div className="modal-back" role="dialog" aria-labelledby="drive-title">
          <div className="card modal-card">
            <p className="screen-kicker">Google Drive</p>
            <h2 id="drive-title">Connect stub</h2>
            <p className="muted">
              OAuth is not wired. Import the sample Boundaries Drive folder into this department’s
              Files, then Add to Library if Ask should cite them.
            </p>
            <div className="btn-row">
              <button
                className="btn btn-dark"
                type="button"
                onClick={() => {
                  void importDrive(isEnterpriseView ? writeDept : currentWorkspaceId);
                  setDriveOpen(false);
                }}
              >
                Import sample folder
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setDriveOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
