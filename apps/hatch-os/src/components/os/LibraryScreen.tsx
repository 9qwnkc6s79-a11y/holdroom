"use client";

import { useCallback, useEffect, useState } from "react";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { OsShell } from "@/components/os/OsShell";
import type { HatchFile } from "@/lib/types";

interface LibraryPassage {
  id: string;
  title: string;
  source: string;
  at: string;
  text: string;
}

function roomName(id: string) {
  if (id === "hq-ops") return "Operations";
  if (id === "legal") return "Legal";
  if (id === "finance") return "Finance";
  if (id === "north-desk" || id === "little-elm") return "North desk";
  if (id === "south-desk" || id === "prosper") return "South desk";
  return id;
}

export function LibraryScreen() {
  const [files, setFiles] = useState<HatchFile[]>([]);
  const [passages, setPassages] = useState<LibraryPassage[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<{ name: string; meta: string; text: string } | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/library?department=enterprise&q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (!res.ok) {
        setFiles([]);
        setPassages([]);
        return;
      }
      const data = (await res.json()) as { files?: HatchFile[]; passages?: LibraryPassage[] };
      setFiles(data.files || []);
      setPassages(data.passages || []);
    } catch {
      setFiles([]);
      setPassages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load(query);
    }, query ? 150 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  const drafts = files.filter((file) => file.origin === "draft");
  const rooms = new Map<string, HatchFile[]>();
  for (const file of files) {
    const list = rooms.get(file.departmentId) || [];
    list.push(file);
    rooms.set(file.departmentId, list);
  }

  async function showFile(file: HatchFile) {
    const res = await fetch(`/api/files/${encodeURIComponent(file.id)}`, { cache: "no-store" });
    const data = (await res.json().catch(() => null)) as { text?: string } | null;
    setOpen({
      name: file.name,
      meta: `${roomName(file.departmentId)} · ${file.kind}`,
      text: data?.text || "No extracted text available.",
    });
  }

  return (
    <OsShell
      title="Library"
      lede="Search firm files, approved drafts, and synced docs or mail."
    >
      <div className="os-page">
        <div className="os-search-row">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search firm files and synced items…"
            aria-label="Search Library"
          />
        </div>
        {loading && !files.length && !passages.length ? <p>Loading Library…</p> : null}
        {passages.length ? (
          <section>
            <h2>Synced apps</h2>
            <div className="os-list">
              {passages.map((passage) => (
                <article key={passage.id} className="os-row">
                  <h3>{passage.title}</h3>
                  <p>{passage.source}</p>
                  <div className="os-meta">
                    <button
                      className="os-btn-ghost"
                      type="button"
                      onClick={() => setOpen({ name: passage.title, meta: passage.source, text: passage.text })}
                    >
                      Open
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        <h2>Finished work</h2>
        {drafts.length ? (
          <div className="os-list">
            {drafts.map((file) => (
              <article key={file.id} className="os-row">
                <h3>{file.name}</h3>
                <p>{roomName(file.departmentId)} · draft</p>
                <div className="os-meta">
                  <button className="os-btn-ghost" type="button" onClick={() => void showFile(file)}>
                    Open
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>{query ? "No matching drafts." : "No finished drafts yet. Approve a memo in chat and it will land here."}</p>
        )}
        <h2>File room</h2>
        {rooms.size ? (
          [...rooms.entries()].map(([id, list]) => (
            <section key={id}>
              <h3>{roomName(id)}</h3>
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
                      <button className="os-btn-ghost" type="button" onClick={() => void showFile(file)}>
                        Open
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))
        ) : (
          <p>{query ? "No matching files in the file room." : "No files in the file room yet."}</p>
        )}
        {open ? (
          <div className="os-dialog" role="presentation" onClick={() => setOpen(null)}>
            <article role="dialog" aria-label={open.name} onClick={(event) => event.stopPropagation()}>
              <h2>{open.name}</h2>
              <p className="os-note">{open.meta}</p>
              <div className="os-assistant">
                <MarkdownPreview text={open.text.slice(0, 8000)} />
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
