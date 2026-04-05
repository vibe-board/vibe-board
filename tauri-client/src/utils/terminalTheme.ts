import type { ITheme } from '@xterm/xterm';

/**
 * Convert HSL CSS variable value (e.g., "210 40% 98%") to hex color.
 */
function hslToHex(hslValue: string): string {
  const trimmed = hslValue.trim();
  if (!trimmed) return '#000000';

  const parts = trimmed.split(/\s+/);
  if (parts.length < 3) return '#000000';

  const h = parseFloat(parts[0]) / 360;
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getCssVariable(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/**
 * Build an xterm.js theme from the tauri-client's CSS variables.
 */
export function getTerminalTheme(): ITheme {
  const background = getCssVariable('--background') || '240 10% 3.9%';
  const foreground = getCssVariable('--foreground') || '0 0% 98%';
  const destructive = getCssVariable('--destructive') || '0 84.2% 60.2%';
  const muted = getCssVariable('--muted-foreground') || '240 3.8% 46.1%';

  const isDark = document.documentElement.classList.contains('dark');

  const bgHex = hslToHex(background);
  const fgHex = hslToHex(foreground);
  const redHex = hslToHex(destructive);
  const mutedHex = hslToHex(muted);

  if (isDark) {
    return {
      background: bgHex,
      foreground: fgHex,
      cursor: fgHex,
      cursorAccent: bgHex,
      selectionBackground: '#3d4966',
      selectionForeground: fgHex,
      black: '#1a1a1a',
      red: redHex,
      green: '#4ade80',
      yellow: '#e0af68',
      blue: '#7aa2f7',
      magenta: '#bb9af7',
      cyan: '#7dcfff',
      white: '#c0caf5',
      brightBlack: mutedHex,
      brightRed: redHex,
      brightGreen: '#4ade80',
      brightYellow: '#e0af68',
      brightBlue: '#7aa2f7',
      brightMagenta: '#bb9af7',
      brightCyan: '#7dcfff',
      brightWhite: fgHex,
    };
  } else {
    return {
      background: bgHex,
      foreground: fgHex,
      cursor: fgHex,
      cursorAccent: bgHex,
      selectionBackground: '#accef7',
      selectionForeground: '#1a1a1a',
      black: '#1a1a1a',
      red: redHex,
      green: '#1a7f37',
      yellow: '#946800',
      blue: '#0550ae',
      magenta: '#a626a4',
      cyan: '#0e7490',
      white: '#57606a',
      brightBlack: mutedHex,
      brightRed: redHex,
      brightGreen: '#1a7f37',
      brightYellow: '#7c5800',
      brightBlue: '#0969da',
      brightMagenta: '#8250df',
      brightCyan: '#0891b2',
      brightWhite: fgHex,
    };
  }
}
