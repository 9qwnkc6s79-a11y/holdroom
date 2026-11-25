import { fitWithin, isRasterImage, MAX_EDGE } from "./images.ts";

/** Resize a chat photo in the browser and return a JPEG data URL. Null when the browser cannot decode it. */
export async function browserImageDataUrl(file: File, maxEdge = MAX_EDGE): Promise<string | null> {
  if (typeof document === "undefined") return null;
  if (!isRasterImage(file.name || "image", file.type || "")) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const fit = fitWithin(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = fit.width;
    canvas.height = fit.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return null;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, fit.width, fit.height);
    ctx.drawImage(bitmap, 0, 0, fit.width, fit.height);
    bitmap.close?.();
    const url = canvas.toDataURL("image/jpeg", 0.82);
    return url.startsWith("data:image/jpeg") ? url : null;
  } catch {
    return null;
  }
}
