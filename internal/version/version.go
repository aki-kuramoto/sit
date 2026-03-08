// Package version holds build-time version information injected via ldflags.
//
// Build with:
//
//	go build -ldflags "-X sit/internal/version.Version=0.1.0 -X sit/internal/version.BuildDate=2026-03-08"
package version

import "runtime"

// These variables are set at build time via ldflags.
var (
	Version   = "dev"
	BuildDate = "unknown"
)

// Info returns version information as a map for the frontend.
func Info() map[string]string {
	return map[string]string{
		"version":   Version,
		"buildDate": BuildDate,
		"goVersion": runtime.Version(),
		"os":        runtime.GOOS,
		"arch":      runtime.GOARCH,
	}
}
