import { useState, useCallback } from 'react';

interface ControlKeyBarProps {
  onSend: (data: string) => void;
}

interface KeyDef {
  label: string;
  code: string;
  toggle?: boolean;
}

const KEYS: KeyDef[] = [
  { label: 'Ctrl', code: '', toggle: true },
  { label: 'Alt', code: '', toggle: true },
  { label: 'Tab', code: '\x09' },
  { label: 'Esc', code: '\x1b' },
  { label: '↑', code: '\x1b[A' },
  { label: '↓', code: '\x1b[B' },
  { label: '←', code: '\x1b[D' },
  { label: '→', code: '\x1b[C' },
];

const CTRL_MAP: Record<string, string> = {
  a: '\x01', b: '\x02', c: '\x03', d: '\x04', e: '\x05', f: '\x06', g: '\x07',
  h: '\x08', i: '\x09', j: '\x0a', k: '\x0b', l: '\x0c', m: '\x0d', n: '\x0e',
  o: '\x0f', p: '\x10', q: '\x11', r: '\x12', s: '\x13', t: '\x14', u: '\x15',
  v: '\x16', w: '\x17', x: '\x18', y: '\x19', z: '\x1a',
  '[': '\x1b', '\\': '\x1c', ']': '\x1d', '^': '\x1e', '_': '\x1f',
};

export default function ControlKeyBar({ onSend }: ControlKeyBarProps) {
  const [ctrlActive, setCtrlActive] = useState(false);
  const [altActive, setAltActive] = useState(false);

  const handleKey = useCallback(
    (key: KeyDef) => {
      if (key.label === 'Ctrl') {
        setCtrlActive((prev) => !prev);
        return;
      }
      if (key.label === 'Alt') {
        setAltActive((prev) => !prev);
        return;
      }

      let data = key.code;

      if (key.code === '') return;

      if (ctrlActive && key.code.length === 1) {
        const lower = key.code.toLowerCase();
        data = CTRL_MAP[lower] || key.code;
      }

      if (altActive) {
        data = '\x1b' + data;
      }

      setCtrlActive(false);
      setAltActive(false);
      onSend(data);
    },
    [ctrlActive, altActive, onSend],
  );

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-muted border-t border-border overflow-x-auto">
      {KEYS.map((key) => {
        const isActive =
          (key.label === 'Ctrl' && ctrlActive) ||
          (key.label === 'Alt' && altActive);

        return (
          <button
            key={key.label}
            onClick={() => handleKey(key)}
            className={`shrink-0 px-3 py-2 rounded text-sm font-medium transition-colors ${
              isActive
                ? 'bg-foreground text-background'
                : 'bg-background text-foreground border border-border active:bg-accent'
            }`}
          >
            {key.label}
          </button>
        );
      })}
    </div>
  );
}
