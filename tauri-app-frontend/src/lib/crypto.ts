import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { blake2b } from '@noble/hashes/blake2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import type { EncryptedPayload, BridgeRequest, BridgeResponse, SignedAuthToken } from '@/types';

function base64Encode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data));
}

function base64Decode(str: string): Uint8Array {
  return new Uint8Array(atob(str).split('').map((c) => c.charCodeAt(0)));
}

// Key derivation from master secret using BLAKE2b-512
function deriveAuthKey(masterSecret: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array } {
  const authSeed = blake2b(masterSecret, { dkLen: 32, personalization: new TextEncoder().encode('vkauth__') });
  const kp = ed25519.keygen(authSeed);
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

function deriveContentKey(masterSecret: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array } {
  const contentSeed = blake2b(masterSecret, { dkLen: 32, personalization: new TextEncoder().encode('vkcont__') });
  const secretKey = contentSeed.slice(0, 32);
  const publicKey = x25519.getPublicKey(secretKey);
  return { publicKey, secretKey };
}

// Derive shared DEK from local content key + remote content public key
function deriveSharedDEK(
  localSecretKey: Uint8Array,
  remotePublicKey: Uint8Array,
): Uint8Array {
  const sharedSecret = x25519.getSharedSecret(localSecretKey, remotePublicKey);
  return blake2b(sharedSecret, { dkLen: 32 });
}

// Encrypt a bridge message
function encrypt(dek: Uint8Array, plaintext: Uint8Array): EncryptedPayload {
  const nonce = randomBytes(24);
  const cipher = xchacha20poly1305(dek, nonce);
  const ciphertext = cipher.encrypt(plaintext);
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);
  return { t: 'encrypted', c: base64Encode(combined) };
}

// Decrypt a bridge message
function decrypt(dek: Uint8Array, payload: EncryptedPayload): Uint8Array {
  const combined = base64Decode(payload.c);
  const nonce = combined.slice(0, 24);
  const ciphertext = combined.slice(24);
  const cipher = xchacha20poly1305(dek, nonce);
  return cipher.decrypt(ciphertext);
}

// Encrypt a BridgeRequest
export function encryptBridgeRequest(dek: Uint8Array, request: BridgeRequest): EncryptedPayload {
  const plaintext = new TextEncoder().encode(JSON.stringify(request));
  return encrypt(dek, plaintext);
}

// Decrypt to BridgeResponse
export function decryptBridgeResponse(dek: Uint8Array, payload: EncryptedPayload): BridgeResponse {
  const plaintext = decrypt(dek, payload);
  return JSON.parse(new TextDecoder().decode(plaintext)) as BridgeResponse;
}

// Create a signed auth token
export function createSignedAuthToken(masterSecret: Uint8Array): SignedAuthToken {
  const { publicKey, secretKey } = deriveAuthKey(masterSecret);
  const payload = {
    public_key: base64Encode(publicKey),
    timestamp: new Date().toISOString(),
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const signature = ed25519.sign(payloadBytes, secretKey);
  return {
    payload,
    signature: base64Encode(signature),
  };
}

export interface E2EEKeys {
  masterSecret: Uint8Array;
  authPublicKey: string; // base64
  contentPublicKey: string; // base64
}

export function deriveKeysFromMasterSecret(masterSecretBase64: string): E2EEKeys {
  const masterSecret = base64Decode(masterSecretBase64);
  const auth = deriveAuthKey(masterSecret);
  const content = deriveContentKey(masterSecret);
  return {
    masterSecret,
    authPublicKey: base64Encode(auth.publicKey),
    contentPublicKey: base64Encode(content.publicKey),
  };
}

// Generate a random master secret
export function generateMasterSecret(): string {
  return base64Encode(randomBytes(32));
}
