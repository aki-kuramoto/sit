//go:build linux

package main

import (
	"os/exec"
	"strings"
	"sync"

	"sit/internal/applog"
)

var (
	linuxOnce      sync.Once
	linuxIMEMethod string // "ibus", "fcitx5", or ""
	savedEngine    string
	linuxMu        sync.Mutex
)

func detectIMEMethod() {
	linuxOnce.Do(func() {
		// Check for fcitx5-remote first (more modern)
		if _, err := exec.LookPath("fcitx5-remote"); err == nil {
			linuxIMEMethod = "fcitx5"
			return
		}
		// Fallback to ibus
		if _, err := exec.LookPath("ibus"); err == nil {
			linuxIMEMethod = "ibus"
			return
		}
		applog.Debug("no IME framework detected (ibus/fcitx5)")
	})
}

// setIMEEnabled controls the IME on Linux via ibus or fcitx5-remote commands.
func setIMEEnabled(enabled bool) {
	detectIMEMethod()

	linuxMu.Lock()
	defer linuxMu.Unlock()

	switch linuxIMEMethod {
	case "fcitx5":
		setIMEFcitx5(enabled)
	case "ibus":
		setIMEIbus(enabled)
	}
}

func setIMEFcitx5(enabled bool) {
	if enabled {
		cmd := exec.Command("fcitx5-remote", "-o")
		if err := cmd.Run(); err != nil {
			applog.Debug("fcitx5-remote -o failed: %v", err)
		}
	} else {
		cmd := exec.Command("fcitx5-remote", "-c")
		if err := cmd.Run(); err != nil {
			applog.Debug("fcitx5-remote -c failed: %v", err)
		}
	}
}

func setIMEIbus(enabled bool) {
	if !enabled {
		// Save current engine
		out, err := exec.Command("ibus", "engine").Output()
		if err == nil {
			engine := strings.TrimSpace(string(out))
			if engine != "" && !strings.HasPrefix(engine, "xkb:") {
				savedEngine = engine
			}
		}
		// Switch to XKB (US English layout)
		cmd := exec.Command("ibus", "engine", "xkb:us::eng")
		if err := cmd.Run(); err != nil {
			applog.Debug("ibus engine switch failed: %v", err)
		}
	} else {
		// Restore saved engine
		if savedEngine != "" {
			cmd := exec.Command("ibus", "engine", savedEngine)
			if err := cmd.Run(); err != nil {
				applog.Debug("ibus engine restore failed: %v", err)
			}
		}
	}
}

// runShellCommand executes a command string via sh on Linux.
func runShellCommand(command string) {
	cmd := exec.Command("sh", "-c", command)
	if err := cmd.Run(); err != nil {
		applog.Debug("focus command failed: %v", err)
	}
}
