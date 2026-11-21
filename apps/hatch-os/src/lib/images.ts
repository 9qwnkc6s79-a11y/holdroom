import type { ChatAttachment } from "./types.ts";

/** Longest side sent to a vision model, after the phone photo is scaled down. */
export const MAX_EDGE = 1600;
/** Longest side of the composer and bubble thumbnail. */
export const PREVIEW_EDGE = 320;
/** Data-URL budget for one picture on the chat request. Keeps the body under typical platform limits. */
export const MAX_IMAGE_DATA_URL_CHARS = 1_400_000;
export const MAX_PREVIEW_CHARS = 80_000;

export const OCR_NOTICE =
  "The current model reads the text in this image. It cannot see the picture itself.";

export const PHOTO_ACCEPT = "image/*,video/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif,.mp4,.mov";
export const CAMERA_ACCEPT = "image/*,.heic,.heif,.jpg,.jpeg,.png,.webp";
/** No capture attribute: a scan can come from the library or a PDF, not only the camera. */
export const SCAN_ACCEPT = "image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif,application/pdf,.pdf";

const RASTER = /\.(png|jpe?g|webp|gif|heic|heif)$/i;
const VIDEO = /\.(mp4|mov|m4v|webm)$/i;

export type ImagePart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export function isHeicName(name: string, type = ""): boolean {
  return /\.heic$|\.heif$/i.test(name) || /heic|heif/i.test(type);
}

export function isVideoFile(name: string, type = ""): boolean {
  return type.startsWith("video/") || VIDEO.test(name);
}

export function isRasterImage(name: string, type = ""): boolean {
  if (isVideoFile(name, type)) return false;
  if (type.startsWith("image/")) return true;
  return RASTER.test(name);
}

export function jpegDownloadName(name: string): string {
  const base = (name || "photo").replace(/\.[^.]+$/, "") || "photo";
  return `${base}.jpg`;
}

export function fitWithin(width: number, height: number, maxEdge: number) {
  const w = Math.max(1, Math.round(width) || 1);
  const h = Math.max(1, Math.round(height) || 1);
  const edge = Math.max(w, h);
  if (edge <= maxEdge) return { width: w, height: h, scale: 1 };
  const scale = maxEdge / edge;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
}

export function imageParts(text: string, dataUrls: string[]): ImagePart[] {
  const parts: ImagePart[] = [];
  const body = text.trim();
  if (body) parts.push({ type: "text", text: body });
  for (const url of dataUrls) {
    if (url.startsWith("data:image/")) parts.push({ type: "image_url", image_url: { url } });
  }
  return parts.length ? parts : [{ type: "text", text: "Look at the attached image." }];
}

export function withImageParts<T extends { role: string; content: string }>(
  messages: T[],
  dataUrls: string[],
): (Omit<T, "content"> & { content: string | ImagePart[] })[] {
  if (!dataUrls.length) return messages;
  const next = messages.map((message) => ({ ...message }));
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i].role !== "user") continue;
    next[i] = { ...next[i], content: imageParts(next[i].content, dataUrls) };
    break;
  }
  return next;
}

export function textOnlyContent(content: string | ImagePart[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
}

export function attachmentImageUrls(
  attachments?: Pick<ChatAttachment, "image" | "reading">[] | null,
): string[] {
  const urls: string[] = [];
  for (const item of attachments || []) {
    if (item.reading !== "vision") continue;
    const image = item.image;
    if (typeof image === "string" && image.startsWith("data:image/") && image.length <= MAX_IMAGE_DATA_URL_CHARS) {
      urls.push(image);
    }
  }
  return urls;
}

/** Drop the vision payload before a message is written to disk or localStorage. */
export function forStorage(attachment: ChatAttachment): ChatAttachment {
  const next: ChatAttachment = { ...attachment };
  delete next.image;
  if (next.preview && next.preview.length > MAX_PREVIEW_CHARS) delete next.preview;
  if (next.text && next.text.length > 8000) next.text = next.text.slice(0, 8000);
  return next;
}

export function attachmentContext(file: {
  name: string;
  text?: string;
  note?: string;
  reading?: ChatAttachment["reading"];
}): string {
  if (file.reading === "vision") {
    return `Attached image ${file.name}\nThe picture is included for the vision model.`;
  }
  if (file.reading === "ocr") {
    const body = (file.text || "").trim();
    return body
      ? `Attached file ${file.name}\nOCR text from the image (the model cannot see the picture itself):\n${body.slice(0, 8000)}`
      : `Attached file ${file.name}\nNo text could be read from this picture. The model cannot see the image itself.`;
  }
  if (file.text) return `Attached file ${file.name}\n${file.text.slice(0, 8000)}`;
  return `Attached file ${file.name}\n${file.note || "No text could be read from this file."}`;
}

export function turnContext(
  typed: string,
  files: { name: string; text?: string; note?: string; reading?: ChatAttachment["reading"] }[],
): string {
  const blocks = files.map((file) => attachmentContext(file));
  if (!typed.trim() && files.length) {
    const lead = files.some((file) => file.reading === "vision" || file.reading === "ocr")
      ? "Look at the attached image."
      : "Read the attached file.";
    return [lead, ...blocks].filter(Boolean).join("\n\n");
  }
  return blocks.filter(Boolean).join("\n\n");
}
