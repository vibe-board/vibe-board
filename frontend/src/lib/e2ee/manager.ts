/**
 * E2EEManager — singleton that manages paired secrets, content keypairs, and DEKs.
 *
 * Usage:
 *   const mgr = E2EEManager.getInstance();
 *   mgr.addPairedSecret(base64MasterSecret);
 *   const dek = mgr.unwrapDek(wrappedDekBase64);
 */
import { ContentKeyPair, deriveContentKeyPair } from './keys';
import { unwrapDek as cryptoUnwrapDek } from './crypto';

const STORAGE_KEY = 'vk_e2ee_secrets';

export class E2EEManager {
  private static instance: E2EEManager | null = null;

  /** base64 secret → derived content keypair */
  private contentKeyPairs: Map<string, ContentKeyPair> = new Map();
  /** machineId → DEK (per-connection) */
  private connectionDeks: Map<string, Uint8Array> = new Map();

  private constructor() {
    this.loadFromStorage();
  }

  static getInstance(): E2EEManager {
    if (!E2EEManager.instance) {
      E2EEManager.instance = new E2EEManager();
    }
    return E2EEManager.instance;
  }

  /** Check if any paired secrets exist */
  get hasPairedSecrets(): boolean {
    return this.contentKeyPairs.size > 0;
  }

  /** Get all paired secret identifiers (truncated for display) */
  get pairedSecretIds(): string[] {
    return Array.from(this.contentKeyPairs.keys()).map(
      (s) => s.substring(0, 8) + '...',
    );
  }

  /** Add a paired master secret (base64-encoded 32 bytes) */
  addPairedSecret(base64Secret: string): void {
    if (this.contentKeyPairs.has(base64Secret)) return;

    const secretBytes = base64ToBytes(base64Secret);
    if (secretBytes.length !== 32) {
      throw new Error(
        `Master secret must be 32 bytes, got ${secretBytes.length}`,
      );
    }

    const keypair = deriveContentKeyPair(secretBytes);
    this.contentKeyPairs.set(base64Secret, keypair);
    this.saveToStorage();
  }

  /** Remove a paired master secret */
  removePairedSecret(base64Secret: string): void {
    this.contentKeyPairs.delete(base64Secret);
    this.saveToStorage();
  }

  /** Remove all paired secrets */
  clearAll(): void {
    this.contentKeyPairs.clear();
    this.connectionDeks.clear();
    this.saveToStorage();
  }

  /**
   * Try to unwrap a DEK using any of our paired content keypairs.
   * Returns the unwrapped DEK or null if no keypair can decrypt it.
   */
  unwrapDek(wrappedDekBase64: string): Uint8Array | null {
    const wrapped = base64ToBytes(wrappedDekBase64);

    for (const keypair of this.contentKeyPairs.values()) {
      try {
        const dek = cryptoUnwrapDek(wrapped, keypair.secretKey, keypair.publicKey);
        return dek;
      } catch {
        // Try next keypair
        continue;
      }
    }

    return null;
  }

  /** Store a per-connection DEK for a machine */
  setConnectionDek(machineId: string, dek: Uint8Array): void {
    this.connectionDeks.set(machineId, dek);
  }

  /** Get the DEK for a machine connection */
  getConnectionDek(machineId: string): Uint8Array | null {
    return this.connectionDeks.get(machineId) ?? null;
  }

  /** Remove the DEK for a machine connection */
  removeConnectionDek(machineId: string): void {
    this.connectionDeks.delete(machineId);
  }

  /** Load paired secrets from localStorage */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const secrets: string[] = JSON.parse(stored);
      for (const secret of secrets) {
        try {
          this.addPairedSecret(secret);
        } catch {
          // Skip invalid secrets
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  /** Save paired secrets to localStorage */
  private saveToStorage(): void {
    try {
      const secrets = Array.from(this.contentKeyPairs.keys());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(secrets));
    } catch {
      // Ignore storage errors
    }
  }
}

/** Decode base64 to Uint8Array */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
