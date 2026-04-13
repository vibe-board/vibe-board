/**
 * E2EEManager — singleton that manages per-machine secrets, content keypairs, and DEKs.
 *
 * Each machine has its own master secret. Secrets are stored as machineId → base64Secret
 * in localStorage, and keypairs are derived on demand.
 */
import { ContentKeyPair, deriveContentKeyPair } from './keys';
import { unwrapDek as cryptoUnwrapDek } from './crypto';

const MACHINE_SECRETS_KEY = 'vb_e2ee_machine_secrets';
const OLD_STORAGE_KEY = 'vk_e2ee_secrets';

export class E2EEManager {
  private static instance: E2EEManager | null = null;

  /** base64 secret → derived content keypair (cache) */
  private contentKeyPairs: Map<string, ContentKeyPair> = new Map();
  /** machineId → base64 master secret */
  private machineSecrets: Map<string, string> = new Map();
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

  /** Check if any machines are paired */
  get hasPairedSecrets(): boolean {
    return this.machineSecrets.size > 0;
  }

  /** Check if a specific machine is paired */
  isMachinePaired(machineId: string): boolean {
    return this.machineSecrets.has(machineId);
  }

  /** Get the base64 secret for a machine */
  getMachineSecret(machineId: string): string | null {
    return this.machineSecrets.get(machineId) ?? null;
  }

  /** Get all paired machine IDs */
  get pairedMachineIds(): string[] {
    return Array.from(this.machineSecrets.keys());
  }

  /** Pair a machine with a master secret */
  pairMachine(machineId: string, base64Secret: string): void {
    const secretBytes = base64ToBytes(base64Secret);
    if (secretBytes.length !== 32) {
      throw new Error(
        `Master secret must be 32 bytes, got ${secretBytes.length}`
      );
    }

    // Derive and cache keypair
    if (!this.contentKeyPairs.has(base64Secret)) {
      const keypair = deriveContentKeyPair(secretBytes);
      this.contentKeyPairs.set(base64Secret, keypair);
    }

    this.machineSecrets.set(machineId, base64Secret);
    this.saveToStorage();
  }

  /** Unpair a machine */
  unpairMachine(machineId: string): void {
    const secret = this.machineSecrets.get(machineId);
    this.machineSecrets.delete(machineId);

    // Clean up keypair cache if no other machine uses this secret
    if (secret) {
      const stillUsed = Array.from(this.machineSecrets.values()).includes(
        secret
      );
      if (!stillUsed) {
        this.contentKeyPairs.delete(secret);
      }
    }

    this.saveToStorage();
  }

  /** Get the content public key for a specific machine */
  getContentPublicKey(machineId?: string): Uint8Array | null {
    if (machineId) {
      const secret = this.machineSecrets.get(machineId);
      if (!secret) return null;
      const keypair = this.contentKeyPairs.get(secret);
      return keypair ? keypair.publicKey : null;
    }
    // Fallback: first keypair (for backward compat during migration)
    const firstPair = this.contentKeyPairs.values().next().value;
    return firstPair ? firstPair.publicKey : null;
  }

  /**
   * Try to unwrap a DEK using any of our paired content keypairs.
   * Returns the unwrapped DEK or null if no keypair can decrypt it.
   */
  unwrapDek(wrappedDekBase64: string): Uint8Array | null {
    const wrapped = base64ToBytes(wrappedDekBase64);

    for (const keypair of this.contentKeyPairs.values()) {
      try {
        const dek = cryptoUnwrapDek(
          wrapped,
          keypair.secretKey,
          keypair.publicKey
        );
        return dek;
      } catch {
        // Try next keypair
        continue;
      }
    }

    return null;
  }

  /** Remove all paired secrets */
  clearAll(): void {
    this.contentKeyPairs.clear();
    this.machineSecrets.clear();
    this.connectionDeks.clear();
    this.saveToStorage();
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

  /** Load per-machine secrets from localStorage */
  private loadFromStorage(): void {
    // Migrate old global secrets format → clear it (can't map to machines)
    try {
      const old = localStorage.getItem(OLD_STORAGE_KEY);
      if (old) {
        localStorage.removeItem(OLD_STORAGE_KEY);
      }
    } catch {
      // ignore
    }

    try {
      const stored = localStorage.getItem(MACHINE_SECRETS_KEY);
      if (!stored) return;

      const entries: Record<string, string> = JSON.parse(stored);
      for (const [machineId, secret] of Object.entries(entries)) {
        try {
          this.pairMachine(machineId, secret);
        } catch {
          // Skip invalid secrets
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  /** Save per-machine secrets to localStorage */
  private saveToStorage(): void {
    try {
      const entries: Record<string, string> = {};
      for (const [machineId, secret] of this.machineSecrets) {
        entries[machineId] = secret;
      }
      localStorage.setItem(MACHINE_SECRETS_KEY, JSON.stringify(entries));
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
