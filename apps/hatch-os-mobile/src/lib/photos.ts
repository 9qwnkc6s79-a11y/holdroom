import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "react-native";
import { apiUrl } from "@/api/config";
import { jpegName } from "@/lib/derive";
import { kvGet, kvSet } from "@/lib/kv";

const MAP = "hatch.images";

export function isPhoto(name: string, mimeType: string): boolean {
  return mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(name);
}

function measure(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    );
  });
}

/** HEIC and oversized photos become a JPEG the host can store. */
export async function preparePhoto(file: { uri: string; name: string; mimeType: string }): Promise<{ uri: string; name: string; mimeType: string }> {
  if (!isPhoto(file.name, file.mimeType)) return file;
  const size = await measure(file.uri);
  const max = 1600;
  const actions: { resize: { width: number } }[] = [];
  if (size && (size.width > max || size.height > max)) {
    const width = size.width >= size.height ? max : Math.max(1, Math.round((max * size.width) / size.height));
    actions.push({ resize: { width } });
  }
  try {
    const saved = await manipulateAsync(file.uri, actions, { compress: 0.82, format: SaveFormat.JPEG });
    return { uri: saved.uri, name: jpegName(file.name), mimeType: "image/jpeg" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare this photo.";
    throw new Error(message);
  }
}

export function remoteImageUrl(fileId: string): string {
  return apiUrl(`/api/files/${encodeURIComponent(fileId)}/raw`);
}

export async function keepImage(fileId: string, uri: string): Promise<string> {
  const root = FileSystem.documentDirectory;
  if (!root) return uri;
  const dir = `${root}hatch-images/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const dest = `${dir}${fileId.replace(/[^\w.-]+/g, "_")}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  const raw = await kvGet(MAP);
  const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  map[fileId] = dest;
  await kvSet(MAP, JSON.stringify(map));
  return dest;
}

export async function savedImageUri(fileId: string): Promise<string | null> {
  const raw = await kvGet(MAP);
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return map[fileId] || null;
  } catch {
    return null;
  }
}
