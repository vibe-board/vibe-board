import { ContentKeyPair, deriveContentKeyPair } from './keys';
import { unwrapDek as cryptoUnwrapDek } from './crypto';

const STORAGE_KEY = 'vb_e2ee_secrets';

export class E2EEManager {
  private static instance: E2EEManager | null = null;
  private contentKeyPairs: Map<string, ContentKeyPair> = new Map();
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

  get hasPairedSecrets(): boolean {
    return this.contentKeyPairs.size > 0;
  }

  get pairedSecretIds(): string[] {
    return Array.from(this.contentKeyPairs.keys()).map(
      (s) => s.substring(0, 8) + '...'
    );
  }

  addPairedSecret(base64Secret: string): void {
    if (this.contentKeyPairs.has(base64Secret)) return;
    const secretBytes = base64ToBytes(base64Secret);
    if (secretBytes.length !== 32) {
      throw new Error(
        `Master secret must be 32 bytes, got ${secretBytes.length}`
      );
    }
    const keypair = deriveContentKeyPair(secretBytes);
    this.contentKeyPairs.set(base64Secret, keypair);
    this.saveToStorage();
  }

  removePairedSecret(base64Secret: string): void {
    this.contentKeyPairs.delete(base64Secret);
    this.saveToStorage();
  }

  clearAll(): void {
    this.contentKeyPairs.clear();
    this.connectionDeks.clear();
    this.saveToStorage();
  }

  unwrapDek(wrappedDekBase64: string): Uint8Array | null {
    const wrapped = base64ToBytes(wrappedDekBase64);
    for (const keypair of this.contentKeyPairs.values()) {
      try {
        return cryptoUnwrapDek(wrapped, keypair.secretKey, keypair.publicKey);
      } catch {
        continue;
      }
    }
    return null;
  }

  setConnectionDek(machineId: string, dek: Uint8Array): void {
    this.connectionDeks.set(machineId, dek);
  }

  getConnectionDek(machineId: string): Uint8Array | null {
    return this.connectionDeks.get(machineId) ?? null;
  }

  removeConnectionDek(machineId: string): void {
    this.connectionDeks.delete(machineId);
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const secrets: string[] = JSON.parse(stored);
      for (const secret of secrets) {
        try {
          this.addPairedSecret(secret);
        } catch {
          // Skip invalid
        }
      }
    } catch {
      // Ignore
    }
  }

  private saveToStorage(): void {
    try {
      const secrets = Array.from(this.contentKeyPairs.keys());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(secrets));
    } catch {
      // Ignore
    }
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
