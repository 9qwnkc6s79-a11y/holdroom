import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";
import { atomicWriteFile, withFileLock } from "./atomic-json.ts";
import type { VaultKind, VaultPublicItem } from "./types.ts";
import { decryptJson, encryptJson, vaultConfigured, vaultKey } from "./vault-crypto.ts";

export interface VaultSecret {
  password?: string;
  token?: string;
  pan?: string;
  cvv?: string;
  exp?: string;
  holder?: string;
}

interface VaultRecord extends VaultPublicItem {
  iv: string;
  tag: string;
  ciphertext: string;
}

function vaultPath() {
  return process.env.HATCH_VAULT_PATH || path.join(process.cwd(), "data", "vault.json");
}

function readRecords(): VaultRecord[] {
  const file = vaultPath();
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { items?: VaultRecord[] };
    return Array.isArray(raw.items) ? raw.items : [];
  } catch {
    return [];
  }
}

function writeRecords(items: VaultRecord[]) {
  const file = vaultPath();
  mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteFile(file, JSON.stringify({ version: 1, items }, null, 2));
}

export function vaultKeyError(): string | null {
  if (!vaultConfigured()) {
    return "Vault key is not configured. Set HATCH_VAULT_KEY on the Hatch system. It is never stored in the repo.";
  }
  try {
    vaultKey();
    return null;
  } catch {
    return "HATCH_VAULT_KEY could not be read.";
  }
}

export function listVaultPublic(): VaultPublicItem[] {
  return readRecords().map(toPublic);
}

export function vaultCatalog(): { name: string; kind: VaultKind; whenToUse: string }[] {
  return listVaultPublic().map((item) => ({
    name: item.name,
    kind: item.kind,
    whenToUse: item.whenToUse,
  }));
}

function toPublic(item: VaultRecord): VaultPublicItem {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    whenToUse: item.whenToUse,
    username: item.username || undefined,
    last4: item.last4 || undefined,
    brand: item.brand || undefined,
    updatedAt: item.updatedAt,
  };
}

function last4Of(pan: string): string {
  const digits = pan.replace(/\D/g, "");
  return digits.slice(-4);
}

export function createVaultItem(input: {
  kind: VaultKind;
  name: string;
  whenToUse: string;
  username?: string;
  secret: VaultSecret;
}): VaultPublicItem {
  const keyError = vaultKeyError();
  if (keyError) throw new Error(keyError);
  const name = input.name.trim();
  const whenToUse = input.whenToUse.trim();
  if (!name) throw new Error("Name the vault item.");
  if (!whenToUse) throw new Error("Add a when-to-use note.");
  const secret = input.secret || {};
  if (input.kind === "login" && !secret.password) throw new Error("A login needs a password.");
  if (input.kind === "token" && !secret.token) throw new Error("An API key needs a token.");
  if (input.kind === "card" && !secret.pan) throw new Error("A card needs a number.");
  const sealed = encryptJson(secret);
  const record: VaultRecord = {
    id: `vault-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`,
    kind: input.kind,
    name: name.slice(0, 80),
    whenToUse: whenToUse.slice(0, 400),
    username: input.username?.trim().slice(0, 120) || undefined,
    last4: input.kind === "card" ? last4Of(secret.pan || "") : undefined,
    brand: input.kind === "card" ? secret.holder?.trim().slice(0, 80) : undefined,
    updatedAt: new Date().toISOString(),
    ...sealed,
  };
  return withFileLock(vaultPath(), () => {
    const items = readRecords();
    items.unshift(record);
    writeRecords(items);
    return toPublic(record);
  });
}

export function revealVaultItem(id: string): { item: VaultPublicItem; secret: VaultSecret } | null {
  const keyError = vaultKeyError();
  if (keyError) throw new Error(keyError);
  const record = readRecords().find((item) => item.id === id);
  if (!record) return null;
  const secret = decryptJson<VaultSecret>(record);
  return { item: toPublic(record), secret };
}

export function deleteVaultItem(id: string): boolean {
  return withFileLock(vaultPath(), () => {
    const items = readRecords();
    const next = items.filter((item) => item.id !== id);
    if (next.length === items.length) return false;
    writeRecords(next);
    return true;
  });
}

export function findVaultByName(name: string): VaultPublicItem | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  const items = listVaultPublic();
  return (
    items.find((item) => item.name.toLowerCase() === needle) ||
    items.find((item) => item.name.toLowerCase().includes(needle)) ||
    null
  );
}

/** Decrypted secret strings for scrubbing logs and prompts. Empty when the key is unset. */
export function secretStrings(): string[] {
  if (!vaultConfigured()) return [];
  const out: string[] = [];
  try {
    for (const record of readRecords()) {
      const secret = decryptJson<VaultSecret>(record);
      for (const value of Object.values(secret)) {
        if (typeof value === "string" && value.trim().length >= 4) out.push(value.trim());
      }
    }
  } catch {
    return out;
  }
  return out;
}

export function scrubVaultSecrets(text: string): string {
  let out = text || "";
  for (const secret of secretStrings()) {
    out = out.split(secret).join("••••");
  }
  return out;
}
