/**
 * Key derivation from master secret
 *
 * Master Secret (32 bytes)
 *   ├── KDF(subkey=1, "vkauth__") → Ed25519 Auth KeyPair
 *   └── KDF(subkey=2, "vkcont__") → X25519 Content KeyPair
 */
import { blake2b } from '@noble/hashes/blake2.js';
import * as ed from '@noble/ed25519';
import nacl from 'tweetnacl';

export interface AuthKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface ContentKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export async function deriveAuthKeyPair(
  masterSecret: Uint8Array
): Promise<AuthKeyPair> {
  if (masterSecret.length !== 32) {
    throw new Error(
      `Master secret must be 32 bytes, got ${masterSecret.length}`
    );
  }
  const h = blake2b.create({ dkLen: 64 });
  h.update(masterSecret);
  h.update(new Uint8Array([1]));
  h.update(new TextEncoder().encode('vkauth__'));
  const seedBytes = h.digest();
  const seed = seedBytes.slice(0, 32);
  const publicKey = await ed.getPublicKeyAsync(seed);
  const secretKey = new Uint8Array(64);
  secretKey.set(seed, 0);
  secretKey.set(publicKey, 32);
  return { publicKey, secretKey };
}

export function deriveContentKeyPair(masterSecret: Uint8Array): ContentKeyPair {
  if (masterSecret.length !== 32) {
    throw new Error(
      `Master secret must be 32 bytes, got ${masterSecret.length}`
    );
  }
  const h = blake2b.create({ dkLen: 64 });
  h.update(masterSecret);
  h.update(new Uint8Array([2]));
  h.update(new TextEncoder().encode('vkcont__'));
  const keyBytes = h.digest();
  const secretKey = keyBytes.slice(0, 32);
  const publicKey = nacl.scalarMult.base(secretKey);
  return { publicKey, secretKey };
}
