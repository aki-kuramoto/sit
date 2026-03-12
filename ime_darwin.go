//go:build darwin

package main

import (
	"fmt"
	"os/exec"
	"sync"
	"unsafe"

	"sit/internal/applog"

	"github.com/ebitengine/purego"
)

// Core Foundation and TIS types (opaque pointers)
type cfStringRef uintptr
type cfArrayRef uintptr
type cfDictionaryRef uintptr
type tisInputSourceRef uintptr

var (
	darwinOnce sync.Once

	// HIToolbox function pointers
	tisCopyCurrentKeyboardInputSource func() tisInputSourceRef
	tisCreateInputSourceList          func(properties cfDictionaryRef, includeAll bool) cfArrayRef
	tisSelectInputSource              func(source tisInputSourceRef) int32
	tisGetInputSourceProperty         func(source tisInputSourceRef, key cfStringRef) uintptr

	// CoreFoundation function pointers
	cfArrayGetCount func(array cfArrayRef) int
	cfArrayGetValueAtIndex func(array cfArrayRef, idx int) uintptr
	cfRelease       func(ref uintptr)
	cfRetain        func(ref uintptr) uintptr

	// Property keys (resolved at init)
	kTISPropertyInputSourceIsASCIICapable cfStringRef
	kTISPropertyInputSourceID             cfStringRef

	// Saved input source for restoration
	savedInputSource tisInputSourceRef
	darwinMu         sync.Mutex
)

func initDarwinIME() {
	darwinOnce.Do(func() {
		hitoolbox, err := purego.Dlopen(
			"/System/Library/Frameworks/Carbon.framework/Versions/A/Frameworks/HIToolbox.framework/Versions/A/HIToolbox",
			purego.RTLD_NOW|purego.RTLD_GLOBAL,
		)
		if err != nil {
			applog.Debug("failed to load HIToolbox: %v", err)
			return
		}

		cf, err := purego.Dlopen(
			"/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation",
			purego.RTLD_NOW|purego.RTLD_GLOBAL,
		)
		if err != nil {
			applog.Debug("failed to load CoreFoundation: %v", err)
			return
		}

		// Register HIToolbox functions
		purego.RegisterLibFunc(&tisCopyCurrentKeyboardInputSource, hitoolbox, "TISCopyCurrentKeyboardInputSource")
		purego.RegisterLibFunc(&tisCreateInputSourceList, hitoolbox, "TISCreateInputSourceList")
		purego.RegisterLibFunc(&tisSelectInputSource, hitoolbox, "TISSelectInputSource")
		purego.RegisterLibFunc(&tisGetInputSourceProperty, hitoolbox, "TISGetInputSourceProperty")

		// Register CoreFoundation functions
		purego.RegisterLibFunc(&cfArrayGetCount, cf, "CFArrayGetCount")
		purego.RegisterLibFunc(&cfArrayGetValueAtIndex, cf, "CFArrayGetValueAtIndex")
		purego.RegisterLibFunc(&cfRelease, cf, "CFRelease")
		purego.RegisterLibFunc(&cfRetain, cf, "CFRetain")

		// Resolve property key symbols
		pASCII, err := purego.Dlsym(hitoolbox, "kTISPropertyInputSourceIsASCIICapable")
		if err == nil {
			kTISPropertyInputSourceIsASCIICapable = cfStringRef(*(*uintptr)(unsafe.Pointer(pASCII)))
		}
		pID, err := purego.Dlsym(hitoolbox, "kTISPropertyInputSourceID")
		if err == nil {
			kTISPropertyInputSourceID = cfStringRef(*(*uintptr)(unsafe.Pointer(pID)))
		}
	})
}

// setIMEEnabled controls the active input source on macOS.
// When disabled, it saves the current source and switches to an ASCII-capable source.
// When enabled, it restores the previously saved source.
func setIMEEnabled(enabled bool) {
	initDarwinIME()

	if tisCopyCurrentKeyboardInputSource == nil || tisSelectInputSource == nil {
		return
	}

	darwinMu.Lock()
	defer darwinMu.Unlock()

	if !enabled {
		// Save current input source and switch to ASCII
		current := tisCopyCurrentKeyboardInputSource()
		if current != 0 {
			// Check if already ASCII-capable
			if isASCIICapable(current) {
				cfRelease(uintptr(current))
				return
			}
			// Release previously saved source
			if savedInputSource != 0 {
				cfRelease(uintptr(savedInputSource))
			}
			savedInputSource = current // takes ownership of the ref
		}
		selectASCIISource()
	} else {
		// Restore saved input source
		if savedInputSource != 0 {
			tisSelectInputSource(savedInputSource)
			cfRelease(uintptr(savedInputSource))
			savedInputSource = 0
		}
	}
}

// isASCIICapable checks if a TIS input source is ASCII-capable.
func isASCIICapable(source tisInputSourceRef) bool {
	if kTISPropertyInputSourceIsASCIICapable == 0 {
		return false
	}
	val := tisGetInputSourceProperty(source, kTISPropertyInputSourceIsASCIICapable)
	// CFBooleanRef: kCFBooleanTrue is non-zero
	return val != 0
}

// selectASCIISource finds and selects an ASCII-capable input source.
func selectASCIISource() {
	// Get list of all enabled input sources
	list := tisCreateInputSourceList(0, false)
	if list == 0 {
		return
	}
	defer cfRelease(uintptr(list))

	count := cfArrayGetCount(list)
	for i := 0; i < count; i++ {
		source := tisInputSourceRef(cfArrayGetValueAtIndex(list, i))
		if source == 0 {
			continue
		}
		if isASCIICapable(source) {
			tisSelectInputSource(source)
			return
		}
	}

	applog.Debug("no ASCII-capable input source found")
}

// runShellCommand executes a command string via sh on macOS.
func runShellCommand(command string) {
	cmd := exec.Command("sh", "-c", command)
	if err := cmd.Run(); err != nil {
		applog.Debug("focus command failed: %v", err)
	}
}

// Ensure fmt is used (for potential future error formatting).
var _ = fmt.Sprintf
