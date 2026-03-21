/**
 * E2EE Crypto primitives — XChaCha20-Poly1305 + X25519 + BLAKE2b
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { blake2b } from '@noble/hashes/blake2.js';
import nacl from 'tweetnacl';

export function randomBytes(n: number): Uint8Array {
  return nacl.randomBytes(n);
}

export function encryptPayload(
  plaintext: Uint8Array,
  dek: Uint8Array
): Uint8Array {
  const nonce = randomBytes(24);
  const cipher = xchacha20poly1305(dek, nonce);
  const ciphertext = cipher.encrypt(plaintext);
  const result = new Uint8Array(24 + ciphertext.length);
  result.set(nonce, 0);
  result.set(ciphertext, 24);
  return result;
}

export function decryptPayload(data: Uint8Array, dek: Uint8Array): Uint8Array {
  if (data.length < 24) {
    throw new Error(
      `Data too short: expected at least 24 bytes, got ${data.length}`
    );
  }
  const nonce = data.slice(0, 24);
  const ciphertext = data.slice(24);
  const cipher = xchacha20poly1305(dek, nonce);
  return cipher.decrypt(ciphertext);
}

export function wrapDek(
  dek: Uint8Array,
  recipientPublicKey: Uint8Array
): Uint8Array {
  const ephemeralSecret = randomBytes(32);
  const ephemeralPublic = nacl.scalarMult.base(ephemeralSecret);
  const sharedSecret = nacl.scalarMult(ephemeralSecret, recipientPublicKey);
  const h = blake2b.create({ dkLen: 64 });
  h.update(sharedSecret);
  h.update(ephemeralPublic);
  h.update(recipientPublicKey);
  const derived = h.digest();
  const symKey = derived.slice(0, 32);
  const nonce = randomBytes(24);
  const cipher = xchacha20poly1305(symKey, nonce);
  const ciphertext = cipher.encrypt(dek);
  const result = new Uint8Array(32 + 24 + ciphertext.length);
  result.set(ephemeralPublic, 0);
  result.set(nonce, 32);
  result.set(ciphertext, 56);
  return result;
}

export function unwrapDek(
  wrapped: Uint8Array,
  recipientSecretKey: Uint8Array,
  recipientPublicKey: Uint8Array
): Uint8Array {
  if (wrapped.length < 32 + 24 + 48) {
    throw new Error('Wrapped DEK too short');
  }
  const ephemeralPublic = wrapped.slice(0, 32);
  const nonce = wrapped.slice(32, 56);
  const ciphertext = wrapped.slice(56);
  const sharedSecret = nacl.scalarMult(recipientSecretKey, ephemeralPublic);
  const h = blake2b.create({ dkLen: 64 });
  h.update(sharedSecret);
  h.update(ephemeralPublic);
  h.update(recipientPublicKey);
  const derived = h.digest();
  const symKey = derived.slice(0, 32);
  const cipher = xchacha20poly1305(symKey, nonce);
  return cipher.decrypt(ciphertext);
}
