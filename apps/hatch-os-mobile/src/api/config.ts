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

const DEFAULT_PRIVACY_URL = "https://hatchsystems.ai/privacy";
const DEFAULT_TERMS_URL = "https://hatchsystems.ai/terms";

export function resolveLegalUrl(value: string | undefined, fallback: string): string {
  const clean = (value || "").trim();
  return /^https?:\/\//i.test(clean) ? clean : fallback;
}

export function privacyUrl(): string {
  return resolveLegalUrl(process.env.EXPO_PUBLIC_PRIVACY_URL, DEFAULT_PRIVACY_URL);
}

export function termsUrl(): string {
  return resolveLegalUrl(process.env.EXPO_PUBLIC_TERMS_URL, DEFAULT_TERMS_URL);
}
