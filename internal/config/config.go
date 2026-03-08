package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"
)

// ShellProfile represents a saved shell configuration.
type ShellProfile struct {
	Name    string   `json:"name"`    // display name
	Command string   `json:"command"` // executable path
	Args    []string `json:"args"`    // command arguments
}

// TerminalKeyBinding represents a key binding for the terminal with optional guard conditions.
// Guards are space-separated conditions prefixed with '&', e.g. "&selected" or "&not-selected".
// When no guard is specified, the binding matches unconditionally.
// Keys that do NOT match any binding are passed through to PTY as-is.
type TerminalKeyBinding struct {
	Key    string `json:"key"`              // key combination, e.g. "Ctrl+Shift+C"
	Guards string `json:"guards,omitempty"` // guard conditions, e.g. "&selected"
	Action string `json:"action"`           // action: "copy", "paste", "none"
}

// BellAction represents an action to perform when the terminal bell (BEL) is triggered.
// Type can be: "play-file", "flash", "no-evil".
type BellAction struct {
	Type string `json:"type"`           // action type
	File string `json:"file,omitempty"` // file path for play-file
}

// Config represents the application configuration.
type Config struct {
	KeyBindings         map[string]string    `json:"keybindings"`
	TerminalKeyBindings []TerminalKeyBinding `json:"terminalKeybindings"`
	BellActions         []BellAction         `json:"bellActions"`
	Shell               string               `json:"shell"`
	FontSize            int                  `json:"fontSize"`
	FontFamily          string               `json:"fontFamily"`
	CommandModeTimeout  int                  `json:"commandModeTimeout"` // seconds, 0 = no timeout
	CommandModePrefix   string               `json:"commandModePrefix"`  // key combo to enter command mode
	OnExit              string               `json:"onExit"`             // "exit" | "restart" | "select"
	StartupBehavior     string               `json:"startupBehavior"`    // "immediate" | "select"
	Theme               string               `json:"theme"`              // preset name
	ThemeOverrides      map[string]string    `json:"themeOverrides"`     // CSS variable overrides
	ShellProfiles       []ShellProfile       `json:"shellProfiles"`
}

// DefaultConfig returns the default configuration.
func DefaultConfig() *Config {
	return &Config{
		KeyBindings: map[string]string{
			"Enter":            "newline",
			"Shift+Enter":      "push",
			"Ctrl+Enter":       "push-and-follow",
			"Ctrl+Shift+Enter": "execute-and-follow",
		},
		Shell:              "",
		FontSize:           14,
		FontFamily:         defaultFontFamily(),
		CommandModeTimeout: 10,
		CommandModePrefix:  "Ctrl+Shift+J",
		OnExit:             "select",
		StartupBehavior:    "immediate",
		Theme:              "light-around-dark",
		ThemeOverrides:     map[string]string{},
		ShellProfiles:      defaultShellProfiles(),
		TerminalKeyBindings: []TerminalKeyBinding{
			{Key: "Ctrl+Shift+C", Action: "copy"},
			{Key: "Ctrl+Shift+V", Action: "paste"},
			{Key: "Ctrl+C", Guards: "&selected", Action: "copy"},
		},
		BellActions: []BellAction{
			{Type: "no-evil"},
		},
	}
}

// defaultShellProfiles returns platform-specific default shell profiles.
func defaultShellProfiles() []ShellProfile {
	switch runtime.GOOS {
	case "windows":
		return []ShellProfile{
			{Name: "cmd.exe", Command: "cmd.exe"},
			{Name: "PowerShell", Command: "powershell.exe"},
		}
	case "darwin":
		return []ShellProfile{
			{Name: "zsh", Command: "zsh"},
		}
	default: // linux and others
		return []ShellProfile{
			{Name: "bash", Command: "bash"},
			{Name: "sh", Command: "sh"},
		}
	}
}

// defaultFontFamily returns platform-specific default font family.
func defaultFontFamily() string {
	switch runtime.GOOS {
	case "darwin":
		return "Menlo, 'JetBrains Mono', monospace"
	default:
		return "Consolas, 'Courier New', monospace"
	}
}

// Manager handles configuration file I/O and runtime access.
type Manager struct {
	mu     sync.RWMutex
	config *Config
	path   string
}

// NewManager creates a new configuration manager.
func NewManager() *Manager {
	return &Manager{
		config: DefaultConfig(),
		path:   configFilePath(),
	}
}

// configFilePath returns the config file path: ~/.app-data/sit/config.json
func configFilePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		// Fallback to current directory
		home = "."
	}
	return filepath.Join(home, ".app-data", "sit", "config.json")
}

// Load reads the configuration from disk. If the file does not exist, defaults are used.
func (m *Manager) Load() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	data, err := os.ReadFile(m.path)
	if err != nil {
		if os.IsNotExist(err) {
			// Use defaults; don't auto-create the config file
			return nil
		}
		return fmt.Errorf("failed to read config file: %w", err)
	}

	cfg := DefaultConfig()
	if err := json.Unmarshal(data, cfg); err != nil {
		return fmt.Errorf("failed to parse config file: %w", err)
	}

	m.config = cfg
	return nil
}

// Save writes the current configuration to disk.
func (m *Manager) Save() error {
	m.mu.RLock()
	cfg := m.config
	m.mu.RUnlock()

	dir := filepath.Dir(m.path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	return os.WriteFile(m.path, data, 0644)
}

// Get returns a copy of the current configuration.
func (m *Manager) Get() Config {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return *m.config
}

// GetKeyBindings returns the current key bindings map.
func (m *Manager) GetKeyBindings() map[string]string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	bindings := make(map[string]string, len(m.config.KeyBindings))
	for k, v := range m.config.KeyBindings {
		bindings[k] = v
	}
	return bindings
}

// ResolveAction returns the action for a given key combination.
func (m *Manager) ResolveAction(keyCombination string) string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if action, ok := m.config.KeyBindings[keyCombination]; ok {
		return action
	}
	return "none"
}

// UpdateKeyBinding sets the action for a key combination and saves.
func (m *Manager) UpdateKeyBinding(keyCombination, action string) error {
	m.mu.Lock()
	m.config.KeyBindings[keyCombination] = action
	m.mu.Unlock()

	return m.Save()
}

// UpdateConfig updates the full configuration and saves.
func (m *Manager) UpdateConfig(cfg Config) error {
	m.mu.Lock()
	m.config = &cfg
	m.mu.Unlock()

	return m.Save()
}
