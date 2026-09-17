"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useHatch } from "./AppProvider";
import { CloseIcon, CopyIcon, DownloadIcon } from "./Icons";
import { MarkdownPreview } from "./MarkdownPreview";
import { artifactBadge } from "@/lib/files";
import { workspaceLabel } from "@/lib/departments";
import type { HatchFile } from "@/lib/types";

export function ArtifactPanel() {
  const { activeArtifactId, artifactOpen, closeArtifact, setInLibrary, currentFiles, departments } = useHatch();
  const [file, setFile] = useState<HatchFile | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);

  const local =
    currentFiles.find((f) => f.id === activeArtifactId) ||
    departments.flatMap((d) => d.files).find((f) => f.id === activeArtifactId) ||
    null;

  useEffect(() => {
    if (!artifactOpen || !activeArtifactId) {
      setFile(null);
      setText("");
      setError("");
      return;
    }
    let cancelled = false;
    setError("");
    setPdfFailed(false);
    setCopied(false);
    fetch(`/api/files/${encodeURIComponent(activeArtifactId)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as { file?: HatchFile; text?: string; error?: string };
        if (cancelled) return;
        if (!res.ok || !data.file) {
          setError(data.error || "Could not open this file.");
          return;
        }
        setFile(data.file);
        setText(data.text || "");
      })
      .catch(() => {
        if (!cancelled) setError("Could not open this file.");
      });
    return () => {
      cancelled = true;
    };
  }, [artifactOpen, activeArtifactId]);

  useEffect(() => {
    if (!artifactOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeArtifact();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [artifactOpen, closeArtifact]);

  if (!artifactOpen || !activeArtifactId) return null;

  const shown = file || local;
  const badge = shown ? artifactBadge(shown.kind) : "Doc";
  const rawHref = `/api/files/${encodeURIComponent(activeArtifactId)}/raw`;
  const downloadHref = `${rawHref}?download=1`;
  const canCopy = shown?.kind === "Markdown" || shown?.kind === "Office";
  const title = shown?.name.replace(/\.[^.]+$/, "") || "Document";

  async function copyText() {
    const value = text.trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button className="artifact-backdrop" type="button" aria-label="Close artifact" onClick={closeArtifact} />
      <aside className="artifact-panel" role="complementary" aria-label="Artifact">
        <header className="artifact-bar">
          <div className="artifact-bar-title">
            <span className="pill pill-mute">{badge}</span>
            <div className="artifact-name-wrap">
              <h2 className="artifact-title" title={shown?.name}>
                {title}
              </h2>
              {shown ? (
                <p className="fine">
                  {workspaceLabel(shown.departmentId)}
                  {shown.origin === "draft" ? " · Draft" : ""}
                  {shown.inLibrary ? " · Library" : " · Files"}
                </p>
              ) : null}
            </div>
          </div>
          <div className="artifact-actions">
            <a className="btn btn-dark btn-tiny artifact-download" href={downloadHref} download={shown?.name}>
              <DownloadIcon />
              Download
            </a>
            {canCopy ? (
              <button className="btn btn-ghost btn-tiny" type="button" onClick={() => void copyText()} disabled={!text}>
                <CopyIcon />
                {copied ? "Copied" : "Copy"}
              </button>
            ) : null}
            <Link className="btn btn-ghost btn-tiny" href="/files">
              Open in Files
            </Link>
            {shown ? (
              <button
                className="btn btn-ghost btn-tiny"
                type="button"
                onClick={() => setInLibrary(shown.id, !shown.inLibrary)}
              >
                {shown.inLibrary ? "In Library" : "Add to Library"}
              </button>
            ) : null}
            <button className="icon-btn artifact-close" type="button" onClick={closeArtifact} aria-label="Close artifact">
              <CloseIcon />
            </button>
          </div>
        </header>
        <div className="artifact-body">
          {error ? (
            <div className="artifact-fallback">
              <p>{error}</p>
              <a className="btn btn-outline" href={downloadHref} download={shown?.name}>
                Download
              </a>
            </div>
          ) : !shown ? (
            <p className="fine">Opening…</p>
          ) : shown.kind === "Markdown" ? (
            text ? (
              <MarkdownPreview text={text} />
            ) : (
              <p className="fine">Opening…</p>
            )
          ) : shown.kind === "PDF" ? (
            pdfFailed ? (
              <div className="artifact-fallback">
                <p>This browser could not embed the PDF.</p>
                <a className="btn btn-outline" href={downloadHref} download={shown.name}>
                  Download PDF
                </a>
              </div>
            ) : (
              <iframe
                className="artifact-frame"
                title={shown.name}
                src={rawHref}
                onError={() => setPdfFailed(true)}
              />
            )
          ) : shown.kind === "Image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="artifact-image" src={rawHref} alt={shown.name} />
          ) : text && !/^PDF uploaded:|^Image asset:|^(\(no extracted text)/.test(text) ? (
            <pre className="artifact-plain">{text}</pre>
          ) : (
            <div className="artifact-fallback">
              <p>Preview isn’t available for this {badge.toLowerCase()}. Download to open it.</p>
              <a className="btn btn-outline" href={downloadHref} download={shown.name}>
                Download
              </a>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
