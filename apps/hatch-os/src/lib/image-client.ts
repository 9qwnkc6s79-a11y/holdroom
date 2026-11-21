import { fitWithin, isHeicName, jpegDownloadName, MAX_EDGE, MAX_IMAGE_DATA_URL_CHARS, PREVIEW_EDGE } from "./images.ts";

export interface PreparedImage {
  file: File;
  name: string;
  previewUrl: string;
  /** Present when the jpeg data URL fits the chat request. Empty means OCR instead. */
  imageUrl: string;
}

let visionEnabledCache: boolean | null = null;

export async function visionEnabled(): Promise<boolean> {
  if (visionEnabledCache !== null) return visionEnabledCache;
  try {
    const res = await fetch("/api/vision");
    const data = (await res.json().catch(() => null)) as { enabled?: boolean } | null;
    visionEnabledCache = Boolean(res.ok && data?.enabled);
  } catch {
    visionEnabledCache = false;
  }
  return visionEnabledCache;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not prepare this photo."))),
      "image/jpeg",
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read this photo."));
    reader.readAsDataURL(blob);
  });
}

function paint(source: CanvasImageSource, width: number, height: number, maxEdge: number, quality: number) {
  const fit = fitWithin(width, height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = fit.width;
  canvas.height = fit.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare this photo.");
  ctx.drawImage(source, 0, 0, fit.width, fit.height);
  return canvasToBlob(canvas, quality);
}

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    const ready = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not open this photo."));
    });
    img.src = url;
    await ready;
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function toDrawable(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (bitmap.width > 0 && bitmap.height > 0) {
        return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
      }
      bitmap.close();
    } catch {
      /* Chrome cannot decode HEIC. Convert, then decode. */
    }
  }
  let blob: Blob = file;
  if (isHeicName(file.name, file.type)) {
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.86 });
    blob = Array.isArray(converted) ? converted[0] : converted;
  }
  const img = await loadImage(blob);
  return { source: img, width: img.naturalWidth, height: img.naturalHeight };
}

/** Downscale a phone photo to a jpeg the chat request can carry. HEIC is converted first. */
export async function prepareChatImage(file: File): Promise<PreparedImage> {
  const decoded = await toDrawable(file);
  try {
    if (!decoded.width || !decoded.height) throw new Error("Could not open this photo.");
    let quality = 0.82;
    let blob = await paint(decoded.source, decoded.width, decoded.height, MAX_EDGE, quality);
    while (blob.size > 900_000 && quality > 0.5) {
      quality -= 0.12;
      blob = await paint(decoded.source, decoded.width, decoded.height, MAX_EDGE, quality);
    }
    const previewBlob = await paint(decoded.source, decoded.width, decoded.height, PREVIEW_EDGE, 0.72);
    const name = jpegDownloadName(file.name || "photo.jpg");
    const prepared = new File([blob], name, { type: "image/jpeg" });
    const imageUrl = await blobToDataUrl(blob);
    return {
      file: prepared,
      name,
      previewUrl: await blobToDataUrl(previewBlob),
      imageUrl: imageUrl.length <= MAX_IMAGE_DATA_URL_CHARS ? imageUrl : "",
    };
  } finally {
    decoded.close?.();
  }
}

type Recognize = (image: Blob, langs?: string) => Promise<{ data: { text?: string } }>;

/** Read words out of a picture in the browser. The image is not sent to an OCR service. */
export async function readImageText(blob: Blob, timeoutMs = 45_000): Promise<string> {
  const mod = (await import("tesseract.js")) as { recognize?: Recognize; default?: { recognize?: Recognize } };
  const recognize = mod.recognize || mod.default?.recognize;
  if (!recognize) throw new Error("OCR is unavailable in this browser.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Reading the photo took too long.")), timeoutMs);
  });
  try {
    const result = await Promise.race([recognize(blob, "eng"), timeout]);
    return (result.data.text || "").replace(/[ \t]+\n/g, "\n").trim().slice(0, 8000);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
