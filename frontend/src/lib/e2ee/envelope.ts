/**
 * Encrypted payload envelope — matches Rust e2ee-core envelope.rs
 *
 * Format: { t: "encrypted", c: "<base64(nonce || ciphertext)>" }
 */
import { encryptPayload, decryptPayload } from './crypto';

export interface EncryptedPayload {
  t: 'encrypted';
  c: string; // base64-encoded nonce (24 bytes) || ciphertext
}

/** Check if a JSON value looks like an encrypted payload */
export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    't' in value &&
    (value as Record<string, unknown>).t === 'encrypted'
  );
}

/** Encode bytes to base64 */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode base64 to bytes */
function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encrypt arbitrary bytes into an EncryptedPayload envelope */
export function encryptToEnvelope(
  plaintext: Uint8Array,
  dek: Uint8Array,
): EncryptedPayload {
  const encrypted = encryptPayload(plaintext, dek);
  return {
    t: 'encrypted',
    c: toBase64(encrypted),
  };
}

/** Decrypt an EncryptedPayload envelope back to bytes */
export function decryptFromEnvelope(
  payload: EncryptedPayload,
  dek: Uint8Array,
): Uint8Array {
  if (payload.t !== 'encrypted') {
    throw new Error('Not an encrypted payload');
  }
  const encrypted = fromBase64(payload.c);
  return decryptPayload(encrypted, dek);
}

/** Encrypt a JSON-serializable value into an EncryptedPayload */
export function encryptJson<T>(value: T, dek: Uint8Array): EncryptedPayload {
  const jsonStr = JSON.stringify(value);
  const plaintext = new TextEncoder().encode(jsonStr);
  return encryptToEnvelope(plaintext, dek);
}

/** Decrypt an EncryptedPayload back to a parsed JSON value */
export function decryptJson<T>(
  payload: EncryptedPayload,
  dek: Uint8Array,
): T {
  const plaintext = decryptFromEnvelope(payload, dek);
  const jsonStr = new TextDecoder().decode(plaintext);
  return JSON.parse(jsonStr) as T;
}
