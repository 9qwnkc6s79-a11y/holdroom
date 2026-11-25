import { MAX_EDGE, MAX_IMAGE_DATA_URL_CHARS } from "./images.ts";

const EDGES = [MAX_EDGE, 1024, 768, 512];
const QUALITIES = [80, 62, 48];

export function decodeDataUrl(url: string): Buffer {
  if (url.length > 8_000_000) throw new Error("Image is too large.");
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,([a-zA-Z0-9+/=\s]+)$/.exec(url.trim());
  if (!match) throw new Error("Not an image data URL.");
  const bytes = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  if (!bytes.length) throw new Error("Image data is empty.");
  return bytes;
}

export function jpegDataUrl(jpeg: Buffer): string {
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

function looksLikeJpeg(input: Buffer) {
  return input.length > 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
}

/** Re-encode to a modest JPEG so the model request stays small and EXIF is dropped. */
export async function toVisionJpeg(input: Buffer): Promise<Buffer> {
  if (!input.length) throw new Error("Image is empty.");
  try {
    const sharp = (await import("sharp")).default;
    let last: Buffer | null = null;
    for (const edge of EDGES) {
      for (const quality of QUALITIES) {
        const jpeg = await sharp(input, { limitInputPixels: 80_000_000, failOn: "error", animated: false })
          .rotate()
          .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
          .flatten({ background: "#ffffff" })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
        last = jpeg;
        if (jpegDataUrl(jpeg).length <= MAX_IMAGE_DATA_URL_CHARS) return jpeg;
      }
    }
    if (last && jpegDataUrl(last).length <= MAX_IMAGE_DATA_URL_CHARS) return last;
    throw new Error("Image is still too large after resizing.");
  } catch (err) {
    // A JPEG the browser already scaled can still be sent if the native resizer is missing.
    if (looksLikeJpeg(input) && jpegDataUrl(input).length <= MAX_IMAGE_DATA_URL_CHARS) return input;
    throw err instanceof Error ? err : new Error("Could not read this image.");
  }
}
