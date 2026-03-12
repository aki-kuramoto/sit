//go:build !windows && !darwin && !linux

package main

import "sit/internal/applog"

// setIMEEnabled is a no-op on unsupported platforms.
func setIMEEnabled(enabled bool) {}

// runShellCommand is a no-op on unsupported platforms.
func runShellCommand(command string) {
	applog.Debug("runShellCommand not supported on this platform")
}
