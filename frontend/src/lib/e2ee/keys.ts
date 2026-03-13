/**
 * Key derivation from master secret — matches Rust e2ee-core keys.rs
 *
 * Master Secret (32 bytes)
 *   ├── KDF(subkey=1, "vkauth__") → Ed25519 seed (not used on frontend)
 *   └── KDF(subkey=2, "vkcont__") → X25519 Content KeyPair
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — @noble/hashes exports require .js extension
import { blake2b } from '@noble/hashes/blake2b.js';
import nacl from 'tweetnacl';

export interface ContentKeyPair {
  publicKey: Uint8Array; // 32 bytes
  secretKey: Uint8Array; // 32 bytes
}

/**
 * Derive the X25519 content keypair from a master secret.
 * Used for DEK unwrapping (sealed box open).
 *
 * Matches Rust: BLAKE2b-512(master_secret || 0x02 || "vkcont__") → take first 32 bytes as secret
 */
export function deriveContentKeyPair(
  masterSecret: Uint8Array,
): ContentKeyPair {
  if (masterSecret.length !== 32) {
    throw new Error(
      `Master secret must be 32 bytes, got ${masterSecret.length}`,
    );
  }

  const h = blake2b.create({ dkLen: 64 }); // BLAKE2b-512
  h.update(masterSecret);
  h.update(new Uint8Array([2])); // subkey_id = 2
  h.update(new TextEncoder().encode('vkcont__')); // 8-byte context
  const keyBytes = h.digest();

  const secretKey = keyBytes.slice(0, 32);
  const publicKey = nacl.scalarMult.base(secretKey);

  return { publicKey, secretKey };
}
