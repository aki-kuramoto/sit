// Package applog provides structured application logging with build-tag separation.
// In production builds (default), Debug and Info are no-ops.
// In debug builds (go build -tags debug), all levels output to stderr.
// Error always outputs to stderr regardless of build mode.
package applog

import (
	"fmt"
	"os"
	"time"
)

// Error logs a message to stderr. Always active in all build modes.
func Error(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	fmt.Fprintf(os.Stderr, "%s [ERROR] %s\n", time.Now().Format("15:04:05"), msg)
}
