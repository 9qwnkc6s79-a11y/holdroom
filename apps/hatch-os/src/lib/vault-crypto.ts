import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const SCRYPT_SALT = "hatch-vault-v1";

/** 32-byte key from HATCH_VAULT_KEY (64 hex chars, base64, or a passphrase). */
export function vaultKey(): Buffer {
  const raw = (process.env.HATCH_VAULT_KEY || "").trim();
  if (!raw) {
    throw new Error("HATCH_VAULT_KEY is not set");
  }
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  if (/^[A-Za-z0-9+/]{43}=$/.test(raw) || /^[A-Za-z0-9+/]{44}$/.test(raw)) {
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) return b64;
  }
  return scryptSync(raw, SCRYPT_SALT, 32);
}

export function vaultConfigured(): boolean {
  return Boolean((process.env.HATCH_VAULT_KEY || "").trim());
}

export function encryptJson(value: unknown, key = vaultKey()): { iv: string; tag: string; ciphertext: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptJson<T>(payload: { iv: string; tag: string; ciphertext: string }, key = vaultKey()): T {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString("utf8")) as T;
}
