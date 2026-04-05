/**
 * E2EE Crypto primitives — XChaCha20-Poly1305 + X25519 + BLAKE2b
 * Matches the Rust e2ee-core implementation exactly.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { blake2b } from '@noble/hashes/blake2.js';
import nacl from 'tweetnacl';

/** Generate cryptographically secure random bytes */
export function randomBytes(n: number): Uint8Array {
  return nacl.randomBytes(n);
}

/**
 * Encrypt plaintext using XChaCha20-Poly1305 with a random 24-byte nonce.
 * Returns: nonce (24 bytes) || ciphertext (with 16-byte auth tag)
 */
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

/**
 * Decrypt data encrypted with XChaCha20-Poly1305.
 * Input format: nonce (24 bytes) || ciphertext
 */
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

/**
 * Wrap (encrypt) a DEK using the recipient's X25519 public key.
 * Sealed-box-like construction matching Rust e2ee-core.
 *
 * Output: ephemeralPublic (32) || nonce (24) || ciphertext (32 + 16 tag)
 */
export function wrapDek(
  dek: Uint8Array,
  recipientPublicKey: Uint8Array
): Uint8Array {
  // Generate ephemeral X25519 keypair using tweetnacl
  const ephemeralSecret = randomBytes(32);
  const ephemeralPublic = nacl.scalarMult.base(ephemeralSecret);

  // ECDH: shared_secret = ephemeral_secret * recipient_public
  const sharedSecret = nacl.scalarMult(ephemeralSecret, recipientPublicKey);

  // Derive symmetric key using BLAKE2b-512
  // Must match Rust: hash(shared_secret || ephemeral_public || recipient_public)
  const h = blake2b.create({ dkLen: 64 });
  h.update(sharedSecret);
  h.update(ephemeralPublic);
  h.update(recipientPublicKey);
  const derived = h.digest();
  const symKey = derived.slice(0, 32);

  // Encrypt DEK with XChaCha20-Poly1305
  const nonce = randomBytes(24);
  const cipher = xchacha20poly1305(symKey, nonce);
  const ciphertext = cipher.encrypt(dek);

  // Pack: ephemeral_public (32) || nonce (24) || ciphertext (48)
  const result = new Uint8Array(32 + 24 + ciphertext.length);
  result.set(ephemeralPublic, 0);
  result.set(nonce, 32);
  result.set(ciphertext, 56);
  return result;
}

/**
 * Unwrap (decrypt) a DEK using the recipient's X25519 secret key.
 * Input format: ephemeralPublic (32) || nonce (24) || ciphertext
 */
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

  // ECDH: shared_secret = recipient_secret * ephemeral_public
  const sharedSecret = nacl.scalarMult(recipientSecretKey, ephemeralPublic);

  // Derive same symmetric key using BLAKE2b-512
  const h = blake2b.create({ dkLen: 64 });
  h.update(sharedSecret);
  h.update(ephemeralPublic);
  h.update(recipientPublicKey);
  const derived = h.digest();
  const symKey = derived.slice(0, 32);

  // Decrypt
  const cipher = xchacha20poly1305(symKey, nonce);
  return cipher.decrypt(ciphertext);
}
