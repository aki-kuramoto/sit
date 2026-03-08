//go:build !windows

package main

// forceReactivate is a no-op on non-Windows platforms.
// The WebView2 keyboard focus issue is Windows-specific.
func forceReactivate() {}
