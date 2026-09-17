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
