import type { ITheme } from '@xterm/xterm';

// --- Theme Definitions ---

export interface ThemePreset {
    // UI CSS variables
    ui: Record<string, string>;
    // xterm.js terminal theme
    terminal: ITheme;
}

// Dark UI palette (Catppuccin Mocha inspired)
const DARK_UI: Record<string, string> = {
    '--bg-base': '#1e1e2e',
    '--bg-surface': '#181825',
    '--bg-overlay': '#11111b',
    '--bg-input': '#24243a',
    '--text-primary': '#cdd6f4',
    '--text-secondary': '#a6adc8',
    '--text-muted': '#585b70',
    '--accent-blue': '#89b4fa',
    '--accent-mauve': '#cba6f7',
    '--accent-green': '#a6e3a1',
    '--accent-peach': '#fab387',
    '--border-color': '#313244',
    '--resize-handle': '#45475a',
    '--button-bg': '#89b4fa',
    '--button-hover': '#74c7ec',
    '--button-active': '#b4befe',
    '--scrollbar-thumb': '#45475a',
    '--scrollbar-track': 'transparent',
};

// Light UI palette
const LIGHT_UI: Record<string, string> = {
    '--bg-base': '#eff1f5',
    '--bg-surface': '#e6e9ef',
    '--bg-overlay': '#dce0e8',
    '--bg-input': '#ccd0da',
    '--text-primary': '#4c4f69',
    '--text-secondary': '#5c5f77',
    '--text-muted': '#9ca0b0',
    '--accent-blue': '#1e66f5',
    '--accent-mauve': '#8839ef',
    '--accent-green': '#40a02b',
    '--accent-peach': '#fe640b',
    '--border-color': '#bcc0cc',
    '--resize-handle': '#acb0be',
    '--button-bg': '#1e66f5',
    '--button-hover': '#2a6ef5',
    '--button-active': '#7287fd',
    '--scrollbar-thumb': '#acb0be',
    '--scrollbar-track': 'transparent',
};

// Dark terminal theme (Catppuccin Mocha ANSI colors)
const DARK_TERMINAL: ITheme = {
    background: '#181825',
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    cursorAccent: '#1e1e2e',
    selectionBackground: '#585b7066',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#cba6f7',
    cyan: '#94e2d5',
    white: '#bac2de',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#cba6f7',
    brightCyan: '#94e2d5',
    brightWhite: '#a6adc8',
};

// Light terminal theme (Catppuccin Latte inspired ANSI colors)
const LIGHT_TERMINAL: ITheme = {
    background: '#e6e9ef',
    foreground: '#4c4f69',
    cursor: '#dc8a78',
    cursorAccent: '#eff1f5',
    selectionBackground: '#acb0be66',
    black: '#5c5f77',
    red: '#d20f39',
    green: '#40a02b',
    yellow: '#df8e1d',
    blue: '#1e66f5',
    magenta: '#8839ef',
    cyan: '#179299',
    white: '#bcc0cc',
    brightBlack: '#6c6f85',
    brightRed: '#d20f39',
    brightGreen: '#40a02b',
    brightYellow: '#df8e1d',
    brightBlue: '#1e66f5',
    brightMagenta: '#8839ef',
    brightCyan: '#179299',
    brightWhite: '#acb0be',
};

export const THEME_PRESETS: Record<string, ThemePreset> = {
    'dark-around-dark': { ui: DARK_UI, terminal: DARK_TERMINAL },
    'light-around-dark': { ui: LIGHT_UI, terminal: DARK_TERMINAL },
    'dark-around-light': { ui: DARK_UI, terminal: LIGHT_TERMINAL },
    'light-around-light': { ui: LIGHT_UI, terminal: LIGHT_TERMINAL },
};

export const THEME_NAMES = Object.keys(THEME_PRESETS);

// All CSS variable names used in themes (for override UI)
export const UI_CSS_VARIABLES = Object.keys(DARK_UI);

/**
 * Apply a theme preset with optional overrides.
 * Sets CSS custom properties on <html> and returns the terminal theme for xterm.js.
 */
export function applyTheme(
    presetName: string,
    overrides: Record<string, string> = {},
): ITheme {
    const preset = THEME_PRESETS[presetName] || THEME_PRESETS['light-around-dark'];
    const root = document.documentElement;

    // Apply UI CSS variables
    for (const [key, value] of Object.entries(preset.ui)) {
        root.style.setProperty(key, overrides[key] || value);
    }

    // Build terminal theme with overrides
    const termTheme = { ...preset.terminal };

    // Map CSS-like terminal override keys to ITheme properties
    const terminalOverrideMap: Record<string, keyof ITheme> = {
        '--terminal-background': 'background',
        '--terminal-foreground': 'foreground',
        '--terminal-cursor': 'cursor',
        '--terminal-selection': 'selectionBackground',
    };
    for (const [cssKey, themeKey] of Object.entries(terminalOverrideMap)) {
        if (overrides[cssKey]) {
            (termTheme as any)[themeKey] = overrides[cssKey];
        }
    }

    return termTheme;
}
