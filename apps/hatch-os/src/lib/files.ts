import type { FileKind } from "./types";

const DOC = /\.(pdf|docx?|xlsx?|md|txt)$/i;
const IMAGE = /\.(png|jpe?g|webp|gif)$/i;

export const ACCEPT_ATTR =
  ".pdf,.doc,.docx,.xls,.xlsx,.md,.txt,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/png,image/jpeg,image/webp,image/gif";

export const REJECT_COPY =
  "Could not read this file — try PDF, Office, markdown, or an image (PNG, JPEG, WebP, GIF), or ask Admin.";

export function isAcceptedFilename(name: string): boolean {
  return DOC.test(name) || IMAGE.test(name);
}

export function isImageFilename(name: string): boolean {
  return IMAGE.test(name);
}

export function kindFromFilename(name: string): FileKind {
  if (/\.pdf$/i.test(name)) return "PDF";
  if (/\.md$/i.test(name) || /\.txt$/i.test(name)) return "Markdown";
  if (IMAGE.test(name)) return "Image";
  return "Office";
}

export function imageAssetPassage(filename: string): string {
  return `Image asset: ${filename}. OCR is stubbed in this beta — the file is indexed by filename. Ask may still use firm-wide library text.`;
}

export function ingestStatusLabel(status: string, kind?: FileKind) {
  if (status === "ready") return "Ready";
  if (status === "indexed") return "Indexed";
  if (status === "extracting") return kind === "Image" ? "OCR (stub)" : "Extracting";
  if (status === "queued") return "Queued";
  if (status === "failed") return "Failed";
  return status;
}

/** Artifact panel badge: Doc / PDF / Markdown (Image stays Image). */
export function artifactBadge(kind: FileKind): "Doc" | "PDF" | "Markdown" | "Image" {
  if (kind === "PDF") return "PDF";
  if (kind === "Markdown") return "Markdown";
  if (kind === "Image") return "Image";
  return "Doc";
}

export function mimeFromFilename(name: string, kind?: FileKind): string {
  if (/\.pdf$/i.test(name) || kind === "PDF") return "application/pdf";
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.gif$/i.test(name)) return "image/gif";
  if (/\.md$/i.test(name)) return "text/markdown; charset=utf-8";
  if (/\.txt$/i.test(name)) return "text/plain; charset=utf-8";
  if (/\.docx$/i.test(name)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (/\.doc$/i.test(name)) return "application/msword";
  if (/\.xlsx$/i.test(name)) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (/\.xls$/i.test(name)) return "application/vnd.ms-excel";
  return "application/octet-stream";
}
