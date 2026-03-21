import { encrypt, decrypt } from './crypto';

export interface EncryptedEnvelope {
  v: number;
  nonce: string;
  ciphertext: string;
}

export function encryptJson<T>(data: T, key: Uint8Array): EncryptedEnvelope {
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const { nonce, ciphertext } = encrypt(plaintext, key);
  return {
    v: 1,
    nonce: btoa(String.fromCharCode(...nonce)),
    ciphertext: btoa(String.fromCharCode(...ciphertext)),
  };
}

export function decryptJson<T>(envelope: EncryptedEnvelope, key: Uint8Array): T {
  const nonce = Uint8Array.from(atob(envelope.nonce), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(envelope.ciphertext), c => c.charCodeAt(0));
  const plaintext = decrypt(ciphertext, key, nonce);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export function isEncryptedPayload(data: unknown): data is EncryptedEnvelope {
  return typeof data === 'object' && data !== null && 'v' in data && 'nonce' in data && 'ciphertext' in data;
}
