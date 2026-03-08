import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import './style.css';

import { StartTerminal, StartTerminalWithCommand, WriteTerminal, ResizeTerminal, GetKeyBindings, GetConfig, UpdateConfig, OpenFileDialog, ReadAudioFile, OpenAudioFileDialog, GetVersionInfo } from '../wailsjs/go/main/App';
import { EventsOn, Quit, BrowserOpenURL } from '../wailsjs/runtime/runtime';
import { config } from '../wailsjs/go/models';
import { applyTheme } from './themes';

// --- State ---
let keyBindings: Record<string, string> = {};
let commandModeActive = false;
let commandModeTimeoutId: ReturnType<typeof setTimeout> | null = null;
let commandModeTimeoutSeconds = 10; // 0 = no timeout
let commandModePrefix = 'Ctrl+Shift+J';
let onExitBehavior = 'select'; // "exit" | "restart" | "select"
let shellProfiles: Array<{ name: string; command: string; args: string[] }> = [];
let terminalKeyBindings: Array<{ key: string; guards: string; action: string }> = [];
let bellActions: Array<{ type: string; file: string }> = [];
let startupBehavior = 'immediate'; // "immediate" | "select"
let currentTheme = 'light-around-dark';
let currentThemeOverrides: Record<string, string> = {};

// --- DOM Elements ---
const terminalContainer = document.getElementById('terminal-container')!;
const inputBox = document.getElementById('input-box')! as HTMLTextAreaElement;
const sendButton = document.getElementById('send-button')!;
const settingsButton = document.getElementById('settings-button')!;
const resizeHandle = document.getElementById('resize-handle')!;

// Settings panel elements
const settingsOverlay = document.getElementById('settings-overlay')!;
const settingsClose = document.getElementById('settings-close')!;
const settingsCancel = document.getElementById('settings-cancel')!;
const settingsSave = document.getElementById('settings-save')!;
const settingFontFamily = document.getElementById('setting-font-family')! as HTMLInputElement;
const settingFontSize = document.getElementById('setting-font-size')! as HTMLInputElement;
const settingShell = document.getElementById('setting-shell')! as HTMLInputElement;
const settingOnExit = document.getElementById('setting-on-exit')! as HTMLSelectElement;
const settingCmdTimeout = document.getElementById('setting-cmd-timeout')! as HTMLInputElement;
const settingCmdPrefix = document.getElementById('setting-cmd-prefix')! as HTMLInputElement;
const keybindingRows = document.getElementById('keybinding-rows')!;
const addKeybindingBtn = document.getElementById('add-keybinding')!;
const terminalKeybindingRows = document.getElementById('terminal-keybinding-rows')!;
const addTerminalKeybindingBtn = document.getElementById('add-terminal-keybinding')!;
const shellProfileRowsContainer = document.getElementById('shell-profile-rows')!;
const bellActionRows = document.getElementById('bell-action-rows')!;
const addBellActionBtn = document.getElementById('add-bell-action')!;
const bellIndicator = document.getElementById('bell-indicator')!;
const addShellProfileBtn = document.getElementById('add-shell-profile')!;

// Command mode indicator
const commandModeIndicator = document.getElementById('command-mode-indicator')!;

// Shell selection overlay elements
const shellSelectOverlay = document.getElementById('shell-select-overlay')!;
const shellSelectTitle = document.getElementById('shell-select-title')!;
const shellProfilesList = document.getElementById('shell-profiles-list')!;
const shellRestartDefaultBtn = document.getElementById('shell-restart-default')!;
const shellExitAppBtn = document.getElementById('shell-exit-app')!;

// --- Terminal Setup ---
const terminal = new Terminal({
    fontFamily: "'JetBrains Mono', 'Consolas', 'Courier New', monospace",
    fontSize: 14,
    theme: {
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
    },
    cursorBlink: true,
    cursorStyle: 'bar',
    allowProposedApi: true,
});

const fitAddon = new FitAddon();
const webLinksAddon = new WebLinksAddon();

terminal.loadAddon(fitAddon);
terminal.loadAddon(webLinksAddon);
terminal.open(terminalContainer);

// Fit terminal to container
function fitTerminal(): void {
    fitAddon.fit();
}
fitTerminal();

// --- Bell Handler ---

function executeBellActions(): void {
    for (const action of bellActions) {
        switch (action.type) {
            case 'flash':
                terminalContainer.classList.remove('visual-bell-flash');
                // Force reflow to restart animation
                void terminalContainer.offsetWidth;
                terminalContainer.classList.add('visual-bell-flash');
                setTimeout(() => terminalContainer.classList.remove('visual-bell-flash'), 200);
                break;
            case 'no-evil': {
                bellIndicator.textContent = '\u{1F649}'; // 🙉
                bellIndicator.classList.remove('hidden');
                setTimeout(() => {
                    bellIndicator.textContent = '\u{1F648}'; // 🙈
                    setTimeout(() => {
                        bellIndicator.classList.add('hidden');
                        bellIndicator.textContent = '';
                    }, 250);
                }, 250);
                break;
            }
            case 'play-file':
                if (action.file) {
                    // Load via Go backend (converts local path to data URI)
                    ReadAudioFile(action.file).then((dataUri) => {
                        const audio = new Audio(dataUri);
                        audio.play().catch(console.error);
                    }).catch((err) => {
                        console.error('Failed to load bell sound:', err);
                    });
                }
                break;
        }
    }
}

terminal.onBell(() => {
    executeBellActions();
});

// --- Wails Event Listeners ---

// Receive PTY output
EventsOn('terminal:output', (data: string) => {
    terminal.write(data);
});

// Handle shell exit
EventsOn('terminal:exit', (_exitCode: number) => {
    terminal.writeln('\r\n\x1b[90m[Shell process exited]\x1b[0m\r\n');
    handleShellExit();
});

// Forward xterm.js key input to Go backend
terminal.onData((data: string) => {
    WriteTerminal(data).catch(console.error);
});

// Handle terminal resize
terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
    ResizeTerminal(cols, rows).catch(console.error);
});

// Observe container size changes
const resizeObserver = new ResizeObserver(() => {
    fitTerminal();
});
resizeObserver.observe(terminalContainer);

// ==================== Shell Exit Handling ====================

function handleShellExit(): void {
    switch (onExitBehavior) {
        case 'exit':
            Quit();
            break;
        case 'restart':
            restartDefaultShell();
            break;
        case 'select':
        default:
            showShellSelection();
            break;
    }
}

async function restartDefaultShell(): Promise<void> {
    terminal.reset();
    const { cols, rows } = terminal;
    try {
        await StartTerminal(cols, rows);
        terminal.focus();
    } catch (err) {
        terminal.writeln(`\x1b[31mFailed to restart shell: ${err}\x1b[0m`);
    }
}

async function startShellWithCommand(command: string, args: string[]): Promise<void> {
    shellSelectOverlay.classList.add('hidden');
    terminal.reset();
    const { cols, rows } = terminal;
    try {
        await StartTerminalWithCommand(command, args, cols, rows);
        terminal.focus();
    } catch (err) {
        terminal.writeln(`\x1b[31mFailed to start shell: ${err}\x1b[0m`);
        showShellSelection();
    }
}

function showShellSelection(isStartup: boolean = false): void {
    // Set title based on context
    shellSelectTitle.textContent = isStartup ? 'Select Shell' : 'Shell Exited';

    // Populate profile cards
    shellProfilesList.innerHTML = '';
    for (const profile of shellProfiles) {
        const card = document.createElement('div');
        card.className = 'shell-profile-card';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'profile-name';
        nameSpan.textContent = profile.name;

        const cmdSpan = document.createElement('span');
        cmdSpan.className = 'profile-command';
        const fullCmd = [profile.command, ...(profile.args || [])].join(' ');
        cmdSpan.textContent = fullCmd;

        card.appendChild(nameSpan);
        card.appendChild(cmdSpan);

        card.addEventListener('click', () => {
            startShellWithCommand(profile.command, profile.args || []);
        });

        shellProfilesList.appendChild(card);
    }

    shellSelectOverlay.classList.remove('hidden');
    // Auto-focus Exit Application so user can press Enter to exit
    requestAnimationFrame(() => shellExitAppBtn.focus());
}

// Browse button for Default Shell in settings panel
document.getElementById('setting-shell-browse')!.addEventListener('click', async () => {
    try {
        const path = await OpenFileDialog();
        if (path) {
            settingShell.value = path;
        }
    } catch (err) {
        console.error('File dialog error:', err);
    }
});

shellRestartDefaultBtn.addEventListener('click', () => {
    shellSelectOverlay.classList.add('hidden');
    restartDefaultShell();
});

shellExitAppBtn.addEventListener('click', () => {
    Quit();
});

// Settings button in shell selection overlay
let shellSelectWasOpen = false;
document.getElementById('shell-open-settings')!.addEventListener('click', () => {
    shellSelectWasOpen = true;
    shellSelectOverlay.classList.add('hidden');
    openSettings();
});

// ==================== Command Mode ====================

function enterCommandMode(): void {
    if (commandModeActive) return;
    commandModeActive = true;
    commandModeIndicator.classList.remove('hidden');

    // Set timeout if configured
    if (commandModeTimeoutSeconds > 0) {
        commandModeTimeoutId = setTimeout(() => {
            exitCommandMode();
        }, commandModeTimeoutSeconds * 1000);
    }
}

function exitCommandMode(): void {
    if (!commandModeActive) return;
    commandModeActive = false;
    commandModeIndicator.classList.add('hidden');

    if (commandModeTimeoutId !== null) {
        clearTimeout(commandModeTimeoutId);
        commandModeTimeoutId = null;
    }
}

function handleCommandModeKey(e: KeyboardEvent): boolean {
    // Strictly require NO modifier keys for action keys
    const hasModifiers = e.ctrlKey || e.shiftKey || e.altKey || e.metaKey;

    if (!hasModifiers && e.key === 'j') {
        // J (no modifiers) → focus input box
        e.preventDefault(); // prevent 'j' from being typed
        exitCommandMode();
        // Defer focus to next frame so the keystroke is fully consumed
        requestAnimationFrame(() => inputBox.focus());
        return false;
    }

    if (!hasModifiers && e.key === 'Tab') {
        // Tab (no modifiers) → focus input box (same as J, for convenience)
        e.preventDefault();
        exitCommandMode();
        requestAnimationFrame(() => inputBox.focus());
        return false;
    }

    if (!hasModifiers && e.key === 'Escape') {
        // Escape (no modifiers) → cancel command mode
        e.preventDefault();
        exitCommandMode();
        terminal.focus();
        return false;
    }

    // Ignore modifier-only key events (Ctrl, Shift being released)
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return false; // swallow modifier key events in command mode
    }

    // Any other key with no modifiers → unknown command, exit
    if (!hasModifiers) {
        e.preventDefault();
        exitCommandMode();
        return false;
    }

    // Key with modifiers (e.g. Ctrl+Shift still held) → ignore, stay in command mode
    e.preventDefault();
    return false;
}

// Intercept keys at the xterm.js level before they reach PTY
terminal.attachCustomKeyEventHandler((e: KeyboardEvent): boolean => {
    // Only handle keydown events
    if (e.type !== 'keydown') return true;

    // Check for command mode prefix (configurable)
    if (buildKeyCombination(e) === commandModePrefix) {
        e.preventDefault();
        enterCommandMode();
        return false; // prevent this key from reaching PTY
    }

    // If in command mode, handle command keys
    if (commandModeActive) {
        return handleCommandModeKey(e);
    }

    // Normal mode: match against terminal key bindings
    const combo = buildKeyCombination(e);
    const comboUpper = combo.toUpperCase();
    const hasSelection = !!terminal.getSelection();

    for (const binding of terminalKeyBindings) {
        if (binding.key.toUpperCase() !== comboUpper) continue;

        // Evaluate guard conditions
        if (binding.guards) {
            const guards = binding.guards.split(/\s+/).filter(Boolean);
            let allMet = true;
            for (const g of guards) {
                if (g === '&selected' && !hasSelection) { allMet = false; break; }
                if (g === '&not-selected' && hasSelection) { allMet = false; break; }
                // Unknown guards are ignored (treated as met)
            }
            if (!allMet) continue;
        }

        // Binding matched → execute action and block PTY
        e.preventDefault();
        switch (binding.action) {
            case 'copy': {
                const sel = terminal.getSelection();
                if (sel) {
                    navigator.clipboard.writeText(sel).catch(console.error);
                    terminal.clearSelection();
                }
                break;
            }
            case 'paste':
                navigator.clipboard.readText().then((text) => {
                    if (text) WriteTerminal(text);
                }).catch(console.error);
                break;
            case 'none':
                break;
        }
        return false;
    }

    // No binding matched → let key through to PTY
    return true;
});

// --- Key Bindings ---

async function loadKeyBindings(): Promise<void> {
    try {
        keyBindings = await GetKeyBindings();
    } catch (err) {
        console.error('Failed to load key bindings:', err);
        keyBindings = {
            'Enter': 'newline',
            'Shift+Enter': 'push',
            'Ctrl+Enter': 'push-and-follow',
        };
    }
}

function buildKeyCombination(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    parts.push(e.key);
    return parts.join('+');
}

// Push text to terminal with options for appending Enter and moving focus.
function pushToTerminal(options: { appendEnter?: boolean; followFocus?: boolean } = {}): void {
    const text = inputBox.value;
    const toSend = options.appendEnter ? text + '\r' : text;
    WriteTerminal(toSend).catch(console.error);
    inputBox.value = '';

    if (options.followFocus) {
        terminal.focus();
    } else {
        inputBox.focus();
    }
}

// Dispatch an action by name.
function dispatchAction(action: string): void {
    switch (action) {
        case 'push':
            pushToTerminal();
            break;
        case 'push-and-follow':
            pushToTerminal({ followFocus: true });
            break;
        case 'execute':
            pushToTerminal({ appendEnter: true });
            break;
        case 'execute-and-follow':
            pushToTerminal({ appendEnter: true, followFocus: true });
            break;
        // Legacy compat
        case 'send':
            pushToTerminal();
            break;
    }
}

// --- Input Box Event Handling ---

const ACTION_SET = new Set(['push', 'push-and-follow', 'execute', 'execute-and-follow', 'send']);

inputBox.addEventListener('keydown', (e: KeyboardEvent) => {
    const combo = buildKeyCombination(e);
    const action = keyBindings[combo];

    if (action && ACTION_SET.has(action)) {
        e.preventDefault();
        dispatchAction(action);
    } else if (action === 'newline') {
        // Let default behavior handle newline insertion
    } else if (action === 'none') {
        e.preventDefault();
    }
    // If no binding exists, let the default behavior through
});

sendButton.addEventListener('click', () => {
    pushToTerminal();
});

// --- Resize Handle ---

let isResizing = false;
let startY = 0;
let startTerminalHeight = 0;

resizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
    isResizing = true;
    startY = e.clientY;
    startTerminalHeight = terminalContainer.offsetHeight;
    document.body.classList.add('resizing');
    resizeHandle.classList.add('active');
    e.preventDefault();
});

document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isResizing) return;

    const deltaY = e.clientY - startY;
    const newHeight = Math.max(100, startTerminalHeight + deltaY);
    const maxHeight = window.innerHeight - 80;
    terminalContainer.style.height = `${Math.min(newHeight, maxHeight)}px`;
    terminalContainer.style.flex = 'none';
    fitTerminal();
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        document.body.classList.remove('resizing');
        resizeHandle.classList.remove('active');
    }
});

// ==================== Settings Panel ====================

const AVAILABLE_ACTIONS = ['push', 'push-and-follow', 'execute', 'execute-and-follow', 'newline', 'none'];
const TERMINAL_AVAILABLE_ACTIONS = ['copy', 'paste', 'none'];
const BELL_ACTION_TYPES = ['no-evil', 'flash', 'play-file'];

function openSettings(): void {
    // Load current config into form
    GetConfig().then((cfg) => {
        settingFontFamily.value = cfg.fontFamily || '';
        settingFontSize.value = String(cfg.fontSize || 14);
        settingShell.value = cfg.shell || '';
        settingOnExit.value = cfg.onExit || 'select';
        (document.getElementById('setting-on-startup') as HTMLSelectElement).value = cfg.startupBehavior || 'immediate';
        (document.getElementById('setting-theme') as HTMLSelectElement).value = cfg.theme || 'light-around-dark';
        settingCmdTimeout.value = String(cfg.commandModeTimeout ?? 10);
        settingCmdPrefix.value = cfg.commandModePrefix || 'Ctrl+Shift+J';

        // Populate terminal key bindings
        terminalKeybindingRows.innerHTML = '';
        const tBindings = cfg.terminalKeybindings || [];
        for (const tb of tBindings) {
            addTerminalKeybindingRow(tb.key || '', tb.guards || '', tb.action || 'none');
        }

        // Populate bell actions
        bellActionRows.innerHTML = '';
        const bActions = cfg.bellActions || [];
        for (const ba of bActions) {
            addBellActionRow(ba.type || 'no-evil', ba.file || '');
        }

        // Populate shell profiles
        shellProfileRowsContainer.innerHTML = '';
        const profiles = cfg.shellProfiles || [];
        for (const profile of profiles) {
            addShellProfileRow(profile.name, profile.command, (profile.args || []).join(' '));
        }

        // Populate key bindings
        keybindingRows.innerHTML = '';
        const bindings = cfg.keybindings || {};
        for (const [key, action] of Object.entries(bindings)) {
            addKeybindingRow(key, action);
        }

        settingsOverlay.classList.remove('hidden');
    }).catch(console.error);
}

function closeSettings(): void {
    settingsOverlay.classList.add('hidden');
    if (shellSelectWasOpen) {
        shellSelectWasOpen = false;
        showShellSelection(true);
    } else {
        terminal.focus();
    }
}

function addKeybindingRow(key: string = '', action: string = 'none'): void {
    const row = document.createElement('div');
    row.className = 'keybinding-row';

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.value = key;
    keyInput.placeholder = 'e.g. Ctrl+Enter';

    const actionSelect = document.createElement('select');
    for (const act of AVAILABLE_ACTIONS) {
        const option = document.createElement('option');
        option.value = act;
        option.textContent = act;
        if (act === action) option.selected = true;
        actionSelect.appendChild(option);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'keybinding-delete';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.title = 'Remove';
    deleteBtn.addEventListener('click', () => {
        row.remove();
    });

    row.appendChild(keyInput);
    row.appendChild(actionSelect);
    row.appendChild(deleteBtn);
    keybindingRows.appendChild(row);
}

function addTerminalKeybindingRow(key: string = '', guards: string = '', action: string = 'none'): void {
    const row = document.createElement('div');
    row.className = 'keybinding-row terminal-keybinding-row';

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.value = key;
    keyInput.placeholder = 'e.g. Ctrl+Shift+C';

    const guardsInput = document.createElement('input');
    guardsInput.type = 'text';
    guardsInput.value = guards;
    guardsInput.placeholder = 'e.g. &selected';

    const actionSelect = document.createElement('select');
    for (const act of TERMINAL_AVAILABLE_ACTIONS) {
        const option = document.createElement('option');
        option.value = act;
        option.textContent = act;
        if (act === action) option.selected = true;
        actionSelect.appendChild(option);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'keybinding-delete';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.title = 'Remove';
    deleteBtn.addEventListener('click', () => {
        row.remove();
    });

    row.appendChild(keyInput);
    row.appendChild(guardsInput);
    row.appendChild(actionSelect);
    row.appendChild(deleteBtn);
    terminalKeybindingRows.appendChild(row);
}

function addBellActionRow(type: string = 'no-evil', file: string = ''): void {
    const row = document.createElement('div');
    row.className = 'bell-action-row';

    const typeSelect = document.createElement('select');
    for (const t of BELL_ACTION_TYPES) {
        const option = document.createElement('option');
        option.value = t;
        option.textContent = t;
        if (t === type) option.selected = true;
        typeSelect.appendChild(option);
    }

    const fileWrapper = document.createElement('div');
    fileWrapper.className = 'file-input-wrapper' + (type !== 'play-file' ? ' hidden-field' : '');
    const fileInput = document.createElement('input');
    fileInput.type = 'text';
    fileInput.value = file;
    fileInput.placeholder = 'Audio file path';
    const browseBtn = document.createElement('button');
    browseBtn.className = 'keybinding-delete';
    browseBtn.textContent = '...';
    browseBtn.title = 'Browse';
    browseBtn.addEventListener('click', async () => {
        try {
            const path = await OpenAudioFileDialog();
            if (path) fileInput.value = path;
        } catch (err) {
            console.error('File dialog error:', err);
        }
    });
    fileWrapper.appendChild(fileInput);
    fileWrapper.appendChild(browseBtn);

    typeSelect.addEventListener('change', () => {
        if (typeSelect.value === 'play-file') {
            fileWrapper.classList.remove('hidden-field');
        } else {
            fileWrapper.classList.add('hidden-field');
        }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'keybinding-delete';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.title = 'Remove';
    deleteBtn.addEventListener('click', () => {
        row.remove();
    });

    row.appendChild(typeSelect);
    row.appendChild(fileWrapper);
    row.appendChild(deleteBtn);
    bellActionRows.appendChild(row);
}

function addShellProfileRow(name: string = '', command: string = '', args: string = ''): void {
    const row = document.createElement('div');
    row.className = 'shell-profile-row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = name;
    nameInput.placeholder = 'Name';

    const cmdInput = document.createElement('input');
    cmdInput.type = 'text';
    cmdInput.value = command;
    cmdInput.placeholder = 'Command';

    const argsInput = document.createElement('input');
    argsInput.type = 'text';
    argsInput.value = args;
    argsInput.placeholder = 'Args (space-separated)';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'keybinding-delete';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.title = 'Remove';
    deleteBtn.addEventListener('click', () => {
        row.remove();
    });

    row.appendChild(nameInput);
    row.appendChild(cmdInput);
    row.appendChild(argsInput);
    row.appendChild(deleteBtn);
    shellProfileRowsContainer.appendChild(row);
}

interface CollectedSettings {
    fontFamily: string;
    fontSize: number;
    shell: string;
    keybindings: Record<string, string>;
    terminalKeybindings: Array<{ key: string; guards: string; action: string }>;
    bellActions: Array<{ type: string; file: string }>;
    commandModeTimeout: number;
    commandModePrefix: string;
    onExit: string;
    startupBehavior: string;
    theme: string;
    themeOverrides: Record<string, string>;
    shellProfiles: Array<{ name: string; command: string; args: string[] }>;
}

function collectSettingsFromForm(): CollectedSettings {
    const fontSize = parseInt(settingFontSize.value, 10) || 14;
    const cmdTimeout = parseInt(settingCmdTimeout.value, 10);
    const keybindings: Record<string, string> = {};

    const rows = keybindingRows.querySelectorAll('.keybinding-row');
    rows.forEach((row) => {
        const keyInput = row.querySelector('input[type="text"]') as HTMLInputElement;
        const actionSelect = row.querySelector('select') as HTMLSelectElement;
        const key = keyInput.value.trim();
        if (key) {
            keybindings[key] = actionSelect.value;
        }
    });

    // Collect shell profiles
    const profiles: Array<{ name: string; command: string; args: string[] }> = [];
    const profileRows = shellProfileRowsContainer.querySelectorAll('.shell-profile-row');
    profileRows.forEach((row) => {
        const inputs = row.querySelectorAll('input');
        const pName = inputs[0]?.value.trim() || '';
        const pCmd = inputs[1]?.value.trim() || '';
        const pArgs = inputs[2]?.value.trim().split(/\s+/).filter(Boolean) || [];
        if (pCmd) {
            profiles.push({ name: pName || pCmd, command: pCmd, args: pArgs });
        }
    });

    // Collect terminal key bindings
    const tKeybindings: Array<{ key: string; guards: string; action: string }> = [];
    const tRows = terminalKeybindingRows.querySelectorAll('.terminal-keybinding-row');
    tRows.forEach((row) => {
        const inputs = row.querySelectorAll('input[type="text"]');
        const actionSelect = row.querySelector('select') as HTMLSelectElement;
        const tKey = (inputs[0] as HTMLInputElement).value.trim();
        const tGuards = (inputs[1] as HTMLInputElement).value.trim();
        if (tKey) {
            tKeybindings.push({ key: tKey, guards: tGuards, action: actionSelect.value });
        }
    });

    // Collect bell actions
    const bActions: Array<{ type: string; file: string }> = [];
    const bRows = bellActionRows.querySelectorAll('.bell-action-row');
    bRows.forEach((row) => {
        const typeSelect = row.querySelector('select') as HTMLSelectElement;
        const fileInput = row.querySelector('input[type="text"]') as HTMLInputElement | null;
        bActions.push({ type: typeSelect.value, file: fileInput?.value.trim() || '' });
    });

    return {
        fontFamily: settingFontFamily.value.trim(),
        fontSize: Math.max(8, Math.min(32, fontSize)),
        shell: settingShell.value.trim(),
        keybindings,
        terminalKeybindings: tKeybindings,
        bellActions: bActions,
        commandModeTimeout: isNaN(cmdTimeout) ? 10 : Math.max(0, cmdTimeout),
        commandModePrefix: settingCmdPrefix.value.trim() || 'Ctrl+Shift+J',
        onExit: settingOnExit.value,
        startupBehavior: (document.getElementById('setting-on-startup') as HTMLSelectElement).value,
        theme: (document.getElementById('setting-theme') as HTMLSelectElement).value,
        themeOverrides: currentThemeOverrides,
        shellProfiles: profiles,
    };
}

async function saveSettings(): Promise<void> {
    const settings = collectSettingsFromForm();

    try {
        await UpdateConfig(config.Config.createFrom({
            fontFamily: settings.fontFamily,
            fontSize: settings.fontSize,
            shell: settings.shell,
            keybindings: settings.keybindings,
            terminalKeybindings: settings.terminalKeybindings,
            bellActions: settings.bellActions,
            commandModeTimeout: settings.commandModeTimeout,
            commandModePrefix: settings.commandModePrefix,
            onExit: settings.onExit,
            startupBehavior: settings.startupBehavior,
            theme: settings.theme,
            themeOverrides: settings.themeOverrides,
            shellProfiles: settings.shellProfiles,
        }));

        // Apply font changes immediately
        terminal.options.fontFamily = settings.fontFamily || "'JetBrains Mono', 'Consolas', 'Courier New', monospace";
        terminal.options.fontSize = settings.fontSize;
        fitTerminal();

        // Update input box font
        inputBox.style.fontFamily = settings.fontFamily || "'JetBrains Mono', 'Consolas', 'Courier New', monospace";
        inputBox.style.fontSize = `${settings.fontSize - 1}px`;

        // Apply command mode settings
        commandModeTimeoutSeconds = settings.commandModeTimeout;
        commandModePrefix = settings.commandModePrefix;

        // Apply exit behavior and profiles
        onExitBehavior = settings.onExit;
        shellProfiles = settings.shellProfiles;
        startupBehavior = settings.startupBehavior;

        // Apply theme
        currentTheme = settings.theme;
        currentThemeOverrides = settings.themeOverrides;
        const termTheme = applyTheme(currentTheme, currentThemeOverrides);
        terminal.options.theme = termTheme;

        // Apply terminal key bindings
        terminalKeyBindings = settings.terminalKeybindings;

        // Apply bell actions
        bellActions = settings.bellActions;

        // Reload key bindings
        keyBindings = settings.keybindings;

        closeSettings();
    } catch (err) {
        console.error('Failed to save settings:', err);
        alert('Failed to save settings. Check console for details.');
    }
}

// Settings button events
settingsButton.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
settingsCancel.addEventListener('click', closeSettings);
settingsSave.addEventListener('click', saveSettings);

// Close settings on Escape key
document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
        if (!aboutOverlay.classList.contains('hidden')) {
            closeAbout();
        } else if (!settingsOverlay.classList.contains('hidden')) {
            closeSettings();
        }
    }
});

// ==================== About Dialog ====================

const aboutOverlay = document.getElementById('about-overlay')!;
const aboutButton = document.getElementById('about-button')!;
const aboutClose = document.getElementById('about-close')!;

async function openAbout(): Promise<void> {
    try {
        const info = await GetVersionInfo();
        document.getElementById('about-version')!.textContent = info.version || 'dev';
        document.getElementById('about-build-date')!.textContent = info.buildDate || 'unknown';
        document.getElementById('about-go-version')!.textContent = info.goVersion || '';
        document.getElementById('about-platform')!.textContent = `${info.os}/${info.arch}`;
    } catch (err) {
        console.error('Failed to get version info:', err);
    }
    aboutOverlay.classList.remove('hidden');
}

function closeAbout(): void {
    aboutOverlay.classList.add('hidden');
    terminal.focus();
}

aboutButton.addEventListener('click', openAbout);
aboutClose.addEventListener('click', closeAbout);

// Open GitHub link in external browser
document.getElementById('about-github-link')!.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    BrowserOpenURL('https://github.com/aki-kuramoto/sit');
});

// ==================== Focus Management ====================

function getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(
        container.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
    ).filter(el => el.offsetParent !== null); // visible only
}

function trapFocus(container: HTMLElement, e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
        if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
        }
    } else {
        if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
}

// Focus trap for settings panel
const settingsPanel = document.getElementById('settings-panel')!;
settingsPanel.addEventListener('keydown', (e: KeyboardEvent) => {
    trapFocus(settingsPanel, e);
});

// Focus trap for shell selection overlay
const shellSelectPanel = document.getElementById('shell-select-panel')!;
shellSelectPanel.addEventListener('keydown', (e: KeyboardEvent) => {
    trapFocus(shellSelectPanel, e);
});

// Main screen Tab cycling: inputBox ↔ settingsButton ↔ sendButton (then back to terminal via Ctrl+Shift+Tab from sendButton → terminal)
// Terminal uses Ctrl+Shift+Tab instead of Tab (handled in attachCustomKeyEventHandler)
terminalContainer.setAttribute('tabindex', '0');
terminalContainer.addEventListener('focus', () => {
    terminal.focus();
});

document.addEventListener('keydown', (e: KeyboardEvent) => {
    // Only handle on main screen (no modal open)
    if (!settingsOverlay.classList.contains('hidden')) return;
    if (!shellSelectOverlay.classList.contains('hidden')) return;

    if (e.key !== 'Tab') return;

    // Tab cycling for non-terminal elements: inputBox → settingsButton → sendButton → terminal
    const mainFocusOrder: HTMLElement[] = [inputBox, settingsButton, sendButton];
    const activeEl = document.activeElement;

    // Find current position in focus order
    let idx = -1;
    for (let i = 0; i < mainFocusOrder.length; i++) {
        if (activeEl === mainFocusOrder[i] || mainFocusOrder[i].contains(activeEl as Node)) {
            idx = i;
            break;
        }
    }
    if (idx === -1) return; // terminal or unmanaged, let browser/xterm handle

    e.preventDefault();
    if (e.shiftKey) {
        if (idx === 0) {
            // Shift+Tab from inputBox → go to terminal
            terminal.focus();
        } else {
            mainFocusOrder[idx - 1].focus();
        }
    } else {
        if (idx === mainFocusOrder.length - 1) {
            // Tab from sendButton → go to terminal
            terminal.focus();
        } else {
            mainFocusOrder[idx + 1].focus();
        }
    }
});

// Add key binding button
addKeybindingBtn.addEventListener('click', () => {
    addKeybindingRow();
});

// Add terminal key binding button
addTerminalKeybindingBtn.addEventListener('click', () => {
    addTerminalKeybindingRow();
});

// Add bell action button
addBellActionBtn.addEventListener('click', () => {
    addBellActionRow();
});

// Add shell profile button
addShellProfileBtn.addEventListener('click', () => {
    addShellProfileRow();
});

// Font size / timeout +/- buttons (use event delegation for dynamic elements)
document.addEventListener('click', (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest('.num-btn') as HTMLElement | null;
    if (!btn) return;
    const targetId = btn.dataset.target!;
    const input = document.getElementById(targetId) as HTMLInputElement;
    if (!input) return;
    const delta = parseInt(btn.dataset.delta!, 10);
    const current = parseInt(input.value, 10) || 0;
    const min = parseInt(input.min, 10) || 0;
    const max = parseInt(input.max, 10) || 999;
    input.value = String(Math.max(min, Math.min(max, current + delta)));
});

// ==================== Startup ====================

async function init(): Promise<void> {
    // Load config and apply settings
    try {
        const cfg = await GetConfig();
        if (cfg.fontFamily) {
            terminal.options.fontFamily = cfg.fontFamily;
            inputBox.style.fontFamily = cfg.fontFamily;
        }
        if (cfg.fontSize) {
            terminal.options.fontSize = cfg.fontSize;
            inputBox.style.fontSize = `${cfg.fontSize - 1}px`;
        }
        if (cfg.commandModeTimeout !== undefined) {
            commandModeTimeoutSeconds = cfg.commandModeTimeout;
        }
        if (cfg.commandModePrefix) {
            commandModePrefix = cfg.commandModePrefix;
        }
        if (cfg.onExit) {
            onExitBehavior = cfg.onExit;
        }
        if (cfg.shellProfiles) {
            shellProfiles = cfg.shellProfiles;
        }
        if (cfg.terminalKeybindings) {
            terminalKeyBindings = cfg.terminalKeybindings.map(tb => ({
                key: tb.key || '',
                guards: tb.guards || '',
                action: tb.action || 'none',
            }));
        }
        if (cfg.bellActions) {
            bellActions = cfg.bellActions.map(ba => ({
                type: ba.type || 'no-evil',
                file: ba.file || '',
            }));
        }
        if (cfg.startupBehavior) {
            startupBehavior = cfg.startupBehavior;
        }

        // Apply theme
        currentTheme = cfg.theme || 'light-around-dark';
        currentThemeOverrides = cfg.themeOverrides || {};
        const termTheme = applyTheme(currentTheme, currentThemeOverrides);
        terminal.options.theme = termTheme;
    } catch (err) {
        console.error('Failed to load config:', err);
    }

    await loadKeyBindings();

    // Fit after font changes
    fitTerminal();

    // Start PTY based on startup behavior
    if (startupBehavior === 'select') {
        showShellSelection(true);
    } else {
        const { cols, rows } = terminal;
        try {
            await StartTerminal(cols, rows);
        } catch (err) {
            terminal.writeln(`\x1b[31mFailed to start terminal: ${err}\x1b[0m`);
        }
    }

    // Focus is set by Go-side domReady via forceReactivate + WindowExecJS
}

// Click on terminal container should always focus the terminal
terminalContainer.addEventListener('mousedown', () => {
    terminal.focus();
});

init();
