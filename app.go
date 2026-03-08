package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"sit/internal/applog"
	"sit/internal/config"
	"sit/internal/terminal"
	"sit/internal/version"
)

// App is the main application struct that serves as the Wails binding target.
type App struct {
	ctx      context.Context
	terminal *terminal.Manager
	config   *config.Manager
}

// NewApp creates a new App application struct.
func NewApp() *App {
	cfgMgr := config.NewManager()
	if err := cfgMgr.Load(); err != nil {
		applog.Error("failed to load config: %v", err)
	}

	return &App{
		terminal: terminal.NewManager(),
		config:   cfgMgr,
	}
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Set PTY output handler to emit Wails events
	a.terminal.SetOutputHandler(func(data string) {
		wailsruntime.EventsEmit(a.ctx, "terminal:output", data)
	})

	// Set PTY exit handler to emit Wails events
	a.terminal.SetExitHandler(func(exitCode int) {
		wailsruntime.EventsEmit(a.ctx, "terminal:exit", exitCode)
	})
}

// domReady is called when the DOM is ready.
func (a *App) domReady(ctx context.Context) {
	// Workaround for WebView2 not accepting keyboard input on initial launch.
	// EnumChildWindows + SetFocus on the Chrome_WidgetWin child window
	// gives the WebView2 control OS-level keyboard focus.
	go func() {
		time.Sleep(100 * time.Millisecond)
		forceReactivate()
		time.Sleep(100 * time.Millisecond)
		// Focus the xterm.js terminal via its internal helper textarea
		wailsruntime.WindowExecJS(a.ctx, `
			(function() {
				var ta = document.querySelector('.xterm-helper-textarea');
				if (ta) ta.focus();
			})()
		`)
	}()
}

// shutdown is called when the app is shutting down.
func (a *App) shutdown(ctx context.Context) {
	a.terminal.Close()
}

// --- Terminal bindings ---

// StartTerminal starts the default shell process.
func (a *App) StartTerminal(cols, rows int) error {
	cfg := a.config.Get()
	return a.terminal.Start(cfg.Shell, nil, nil, cols, rows)
}

// StartTerminalWithCommand starts a specific command with arguments.
// env contains additional environment variables in "KEY=VALUE" format.
// pathAppend contains directories to append to the PATH.
func (a *App) StartTerminalWithCommand(command string, args []string, env []string, pathAppend []string, cols, rows int) error {
	mergedEnv := buildEnv(env, pathAppend)
	return a.terminal.Start(command, args, mergedEnv, cols, rows)
}

// buildEnv constructs a complete environment variable slice by merging
// additional variables and PATH entries into the current process environment.
// Returns nil if both env and pathAppend are empty (inherits parent environment).
func buildEnv(env []string, pathAppend []string) []string {
	if len(env) == 0 && len(pathAppend) == 0 {
		return nil
	}

	base := os.Environ()

	// Append directories to PATH
	if len(pathAppend) > 0 {
		extra := strings.Join(pathAppend, string(os.PathListSeparator))
		found := false
		for i, e := range base {
			if strings.HasPrefix(strings.ToUpper(e), "PATH=") {
				base[i] = e + string(os.PathListSeparator) + extra
				found = true
				break
			}
		}
		if !found {
			base = append(base, "PATH="+extra)
		}
	}

	// Add/override environment variables
	for _, entry := range env {
		key, _, _ := strings.Cut(entry, "=")
		if key == "" {
			continue
		}
		upper := strings.ToUpper(key) + "="
		replaced := false
		for i, e := range base {
			if strings.HasPrefix(strings.ToUpper(e), upper) {
				base[i] = entry
				replaced = true
				break
			}
		}
		if !replaced {
			base = append(base, entry)
		}
	}

	return base
}

// WriteTerminal sends data to the terminal.
func (a *App) WriteTerminal(data string) error {
	return a.terminal.Write(data)
}

// ResizeTerminal changes the terminal size.
func (a *App) ResizeTerminal(cols, rows int) error {
	return a.terminal.Resize(cols, rows)
}

// --- File Dialog ---

// OpenFileDialog opens a native file dialog and returns the selected path.
func (a *App) OpenFileDialog() (string, error) {
	return wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Select Shell Executable",
		Filters: []wailsruntime.FileFilter{
			{DisplayName: "Executables", Pattern: "*.exe;*.bat;*.cmd;*.sh;*.bash"},
			{DisplayName: "All Files", Pattern: "*"},
		},
	})
}

// OpenAudioFileDialog opens a native file dialog for selecting audio files.
func (a *App) OpenAudioFileDialog() (string, error) {
	return wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Select Audio File",
		Filters: []wailsruntime.FileFilter{
			{DisplayName: "Audio Files", Pattern: "*.mp3;*.wav;*.ogg;*.m4a;*.flac;*.aac"},
			{DisplayName: "All Files", Pattern: "*"},
		},
	})
}

// ReadAudioFile reads a local audio file and returns it as a data URI.
func (a *App) ReadAudioFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("failed to read audio file: %w", err)
	}

	// Determine MIME type from extension
	ext := strings.ToLower(filepath.Ext(path))
	mimeType := "audio/mpeg" // default
	switch ext {
	case ".mp3":
		mimeType = "audio/mpeg"
	case ".wav":
		mimeType = "audio/wav"
	case ".ogg":
		mimeType = "audio/ogg"
	case ".m4a", ".aac":
		mimeType = "audio/aac"
	case ".flac":
		mimeType = "audio/flac"
	}

	encoded := base64.StdEncoding.EncodeToString(data)
	return fmt.Sprintf("data:%s;base64,%s", mimeType, encoded), nil
}

// --- Config bindings ---

// GetConfig returns the current configuration.
func (a *App) GetConfig() config.Config {
	return a.config.Get()
}

// GetKeyBindings returns the key bindings map.
func (a *App) GetKeyBindings() map[string]string {
	return a.config.GetKeyBindings()
}

// ResolveAction resolves a key combination to an action name.
func (a *App) ResolveAction(keyCombination string) string {
	return a.config.ResolveAction(keyCombination)
}

// UpdateKeyBinding updates a single key binding.
func (a *App) UpdateKeyBinding(keyCombination, action string) error {
	return a.config.UpdateKeyBinding(keyCombination, action)
}

// UpdateConfig updates the full configuration.
func (a *App) UpdateConfig(cfg config.Config) error {
	return a.config.UpdateConfig(cfg)
}

// GetVersionInfo returns build-time version information.
func (a *App) GetVersionInfo() map[string]string {
	return version.Info()
}
