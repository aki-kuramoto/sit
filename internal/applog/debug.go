//go:build debug

package applog

import (
	"fmt"
	"os"
	"time"
)

// Debug logs a debug-level message to stderr. Only active in debug builds.
func Debug(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	fmt.Fprintf(os.Stderr, "%s [DEBUG] %s\n", time.Now().Format("15:04:05"), msg)
}

// Info logs an info-level message to stderr. Only active in debug builds.
func Info(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	fmt.Fprintf(os.Stderr, "%s [INFO]  %s\n", time.Now().Format("15:04:05"), msg)
}
