//go:build windows

package main

import (
	"syscall"
	"time"
	"unsafe"
)

var (
	modUser32             = syscall.NewLazyDLL("user32.dll")
	procFindWindowW       = modUser32.NewProc("FindWindowW")
	procSetForegroundWnd  = modUser32.NewProc("SetForegroundWindow")
	procEnumChildWindows  = modUser32.NewProc("EnumChildWindows")
	procGetClassNameW     = modUser32.NewProc("GetClassNameW")
	procSetFocus          = modUser32.NewProc("SetFocus")
	procGetWindowThreadID = modUser32.NewProc("GetWindowThreadProcessId")
	procAttachThreadInput = modUser32.NewProc("AttachThreadInput")
	modKernel32           = syscall.NewLazyDLL("kernel32.dll")
	procGetCurrentTID     = modKernel32.NewProc("GetCurrentThreadId")
)

// foundWebView stores the handle found by the child window enumerator.
var foundWebView uintptr

// enumChildProc is the callback for EnumChildWindows.
// It looks for a child window whose class name contains "Chrome_WidgetWin".
func enumChildProc(hwnd uintptr, lParam uintptr) uintptr {
	var className [256]uint16
	procGetClassNameW.Call(hwnd, uintptr(unsafe.Pointer(&className[0])), 256)
	name := syscall.UTF16ToString(className[:])

	// WebView2 uses Chrome_WidgetWin_0 or Chrome_WidgetWin_1
	if len(name) >= 17 && name[:17] == "Chrome_WidgetWin_" {
		foundWebView = hwnd
		return 0 // stop enumeration
	}
	return 1 // continue
}

// forceReactivate finds the WebView2 child window and calls SetFocus on it
// to work around WebView2's keyboard focus issue on initial launch.
func forceReactivate() {
	titlePtr, _ := syscall.UTF16PtrFromString("sit")
	hwnd, _, _ := procFindWindowW.Call(0, uintptr(unsafe.Pointer(titlePtr)))
	if hwnd == 0 {
		return
	}

	// Activate the top-level window
	procSetForegroundWnd.Call(hwnd)
	time.Sleep(50 * time.Millisecond)

	// Find the WebView2 child window
	foundWebView = 0
	cb := syscall.NewCallback(enumChildProc)
	procEnumChildWindows.Call(hwnd, cb, 0)

	if foundWebView == 0 {
		return
	}

	// Attach thread input so SetFocus works across threads
	ourTID, _, _ := procGetCurrentTID.Call()
	targetTID, _, _ := procGetWindowThreadID.Call(foundWebView, 0)
	if ourTID != targetTID && targetTID != 0 {
		procAttachThreadInput.Call(ourTID, targetTID, 1) // attach
		procSetFocus.Call(foundWebView)
		time.Sleep(50 * time.Millisecond)
		procAttachThreadInput.Call(ourTID, targetTID, 0) // detach
	} else {
		procSetFocus.Call(foundWebView)
	}
}
