import { loadVisionJpeg, mirrorVisionJpeg } from "./image-cache.ts";
import { decodeDataUrl, jpegDataUrl, toVisionJpeg } from "./image-bytes.ts";
import { isStoredFileId, isVisionAttachment, MAX_IMAGES } from "./images.ts";
import { readFileBytes } from "./store.ts";
import type { ChatAttachment } from "./types.ts";

export interface PreparedImages {
  hasImage: boolean;
  dataUrls: string[];
  fileIds: string[];
}

export const MISSING_IMAGE =
  "The picture didn't reach Hatch. Attach it again. Nothing was sent to an outside AI lab.";

export function missingImageMessage(names: string[]): string {
  if (names.some((name) => /\.hei[cf]$/i.test(name))) {
    return "Hatch couldn't read this HEIC picture. Send it as a JPEG or PNG. Nothing was sent to an outside AI lab.";
  }
  return MISSING_IMAGE;
}

async function jpegFor(item: ChatAttachment): Promise<Buffer | null> {
  if (item.image?.startsWith("data:image/")) {
    try {
      return await toVisionJpeg(decodeDataUrl(item.image));
    } catch {
      /* The stored file is the other copy. */
    }
  }
  if (!isStoredFileId(item.fileId)) return null;
  const cached = await loadVisionJpeg(item.fileId);
  if (cached?.length) return cached;
  const stored = readFileBytes(item.fileId);
  if (!stored?.bytes.length) return null;
  try {
    return await toVisionJpeg(stored.bytes);
  } catch {
    return null;
  }
}

/** Turn chat attachments into JPEG data URLs the Ask model can see. */
export async function prepareTurnImages(attachments?: ChatAttachment[] | null): Promise<PreparedImages> {
  const images = (attachments || []).filter((item) => isVisionAttachment(item)).slice(0, MAX_IMAGES);
  if (!images.length) return { hasImage: false, dataUrls: [], fileIds: [] };
  const dataUrls: string[] = [];
  const fileIds: string[] = [];
  for (const item of images) {
    if (isStoredFileId(item.fileId)) fileIds.push(item.fileId);
    const jpeg = await jpegFor(item);
    if (!jpeg) continue;
    if (isStoredFileId(item.fileId)) {
      try {
        await mirrorVisionJpeg(item.fileId, jpeg);
      } catch {
        /* The request can still carry the data URL. */
      }
    }
    const url = jpegDataUrl(jpeg);
    dataUrls.push(url);
  }
  return { hasImage: true, dataUrls, fileIds };
}
