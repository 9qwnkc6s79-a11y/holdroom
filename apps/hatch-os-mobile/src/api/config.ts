const DEFAULT_BASE = "https://hatch-os-beta.vercel.app";

export function resolveApiBase(value: string | undefined): string {
  const raw = (value ?? DEFAULT_BASE).trim();
  return raw.replace(/\/+$/, "") || DEFAULT_BASE;
}

export function apiBase(): string {
  return resolveApiBase(process.env.EXPO_PUBLIC_HATCH_API_BASE);
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = apiBase();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
