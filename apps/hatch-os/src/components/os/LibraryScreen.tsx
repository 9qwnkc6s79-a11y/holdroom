"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { IconChevronLeft, IconX } from "@/components/os/Icons";
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
  const router = useRouter();
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
  const roomFiles = files.filter((file) => file.origin !== "draft");

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
    <main className="lib-shell">
      <header className="lib-head">
        <button type="button" className="round" aria-label="Back to chat" onClick={() => router.push("/chat")}>
          <IconChevronLeft />
        </button>
        <h1>Library</h1>
      </header>
      <div className="lib-search">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search firm files, drafts, and synced docs or mail…"
          aria-label="Search Library"
        />
      </div>
      {loading && !files.length && !passages.length ? <p className="lib-empty">Loading Library…</p> : null}

      {passages.length ? (
        <section>
          <p className="lib-kicker">Synced apps ({passages.length})</p>
          <div className="lib-card">
            {passages.map((passage) => (
              <button
                key={passage.id}
                type="button"
                className="lib-row"
                onClick={() => setOpen({ name: passage.title, meta: passage.source, text: passage.text })}
              >
                <div>
                  <strong>{passage.title}</strong>
                  <span>{passage.source}</span>
                </div>
                <span>Open</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <p className="lib-kicker">Finished work</p>
        {drafts.length ? (
          <div className="lib-card">
            {drafts.map((file) => (
              <button key={file.id} type="button" className="lib-row" onClick={() => void showFile(file)}>
                <div>
                  <strong>{file.name}</strong>
                  <span>{roomName(file.departmentId)} · draft</span>
                </div>
                <span>Open</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="lib-empty">{query ? "No matching drafts." : "No finished drafts yet. Approve a memo in chat and it will land here."}</p>
        )}
      </section>

      <section>
        <p className="lib-kicker">File room ({roomFiles.length})</p>
        {roomFiles.length ? (
          <div className="lib-card">
            {roomFiles.map((file) => (
              <button key={file.id} type="button" className="lib-row" onClick={() => void showFile(file)}>
                <div>
                  <strong>{file.name}</strong>
                  <span>{roomName(file.departmentId)} · {file.kind}{file.inLibrary ? " · in library" : ""}</span>
                </div>
                <span>Open</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="lib-empty">{query ? "No matching files in the file room." : "No files in the file room yet."}</p>
        )}
      </section>

      {open ? (
        <div className="lib-modal" role="presentation" onClick={() => setOpen(null)}>
          <article className="lib-modal-card" role="dialog" aria-label={open.name} onClick={(event) => event.stopPropagation()}>
            <div className="lib-modal-head">
              <h2>{open.name}</h2>
              <button type="button" className="round" aria-label="Close" onClick={() => setOpen(null)}>
                <IconX size={16} />
              </button>
            </div>
            <p className="lib-modal-meta">{open.meta}</p>
            <div className="bubble">
              <MarkdownPreview text={open.text.slice(0, 8000)} />
            </div>
          </article>
        </div>
      ) : null}
    </main>
  );
}
