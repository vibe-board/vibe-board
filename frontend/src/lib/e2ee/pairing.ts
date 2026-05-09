import { deriveContentKeyPair, type ContentKeyPair } from './keys';
import { useConnectionStore } from '@/stores/connection-store';

// base64Secret -> derived keypair. Derivation is CPU-bound (Ed25519 -> X25519);
// the same secret always derives the same keypair, so caching by secret is correct.
const keyPairCache = new Map<string, ContentKeyPair>();

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function getContentPublicKey(machineId: string): Uint8Array | null {
  const secret = useConnectionStore.getState().machineSecrets[machineId];
  if (!secret) return null;
  let kp = keyPairCache.get(secret);
  if (!kp) {
    kp = deriveContentKeyPair(base64ToBytes(secret));
    keyPairCache.set(secret, kp);
  }
  return kp.publicKey;
}
