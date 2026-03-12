//go:build windows

package main

import (
	"os/exec"
	"syscall"

	"sit/internal/applog"
)

var (
	modImm32                = syscall.NewLazyDLL("imm32.dll")
	procImmGetDefaultIMEWnd = modImm32.NewProc("ImmGetDefaultIMEWnd")

	procSendMessageW  = modUser32.NewProc("SendMessageW")
	procGetFocusWnd   = modUser32.NewProc("GetFocus")
)

const (
	wmIMEControl     = 0x0283 // WM_IME_CONTROL
	imcSetOpenStatus = 0x0006 // IMC_SETOPENSTATUS
)

// setIMEEnabled controls the IME open/close state on Windows.
// WebView2 has multiple window layers, each potentially with its own IME window.
// We send WM_IME_CONTROL to both the Chrome_WidgetWin's IME window and the
// actual focused child window's IME window to ensure the command reaches
// the correct target.
func setIMEEnabled(enabled bool) {
	hwnd := foundWebView
	if hwnd == 0 {
		return
	}

	var flag uintptr
	if enabled {
		flag = 1
	}

	// Send to the IME window associated with Chrome_WidgetWin
	imeWnd, _, _ := procImmGetDefaultIMEWnd.Call(hwnd)
	if imeWnd != 0 {
		procSendMessageW.Call(imeWnd, wmIMEControl, imcSetOpenStatus, flag)
	}

	// Also send to the IME window of the actual focused child window.
	// This often resolves to a different IME window in WebView2.
	targetTID, _, _ := procGetWindowThreadID.Call(hwnd, 0)
	ourTID, _, _ := procGetCurrentTID.Call()
	if targetTID != 0 && ourTID != targetTID {
		procAttachThreadInput.Call(ourTID, targetTID, 1)
		focusWnd, _, _ := procGetFocusWnd.Call()
		if focusWnd != 0 {
			imeWnd2, _, _ := procImmGetDefaultIMEWnd.Call(focusWnd)
			if imeWnd2 != 0 && imeWnd2 != imeWnd {
				procSendMessageW.Call(imeWnd2, wmIMEControl, imcSetOpenStatus, flag)
			}
		}
		procAttachThreadInput.Call(ourTID, targetTID, 0)
	}
}

// runShellCommand executes a command string via cmd.exe on Windows.
// The console window is hidden using CREATE_NO_WINDOW.
func runShellCommand(command string) {
	cmd := exec.Command("cmd", "/c", command)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
	if err := cmd.Run(); err != nil {
		applog.Debug("focus command failed: %v", err)
	}
}
