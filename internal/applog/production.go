//go:build !debug

package applog

import (
	"io"
	"log"
)

func init() {
	// Suppress Go standard log output in production (e.g. WebView2 messages).
	// applog.Error uses fmt.Fprintf(os.Stderr) directly and is not affected.
	log.SetOutput(io.Discard)
}

// Debug is a no-op in production builds.
func Debug(_ string, _ ...any) {}

// Info is a no-op in production builds.
func Info(_ string, _ ...any) {}
