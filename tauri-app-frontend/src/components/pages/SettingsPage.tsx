import { useState, useEffect } from 'react';
import { Card, Button, Input, Badge, Separator } from '@/components/ui';
import { invoke } from '@tauri-apps/api/core';

export function SettingsPage() {
  const [version, setVersion] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    invoke<string>('get_app_version').then(setVersion).catch(() => {});
  }, []);

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-1">Settings</h2>
        <p className="text-sm text-text-tertiary">Application preferences</p>
      </div>

      {/* App info */}
      <Card>
        <h3 className="text-sm font-medium text-text-primary mb-3">Application</h3>
        <div className="space-y-2">
          <SettingRow label="Version" value={version || '...'} />
          <SettingRow label="Build" value="Tauri 2.0" />
          <Separator className="my-3" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-text-primary">Theme</div>
              <div className="text-xs text-text-tertiary">Color scheme for the interface</div>
            </div>
            <div className="flex gap-1">
              {(['dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    theme === t ? 'bg-accent/10 text-accent' : 'text-text-tertiary hover:bg-bg-hover'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* E2EE */}
      <Card>
        <h3 className="text-sm font-medium text-text-primary mb-3">End-to-End Encryption</h3>
        <div className="space-y-2">
          <div className="text-xs text-text-tertiary">
            E2EE uses XChaCha20-Poly1305 for payload encryption with BLAKE2b key derivation from a master secret.
            Your gateway never sees plaintext data.
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="info">XChaCha20-Poly1305</Badge>
            <Badge variant="info">Ed25519 Auth</Badge>
            <Badge variant="info">X25519 Key Exchange</Badge>
            <Badge variant="info">BLAKE2b-512 KDF</Badge>
          </div>
        </div>
      </Card>

      {/* Keyboard shortcuts */}
      <Card>
        <h3 className="text-sm font-medium text-text-primary mb-3">Keyboard Shortcuts</h3>
        <div className="space-y-2">
          <ShortcutRow keys={['Ctrl', 'K']} label="Command Palette" />
          <ShortcutRow keys={['Ctrl', 'N']} label="New Task" />
          <ShortcutRow keys={['Ctrl', 'B']} label="Toggle Sidebar" />
          <ShortcutRow keys={['Ctrl', ',']} label="Settings" />
        </div>
      </Card>

      {/* About */}
      <Card>
        <h3 className="text-sm font-medium text-text-primary mb-3">About</h3>
        <div className="text-xs text-text-tertiary space-y-1">
          <p>Vibe Board - Cross-platform desktop and mobile app</p>
          <p>Built with Tauri 2.0 + React + TypeScript</p>
          <p>Supports: macOS, Windows, Linux, iOS, Android</p>
        </div>
      </Card>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm text-text-primary font-mono">{value}</span>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-secondary">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((k) => (
          <kbd key={k} className="kbd">{k}</kbd>
        ))}
      </div>
    </div>
  );
}
