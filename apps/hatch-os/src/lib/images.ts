import type { ChatAttachment } from "./types.ts";

/** Longest side sent to the vision model. Phone photos are scaled down to this. */
export const MAX_EDGE = 1280;
/** Data-URL budget for one picture on the model request. */
export const MAX_IMAGE_DATA_URL_CHARS = 900_000;
export const MAX_IMAGES = 4;

const RASTER = /\.(png|jpe?g|webp|gif|heic|heif)$/i;
const VIDEO = /\.(mp4|mov|m4v|webm)$/i;

export type ImagePart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type LlmContent = string | ImagePart[];

export function isVideoFile(name: string, type = ""): boolean {
  return type.startsWith("video/") || VIDEO.test(name);
}

/** A still picture the Ask model can see. SVG and video are not pictures. */
export function isRasterImage(name: string, type = ""): boolean {
  if (isVideoFile(name, type)) return false;
  if (type === "image/svg+xml" || /\.svg$/i.test(name)) return false;
  if (/^image\/(png|jpe?g|webp|gif|heic|heif)$/i.test(type)) return true;
  if (type.startsWith("image/") && !/svg|icon/i.test(type)) return true;
  return RASTER.test(name);
}

export function isVisionAttachment(file: { kind?: string; name?: string; image?: string }): boolean {
  if (typeof file.image === "string" && file.image.startsWith("data:image/")) return true;
  if (file.kind === "Image") return true;
  return isRasterImage(file.name || "");
}

/** Client-only chip ids are not files on the firm host. */
export function isStoredFileId(id?: string): boolean {
  if (!id) return false;
  if (/^(chip|file|local)-/.test(id)) return false;
  return /^[A-Za-z0-9_-]{4,80}$/.test(id);
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

/** OpenAI-style parts. The picture comes first, which is what Qwen's vision template expects. */
export function imageParts(text: string, dataUrls: string[]): ImagePart[] {
  const parts: ImagePart[] = [];
  for (const url of dataUrls) {
    if (url.startsWith("data:image/") && url.length <= MAX_IMAGE_DATA_URL_CHARS) {
      parts.push({ type: "image_url", image_url: { url } });
    }
  }
  parts.push({ type: "text", text: text.trim() || "Look at the attached image." });
  return parts;
}

export function withImageParts<T extends { role: string; content: LlmContent }>(
  messages: T[],
  dataUrls: string[],
): (Omit<T, "content"> & { content: LlmContent })[] {
  const urls = dataUrls.filter((url) => url.startsWith("data:image/") && url.length <= MAX_IMAGE_DATA_URL_CHARS).slice(0, MAX_IMAGES);
  if (!urls.length) return messages;
  const next = messages.map((message) => ({ ...message }));
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i].role !== "user") continue;
    next[i] = { ...next[i], content: imageParts(textOnlyContent(next[i].content), urls) };
    break;
  }
  return next;
}

export function textOnlyContent(content: LlmContent): string {
  if (typeof content === "string") return content;
  return content
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
}

/** Drop the picture bytes before a message is written to disk or sent back to the phone. */
export function forStorage(attachment: ChatAttachment): ChatAttachment {
  const next: ChatAttachment = { ...attachment };
  delete next.image;
  if (next.text && next.text.length > 8000) next.text = next.text.slice(0, 8000);
  return next;
}

const IMAGE_STUB_LINE =
  /can't read images|ocr is stubbed|cannot see the (image|picture)|only see the filename|no text could be read from this file/i;

/** Remove the old "filename only" note so it is not pasted in front of a real picture. */
export function scrubImageStub(context: string): string {
  const lines = context.split("\n").flatMap((line) => {
    if (IMAGE_STUB_LINE.test(line)) {
      if (/no text could be read from this pdf/i.test(line) && !/can't read images|ocr is stubbed/i.test(line)) {
        return [line.replace(/\s*The model will only see the filename\.?/gi, "").trimEnd()];
      }
      return [];
    }
    return [line];
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function modelTextForTurn(query: string, context: string | undefined, hasImage: boolean): string {
  const joined = [query.trim(), (context || "").trim()].filter(Boolean).join("\n\n");
  if (!hasImage) return joined;
  return scrubImageStub(joined) || "Look at the attached image.";
}

/** Image turns stay on Ask. Hermes is text-only and would only see a filename. */
export function chooseChatLane(input: { hasImage: boolean; agent?: boolean; toolTurn: boolean }): "ask" | "agent" {
  if (input.hasImage) return "ask";
  if (input.agent === false || !input.toolTurn) return "ask";
  return "agent";
}

/** The polled job state must not carry picture bytes back to the browser. */
export function withoutImagePayload<T extends { pendingImages?: string[]; llmMessages?: { content: LlmContent }[] }>(state: T): T {
  const next = { ...state };
  delete next.pendingImages;
  if (next.llmMessages) {
    next.llmMessages = next.llmMessages.map((message) => ({
      ...message,
      content: textOnlyContent(message.content),
    }));
  }
  return next;
}
