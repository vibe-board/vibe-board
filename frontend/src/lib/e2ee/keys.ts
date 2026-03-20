/**
 * Key derivation from master secret — matches Rust e2ee-core keys.rs
 *
 * Master Secret (32 bytes)
 *   ├── KDF(subkey=1, "vkauth__") → Ed25519 Auth KeyPair
 *   └── KDF(subkey=2, "vkcont__") → X25519 Content KeyPair
 */
import { blake2b } from '@noble/hashes/blake2.js';
import * as ed from '@noble/ed25519';
import nacl from 'tweetnacl';

export interface AuthKeyPair {
  publicKey: Uint8Array; // 32 bytes (Ed25519 verifying key)
  secretKey: Uint8Array; // 64 bytes (Ed25519 signing key = seed + public)
}

export interface ContentKeyPair {
  publicKey: Uint8Array; // 32 bytes
  secretKey: Uint8Array; // 32 bytes
}

/**
 * Derive the Ed25519 auth keypair from a master secret.
 * Used for device registration with the gateway.
 *
 * Matches Rust: BLAKE2b-512(master_secret || 0x01 || "vkauth__") → take first 32 bytes as Ed25519 seed
 */
export async function deriveAuthKeyPair(
  masterSecret: Uint8Array
): Promise<AuthKeyPair> {
  if (masterSecret.length !== 32) {
    throw new Error(
      `Master secret must be 32 bytes, got ${masterSecret.length}`
    );
  }

  const h = blake2b.create({ dkLen: 64 }); // BLAKE2b-512
  h.update(masterSecret);
  h.update(new Uint8Array([1])); // subkey_id = 1
  h.update(new TextEncoder().encode('vkauth__')); // 8-byte context
  const seedBytes = h.digest();

  const seed = seedBytes.slice(0, 32);
  const publicKey = await ed.getPublicKeyAsync(seed);

  // Ed25519 signing key = seed (32) || public key (32) = 64 bytes
  const secretKey = new Uint8Array(64);
  secretKey.set(seed, 0);
  secretKey.set(publicKey, 32);

  return { publicKey, secretKey };
}

/**
 * Derive the X25519 content keypair from a master secret.
 * Used for DEK unwrapping (sealed box open).
 *
 * Matches Rust: BLAKE2b-512(master_secret || 0x02 || "vkcont__") → take first 32 bytes as secret
 */
export function deriveContentKeyPair(masterSecret: Uint8Array): ContentKeyPair {
  if (masterSecret.length !== 32) {
    throw new Error(
      `Master secret must be 32 bytes, got ${masterSecret.length}`
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
