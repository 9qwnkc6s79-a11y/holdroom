"use client";

import { DragEvent, useState } from "react";
import { useHatch } from "@/components/AppProvider";
import { Shell } from "@/components/Shell";
import { ACCEPT_ATTR, ingestStatusLabel } from "@/lib/files";
import type { IngestStatus } from "@/lib/types";

function pillFor(status: IngestStatus) {
  if (status === "ready" || status === "indexed") return "pill-ok";
  if (status === "failed") return "pill-bad";
  if (status === "extracting" || status === "queued") return "pill-warn";
  return "pill-mute";
}

export default function LibraryPage() {
  const { currentRoom, ingest, deleteFile } = useHatch();
  const [over, setOver] = useState(false);
  const files = currentRoom.files;

  function takeFile(file?: File | null) {
    if (file) ingest(file.name);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setOver(false);
    takeFile(event.dataTransfer.files?.[0]);
  }

  return (
    <Shell>
      <div className="panel">
        <p className="screen-kicker">Library</p>
        <h1>Files in {currentRoom.name}.</h1>
        <p className="lede">
          Add to this room only. PDF, Office, markdown, and images (PNG, JPEG, WebP, GIF). Extract,
          chunk, and embed stay on the box. Image OCR is stubbed in this beta. This is not
          training, and the phone does not sync the corpus.
        </p>
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
          <span className="fine">Click to choose · stays in {currentRoom.name}</span>
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
        <div style={{ marginTop: 14 }}>
          {!files.length ? (
            <div className="card">
              <h2>Nothing indexed in {currentRoom.name}.</h2>
              <p className="muted" style={{ margin: 0 }}>
                Drop a PDF or image into this room. Files stay on the firm’s box. Hatch support
                does not receive a copy.
              </p>
            </div>
          ) : (
            files.map((file) => (
              <div className="card" key={file.id}>
                <div className="file-row">
                  <div>
                    <div className="file-name">{file.name}</div>
                    <p className="fine">
                      {file.kind} · {currentRoom.name}
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
                  <button
                    className="linkish"
                    type="button"
                    style={{ gridColumn: "1 / -1", justifySelf: "start" }}
                    onClick={() => deleteFile(file.id)}
                  >
                    Delete file and chunks
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Shell>
  );
}
