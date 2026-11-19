"use client";

import { useEffect, useState } from "react";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { OsShell } from "@/components/os/OsShell";
import type { Department, HatchFile } from "@/lib/types";

function roomName(id: string) {
  if (id === "hq-ops") return "Operations";
  if (id === "legal") return "Legal";
  if (id === "finance") return "Finance";
  if (id === "little-elm") return "Little Elm";
  if (id === "prosper") return "Prosper";
  return id;
}

export function LibraryScreen() {
  const [files, setFiles] = useState<HatchFile[]>([]);
  const [open, setOpen] = useState<{ name: string; text: string } | null>(null);

  useEffect(() => {
    void fetch("/api/departments", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { departments?: Department[] }) => {
        const all = (data.departments || []).flatMap((dept) => dept.files || []);
        setFiles(all);
      })
      .catch(() => setFiles([]));
  }, []);

  const drafts = files.filter((file) => file.origin === "draft");
  const rooms = new Map<string, HatchFile[]>();
  for (const file of files) {
    const list = rooms.get(file.departmentId) || [];
    list.push(file);
    rooms.set(file.departmentId, list);
  }

  async function show(file: HatchFile) {
    const res = await fetch(`/api/files/${encodeURIComponent(file.id)}`, { cache: "no-store" });
    const data = (await res.json().catch(() => null)) as { text?: string };
    setOpen({ name: file.name, text: data?.text || "No extract." });
  }

  return (
    <OsShell
      title="Library"
      lede="Files in the firm’s file room, and drafts the agents have filed after you approved them."
    >
      <div className="os-page">
        <h2>Finished work</h2>
        {drafts.length ? (
          <div className="os-list">
            {drafts.map((file) => (
              <article key={file.id} className="os-row">
                <h3>{file.name}</h3>
                <p>{roomName(file.departmentId)} · draft</p>
                <div className="os-meta">
                  <button className="os-btn-ghost" type="button" onClick={() => void show(file)}>
                    Open
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>No finished drafts yet. Approve a memo in chat and it will land here.</p>
        )}
        <h2>File room</h2>
        {[...rooms.entries()].map(([id, list]) => (
          <section key={id}>
            <h2>{roomName(id)}</h2>
            <div className="os-list">
              {list.map((file) => (
                <article key={file.id} className="os-row">
                  <h3>{file.name}</h3>
                  <p>
                    {file.kind}
                    {file.inLibrary ? " · in the library" : ""}
                    {file.demo ? " · sample" : ""}
                  </p>
                  <div className="os-meta">
                    <button className="os-btn-ghost" type="button" onClick={() => void show(file)}>
                      Open
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
        {open ? (
          <div className="os-dialog" role="presentation" onClick={() => setOpen(null)}>
            <article role="dialog" aria-label={open.name} onClick={(event) => event.stopPropagation()}>
              <h2>{open.name}</h2>
              <div className="os-assistant">
                <MarkdownPreview text={open.text.slice(0, 4000)} />
              </div>
              <button className="os-btn" type="button" onClick={() => setOpen(null)}>
                Close
              </button>
            </article>
          </div>
        ) : null}
      </div>
    </OsShell>
  );
}
